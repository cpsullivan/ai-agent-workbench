/**
 * E2E Tests for Quota Enforcement
 *
 * Tests the complete flow of quota enforcement:
 * 1. Set quota limits
 * 2. Make API calls
 * 3. Verify quota is checked before each call
 * 4. Verify calls are blocked when quota exceeded
 */

import { test, expect } from '@playwright/test';

test.describe('Quota Enforcement E2E', () => {
  let userId: string;
  let organizationId: string;
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');

    userId = await page.evaluate(() => window.localStorage.getItem('user_id') || '');
    organizationId = await page.evaluate(
      () => window.localStorage.getItem('organization_id') || ''
    );
  });

  test('should display quota status on dashboard', async ({ page }) => {
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-usage"]');

    // Verify quota elements are visible
    const quotaLimit = await page.textContent('[data-testid="quota-limit"]');
    const quotaCurrent = await page.textContent('[data-testid="quota-current"]');
    const quotaRemaining = await page.textContent('[data-testid="quota-remaining"]');

    expect(quotaLimit).toContain('$');
    expect(quotaCurrent).toContain('$');
    expect(quotaRemaining).toContain('$');
  });

  test('should show warning when quota above 75%', async ({ page }) => {
    // Set a low quota to trigger warning
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '1.00');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Make API calls to reach 75%
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Quota Warning Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    sessionId = await page.getAttribute('[data-testid="session-active"]', 'data-session-id') || '';

    // Make enough calls to reach 75%
    // Assuming ~$0.01 per call, need about 75 calls
    for (let i = 0; i < 75; i++) {
      await page.fill('textarea[name="message"]', `Call ${i + 1}`);
      await page.click('button[data-testid="send-message"]');
      await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

      // Check if warning appears
      const warning = await page.$('[data-testid="quota-warning"]');
      if (warning) {
        break; // Warning appeared, stop
      }

      await page.waitForTimeout(500);
    }

    // Navigate to analytics
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-usage"]');

    // Verify warning is displayed
    const warning = await page.$('[data-testid="quota-warning"]');
    expect(warning).toBeTruthy();

    const warningText = await warning?.textContent();
    expect(warningText).toContain('Approaching quota limit');
  });

  test('should block API call when quota exceeded', async ({ page }) => {
    // Set a very low quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '0.05');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Create session
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Quota Block Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Make calls until quota exceeded
    let quotaExceeded = false;
    for (let i = 0; i < 10; i++) {
      await page.fill('textarea[name="message"]', `Call ${i + 1}`);
      await page.click('button[data-testid="send-message"]');

      // Wait for either response or error
      try {
        await page.waitForSelector(
          '[data-testid="ai-response"], [data-testid="quota-error"]',
          { timeout: 10000 }
        );

        // Check if quota error appeared
        const quotaError = await page.$('[data-testid="quota-error"]');
        if (quotaError) {
          quotaExceeded = true;
          const errorText = await quotaError.textContent();
          expect(errorText).toContain('Quota exceeded');
          break;
        }

        await page.waitForTimeout(500);
      } catch (error) {
        // Timeout waiting for response
        break;
      }
    }

    expect(quotaExceeded).toBe(true);
  });

  test('should display quota exceeded message to user', async ({ page }) => {
    // Set quota to $0.01 (will be exceeded immediately)
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '0.01');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Reset current usage to trigger immediate block
    await page.evaluate(async () => {
      // Call API to reset quota usage
      await fetch('/api/admin/reset-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: window.localStorage.getItem('organization_id') }),
      });
    });

    // Make one expensive call
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Immediate Block Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // First call should succeed
    await page.fill('textarea[name="message"]', 'First call');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Second call should fail
    await page.fill('textarea[name="message"]', 'Second call');
    await page.click('button[data-testid="send-message"]');

    // Wait for quota error
    await page.waitForSelector('[data-testid="quota-error"]', { timeout: 10000 });

    const errorMessage = await page.textContent('[data-testid="quota-error"]');
    expect(errorMessage).toContain('quota exceeded');
    expect(errorMessage).toContain('upgrade');
  });

  test('should respect provider-specific quotas', async ({ page }) => {
    // Set provider-specific quota for OpenAI
    await page.goto('/settings/organization/quotas');
    await page.click('button:has-text("Add Provider Quota")');
    await page.selectOption('select[name="provider"]', 'openai');
    await page.fill('input[name="provider_quota"]', '0.05');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Create session with OpenAI
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Provider Quota Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Make calls until OpenAI quota exceeded
    let quotaExceeded = false;
    for (let i = 0; i < 10; i++) {
      await page.fill('textarea[name="message"]', `OpenAI call ${i + 1}`);
      await page.click('button[data-testid="send-message"]');

      await page.waitForSelector(
        '[data-testid="ai-response"], [data-testid="quota-error"]',
        { timeout: 10000 }
      );

      const quotaError = await page.$('[data-testid="quota-error"]');
      if (quotaError) {
        quotaExceeded = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    expect(quotaExceeded).toBe(true);

    // Verify Anthropic still works
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Anthropic Test');
    await page.selectOption('select[name="model"]', 'claude-3-5-sonnet-20241022');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    await page.fill('textarea[name="message"]', 'Anthropic call');
    await page.click('button[data-testid="send-message"]');

    // Should succeed
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });
    const response = await page.textContent('[data-testid="ai-response"]');
    expect(response).toBeTruthy();
  });

  test('should respect model-specific quotas', async ({ page }) => {
    // Set model-specific quota for GPT-4
    await page.goto('/settings/organization/quotas');
    await page.click('button:has-text("Add Model Quota")');
    await page.selectOption('select[name="provider"]', 'openai');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.fill('input[name="model_quota"]', '0.05');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Create session with GPT-4
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Model Quota Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Exhaust GPT-4 quota
    let quotaExceeded = false;
    for (let i = 0; i < 10; i++) {
      await page.fill('textarea[name="message"]', `GPT-4 call ${i + 1}`);
      await page.click('button[data-testid="send-message"]');

      await page.waitForSelector(
        '[data-testid="ai-response"], [data-testid="quota-error"]',
        { timeout: 10000 }
      );

      const quotaError = await page.$('[data-testid="quota-error"]');
      if (quotaError) {
        quotaExceeded = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    expect(quotaExceeded).toBe(true);

    // Verify GPT-3.5-turbo still works
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'GPT-3.5 Test');
    await page.selectOption('select[name="model"]', 'gpt-3.5-turbo');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    await page.fill('textarea[name="message"]', 'GPT-3.5 call');
    await page.click('button[data-testid="send-message"]');

    // Should succeed
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });
    const response = await page.textContent('[data-testid="ai-response"]');
    expect(response).toBeTruthy();
  });

  test('should reset daily quota at midnight', async ({ page }) => {
    // Set daily quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '10.00');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Check quota reset time
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-reset-time"]');

    const resetTime = await page.textContent('[data-testid="quota-reset-time"]');
    expect(resetTime).toContain('Resets at');

    // Parse reset time
    const resetDate = new Date(resetTime?.replace('Resets at ', '') || '');
    const now = new Date();

    // Reset should be at next midnight
    expect(resetDate.getHours()).toBe(0);
    expect(resetDate.getMinutes()).toBe(0);
    expect(resetDate > now).toBe(true);
  });

  test('should reset monthly quota at start of month', async ({ page }) => {
    // Set monthly quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="monthly_quota"]', '100.00');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Check quota reset time
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-reset-time"]');

    const resetTime = await page.textContent(
      '[data-testid="quota-reset-time"][data-type="monthly"]'
    );
    expect(resetTime).toContain('Resets at');

    // Parse reset time
    const resetDate = new Date(resetTime?.replace('Resets at ', '') || '');

    // Reset should be at start of next month
    expect(resetDate.getDate()).toBe(1);
    expect(resetDate.getHours()).toBe(0);
    expect(resetDate.getMinutes()).toBe(0);
  });

  test('should show most restrictive quota when multiple apply', async ({ page }) => {
    // Set multiple quotas
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '10.00'); // More restrictive
    await page.fill('input[name="monthly_quota"]', '100.00');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Check which quota is shown as active
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="active-quota"]');

    const activeQuota = await page.textContent('[data-testid="active-quota"]');
    expect(activeQuota).toContain('Daily');
    expect(activeQuota).toContain('$10.00');
  });

  test('should pre-check quota before API call', async ({ page }) => {
    // Set very low quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '0.001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Try to make a call
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Pre-check Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Fill message and click send
    await page.fill('textarea[name="message"]', 'This should be blocked');
    await page.click('button[data-testid="send-message"]');

    // Should show quota error immediately (before making API call)
    await page.waitForSelector('[data-testid="quota-error"]', { timeout: 2000 });

    const errorMessage = await page.textContent('[data-testid="quota-error"]');
    expect(errorMessage).toContain('quota exceeded');

    // Verify no AI response was generated
    const response = await page.$('[data-testid="ai-response"]');
    expect(response).toBeNull();
  });

  test('should allow admins to bypass quotas', async ({ page }) => {
    // Set very low quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '0.001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Enable admin bypass
    await page.check('input[name="admin_bypass"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Make API call as admin
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Admin Bypass Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    await page.fill('textarea[name="message"]', 'Admin bypass test');
    await page.click('button[data-testid="send-message"]');

    // Should succeed despite quota
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });
    const response = await page.textContent('[data-testid="ai-response"]');
    expect(response).toBeTruthy();
  });

  test('should log quota violations', async ({ page }) => {
    // Set low quota
    await page.goto('/settings/organization/quotas');
    await page.fill('input[name="daily_quota"]', '0.05');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Make calls until blocked
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Violation Log Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    let quotaExceeded = false;
    for (let i = 0; i < 10; i++) {
      await page.fill('textarea[name="message"]', `Call ${i + 1}`);
      await page.click('button[data-testid="send-message"]');

      await page.waitForSelector(
        '[data-testid="ai-response"], [data-testid="quota-error"]',
        { timeout: 10000 }
      );

      const quotaError = await page.$('[data-testid="quota-error"]');
      if (quotaError) {
        quotaExceeded = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    expect(quotaExceeded).toBe(true);

    // Check violation logs
    await page.goto('/analytics/quota-violations');
    await page.waitForSelector('[data-testid="violation-log"]');

    const violations = await page.$$('[data-testid="violation-log"]');
    expect(violations.length).toBeGreaterThan(0);

    // Verify violation details
    const firstViolation = violations[0];
    const violationText = await firstViolation.textContent();
    expect(violationText).toContain(organizationId);
    expect(violationText).toContain('gpt-4');
  });
});

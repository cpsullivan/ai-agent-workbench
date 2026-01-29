/**
 * E2E Tests for Usage Logging
 *
 * Tests the complete flow of AI API usage tracking:
 * 1. Make AI API call
 * 2. Usage gets logged to database
 * 3. Cost is calculated correctly
 * 4. Quota is updated
 */

import { test, expect } from '@playwright/test';

test.describe('Usage Logging E2E', () => {
  let userId: string;
  let organizationId: string;
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('/');

    // Extract user and org IDs from page context
    userId = await page.evaluate(() => window.localStorage.getItem('user_id') || '');
    organizationId = await page.evaluate(
      () => window.localStorage.getItem('organization_id') || ''
    );

    // Create a test session
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Test Usage Tracking');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');

    // Wait for session creation
    await page.waitForSelector('[data-testid="session-active"]');

    sessionId = await page.getAttribute('[data-testid="session-active"]', 'data-session-id') || '';
  });

  test('should log usage when AI API is called', async ({ page }) => {
    // Send a message to trigger AI API call
    await page.fill('textarea[name="message"]', 'Hello, AI!');
    await page.click('button[data-testid="send-message"]');

    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Navigate to usage dashboard
    await page.goto('/analytics/usage');

    // Wait for data to load
    await page.waitForSelector('[data-testid="total-cost"]');

    // Verify usage was logged
    const totalCalls = await page.textContent('[data-testid="total-calls"]');
    expect(parseInt(totalCalls || '0')).toBeGreaterThan(0);

    // Verify cost was calculated
    const totalCost = await page.textContent('[data-testid="total-cost"]');
    expect(totalCost).toContain('$');
    expect(parseFloat(totalCost?.replace(/[$,]/g, '') || '0')).toBeGreaterThan(0);
  });

  test('should track tokens correctly for OpenAI', async ({ page }) => {
    // Send a short message
    await page.fill('textarea[name="message"]', 'Hi');
    await page.click('button[data-testid="send-message"]');

    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Navigate to usage dashboard
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="total-tokens"]');

    // Verify tokens were tracked
    const totalTokens = await page.textContent('[data-testid="total-tokens"]');
    expect(parseInt(totalTokens?.replace(/,/g, '') || '0')).toBeGreaterThan(0);

    // Input tokens should be less than output tokens for a simple "Hi" message
    const inputTokens = await page.getAttribute(
      '[data-testid="usage-log"]:last-child',
      'data-input-tokens'
    );
    const outputTokens = await page.getAttribute(
      '[data-testid="usage-log"]:last-child',
      'data-output-tokens'
    );

    expect(parseInt(inputTokens || '0')).toBeGreaterThan(0);
    expect(parseInt(outputTokens || '0')).toBeGreaterThan(parseInt(inputTokens || '0'));
  });

  test('should calculate cost based on GPT-4 pricing', async ({ page }) => {
    // Send a message
    await page.fill('textarea[name="message"]', 'Tell me a short story');
    await page.click('button[data-testid="send-message"]');

    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 15000 });

    // Navigate to usage breakdown
    await page.goto('/analytics/usage');
    await page.click('button:has-text("Show Detailed Breakdown")');

    // Wait for breakdown to load
    await page.waitForSelector('[data-testid="cost-breakdown"]');

    // Check GPT-4 cost
    const gpt4Cost = await page.textContent(
      '[data-testid="model-cost"][data-model="gpt-4"]'
    );

    expect(gpt4Cost).toContain('$');

    // GPT-4 pricing: $0.03/1K input, $0.06/1K output
    // For ~100 tokens, cost should be around $0.003-0.009
    const cost = parseFloat(gpt4Cost?.replace(/[$,]/g, '') || '0');
    expect(cost).toBeGreaterThan(0.001);
    expect(cost).toBeLessThan(0.1);
  });

  test('should update quota after usage', async ({ page }) => {
    // Check initial quota
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-current"]');

    const initialUsage = await page.textContent('[data-testid="quota-current"]');
    const initialValue = parseFloat(initialUsage?.replace(/[$,]/g, '') || '0');

    // Make API call
    await page.goto(`/sessions/${sessionId}`);
    await page.fill('textarea[name="message"]', 'Test quota update');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Check updated quota
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="quota-current"]');

    const updatedUsage = await page.textContent('[data-testid="quota-current"]');
    const updatedValue = parseFloat(updatedUsage?.replace(/[$,]/g, '') || '0');

    // Usage should have increased
    expect(updatedValue).toBeGreaterThan(initialValue);
  });

  test('should log usage for multiple providers', async ({ page }) => {
    // Create session with OpenAI
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'OpenAI Test');
    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Send message
    await page.fill('textarea[name="message"]', 'OpenAI test');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Create session with Anthropic
    await page.goto('/sessions/new');
    await page.fill('input[name="session_name"]', 'Anthropic Test');
    await page.selectOption('select[name="model"]', 'claude-3-5-sonnet-20241022');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="session-active"]');

    // Send message
    await page.fill('textarea[name="message"]', 'Anthropic test');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Check analytics
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="provider-breakdown"]');

    // Verify both providers are tracked
    const openaiCost = await page.textContent(
      '[data-testid="provider-cost"][data-provider="openai"]'
    );
    const anthropicCost = await page.textContent(
      '[data-testid="provider-cost"][data-provider="anthropic"]'
    );

    expect(openaiCost).toContain('$');
    expect(anthropicCost).toContain('$');
    expect(parseFloat(openaiCost?.replace(/[$,]/g, '') || '0')).toBeGreaterThan(0);
    expect(parseFloat(anthropicCost?.replace(/[$,]/g, '') || '0')).toBeGreaterThan(0);
  });

  test('should display usage in real-time', async ({ page }) => {
    // Open two tabs - one for session, one for analytics
    const analyticsPage = await page.context().newPage();
    await analyticsPage.goto('/analytics/usage');
    await analyticsPage.waitForSelector('[data-testid="total-calls"]');

    const initialCalls = await analyticsPage.textContent('[data-testid="total-calls"]');

    // Make API call in session page
    await page.goto(`/sessions/${sessionId}`);
    await page.fill('textarea[name="message"]', 'Real-time test');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Wait for real-time update (30 second auto-refresh)
    await analyticsPage.waitForTimeout(31000);

    const updatedCalls = await analyticsPage.textContent('[data-testid="total-calls"]');

    // Call count should have increased
    expect(parseInt(updatedCalls || '0')).toBeGreaterThan(
      parseInt(initialCalls || '0')
    );

    await analyticsPage.close();
  });

  test('should export usage data to CSV', async ({ page }) => {
    // Make some API calls first
    await page.goto(`/sessions/${sessionId}`);
    for (let i = 0; i < 3; i++) {
      await page.fill('textarea[name="message"]', `Test message ${i + 1}`);
      await page.click('button[data-testid="send-message"]');
      await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });
      await page.waitForTimeout(2000);
    }

    // Navigate to analytics
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="total-calls"]');

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.click('button:has-text("Export to CSV")');

    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toContain('.csv');
    expect(download.suggestedFilename()).toContain('usage');

    // Verify CSV content
    const path = await download.path();
    const fs = await import('fs');
    const content = fs.readFileSync(path!, 'utf-8');

    expect(content).toContain('Provider');
    expect(content).toContain('Model');
    expect(content).toContain('Cost');
    expect(content).toContain('Tokens');
    expect(content.split('\n').length).toBeGreaterThan(3); // Header + at least 3 rows
  });

  test('should track usage by session', async ({ page }) => {
    // Make call in current session
    await page.goto(`/sessions/${sessionId}`);
    await page.fill('textarea[name="message"]', 'Session tracking test');
    await page.click('button[data-testid="send-message"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });

    // Navigate to analytics filtered by session
    await page.goto(`/analytics/usage?session_id=${sessionId}`);
    await page.waitForSelector('[data-testid="total-calls"]');

    // Verify usage is shown
    const totalCalls = await page.textContent('[data-testid="total-calls"]');
    expect(parseInt(totalCalls || '0')).toBeGreaterThanOrEqual(1);

    // Verify session filter is applied
    const sessionFilter = await page.inputValue('input[name="session_id"]');
    expect(sessionFilter).toBe(sessionId);
  });

  test('should handle failed API calls gracefully', async ({ page }) => {
    // Configure invalid API key to simulate failure
    await page.goto('/settings/secrets');
    await page.fill('input[name="OPENAI_API_KEY"]', 'invalid-key');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="success-message"]');

    // Try to make API call
    await page.goto(`/sessions/${sessionId}`);
    await page.fill('textarea[name="message"]', 'This will fail');
    await page.click('button[data-testid="send-message"]');

    // Wait for error
    await page.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });

    // Check analytics - failed calls should not be logged
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="total-calls"]');

    // Navigate to logs page
    await page.click('button:has-text("Show Detailed Breakdown")');
    await page.waitForSelector('[data-testid="usage-logs"]');

    // Verify no log entry for failed call
    const logs = await page.$$('[data-testid="usage-log"]');
    const logTexts = await Promise.all(
      logs.map((log) => log.textContent())
    );

    const hasFailedEntry = logTexts.some((text) =>
      text?.includes('This will fail')
    );
    expect(hasFailedEntry).toBe(false);
  });

  test('should aggregate costs correctly across multiple calls', async ({ page }) => {
    // Make multiple API calls
    const messages = [
      'First call',
      'Second call',
      'Third call',
      'Fourth call',
      'Fifth call',
    ];

    await page.goto(`/sessions/${sessionId}`);

    for (const message of messages) {
      await page.fill('textarea[name="message"]', message);
      await page.click('button[data-testid="send-message"]');
      await page.waitForSelector('[data-testid="ai-response"]', { timeout: 10000 });
      await page.waitForTimeout(1000);
    }

    // Check aggregated costs
    await page.goto('/analytics/usage');
    await page.waitForSelector('[data-testid="total-cost"]');

    const totalCost = await page.textContent('[data-testid="total-cost"]');
    const totalCalls = await page.textContent('[data-testid="total-calls"]');

    expect(parseInt(totalCalls || '0')).toBeGreaterThanOrEqual(5);

    // Average cost per call should be reasonable
    const cost = parseFloat(totalCost?.replace(/[$,]/g, '') || '0');
    const calls = parseInt(totalCalls || '0');
    const avgCostPerCall = cost / calls;

    expect(avgCostPerCall).toBeGreaterThan(0.001); // At least $0.001 per call
    expect(avgCostPerCall).toBeLessThan(0.5); // Less than $0.50 per call
  });
});

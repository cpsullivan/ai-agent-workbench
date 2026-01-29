/**
 * E2E Tests for Multi-User Session Collaboration
 *
 * Tests real-time collaboration with two users editing the same session
 */

import { test, expect, Page } from '@playwright/test';

// Helper to login as a user
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

// Helper to create a session
async function createSession(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.click('button:has-text("New Session")');
  await page.fill('input[placeholder*="Session name"]', name);
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/session\/.+/);

  // Extract session ID from URL
  const url = page.url();
  const match = url.match(/\/session\/([^/]+)/);
  return match ? match[1] : '';
}

test.describe('Multi-User Session Collaboration', () => {
  let user1Page: Page;
  let user2Page: Page;
  let sessionId: string;

  test.beforeAll(async ({ browser }) => {
    // Create two browser contexts for two different users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    user1Page = await context1.newPage();
    user2Page = await context2.newPage();

    // Login both users
    await login(user1Page, 'user1@example.com', 'password123');
    await login(user2Page, 'user2@example.com', 'password123');
  });

  test.afterAll(async () => {
    await user1Page.close();
    await user2Page.close();
  });

  test('User 1 creates a session and invites User 2', async () => {
    // User 1 creates a session
    sessionId = await createSession(user1Page, 'Collaboration Test Session');
    expect(sessionId).toBeTruthy();

    // User 1 clicks invite button
    await user1Page.click('button:has-text("+ Invite")');

    // Fill in User 2's email
    await user1Page.fill('input[type="email"]', 'user2@example.com');
    await user1Page.selectOption('select', 'editor');
    await user1Page.click('button:has-text("Send Invite")');

    // Wait for success message
    await expect(user1Page.locator('text=User invited successfully')).toBeVisible();
  });

  test('User 2 can access the invited session', async () => {
    // User 2 navigates to the session
    await user2Page.goto(`/session/${sessionId}`);

    // Should see session name
    await expect(user2Page.locator('text=Collaboration Test Session')).toBeVisible();
  });

  test('Both users see each other in presence indicator', async () => {
    // User 1 should see User 2's avatar
    await expect(user1Page.locator('[data-testid="presence-indicator"]')).toContainText('U2');

    // User 2 should see User 1's avatar
    await expect(user2Page.locator('[data-testid="presence-indicator"]')).toContainText('U1');
  });

  test('User 1 adds a message and User 2 sees it in real-time', async () => {
    // User 1 types and sends a message
    await user1Page.fill('textarea[placeholder*="message"]', 'Hello from User 1!');
    await user1Page.click('button:has-text("Send")');

    // User 1 sees their message
    await expect(user1Page.locator('text=Hello from User 1!')).toBeVisible();

    // User 2 sees the message in real-time (within 2 seconds)
    await expect(user2Page.locator('text=Hello from User 1!')).toBeVisible({ timeout: 2000 });
  });

  test('User 2 adds a message and User 1 sees it in real-time', async () => {
    // User 2 types and sends a message
    await user2Page.fill('textarea[placeholder*="message"]', 'Hello from User 2!');
    await user2Page.click('button:has-text("Send")');

    // User 2 sees their message
    await expect(user2Page.locator('text=Hello from User 2!')).toBeVisible();

    // User 1 sees the message in real-time
    await expect(user1Page.locator('text=Hello from User 2!')).toBeVisible({ timeout: 2000 });
  });

  test('Both users see the same message order', async () => {
    // Get message order from User 1's view
    const user1Messages = await user1Page.locator('[data-testid="message"]').allTextContents();

    // Get message order from User 2's view
    const user2Messages = await user2Page.locator('[data-testid="message"]').allTextContents();

    // Both should see the same order
    expect(user1Messages).toEqual(user2Messages);
  });

  test('User presence updates when user leaves', async () => {
    // User 2 closes the tab
    await user2Page.close();

    // Wait for heartbeat timeout (2 minutes)
    // In test, we can check after a few seconds if presence is marked as offline
    await user1Page.waitForTimeout(5000);

    // User 1 should see User 2 is no longer active
    const presenceIndicator = user1Page.locator('[data-testid="presence-indicator"]');
    const user2Avatar = presenceIndicator.locator('text=U2');

    // User 2's avatar should not have green online indicator
    const hasGreenDot = await user2Avatar.locator('.bg-green-500').count();
    expect(hasGreenDot).toBe(0);
  });

  test('Concurrent edits are handled correctly', async () => {
    // Recreate User 2 page
    const browser = user1Page.context().browser()!;
    const context2 = await browser.newContext();
    user2Page = await context2.newPage();
    await login(user2Page, 'user2@example.com', 'password123');
    await user2Page.goto(`/session/${sessionId}`);

    // Both users try to add messages at the same time
    await Promise.all([
      user1Page.fill('textarea[placeholder*="message"]', 'Concurrent message from User 1'),
      user2Page.fill('textarea[placeholder*="message"]', 'Concurrent message from User 2'),
    ]);

    await Promise.all([
      user1Page.click('button:has-text("Send")'),
      user2Page.click('button:has-text("Send")'),
    ]);

    // Both messages should appear for both users
    await expect(user1Page.locator('text=Concurrent message from User 1')).toBeVisible();
    await expect(user1Page.locator('text=Concurrent message from User 2')).toBeVisible({ timeout: 2000 });

    await expect(user2Page.locator('text=Concurrent message from User 1')).toBeVisible({ timeout: 2000 });
    await expect(user2Page.locator('text=Concurrent message from User 2')).toBeVisible();
  });

  test('User can add comments on the session', async () => {
    // User 1 clicks comments button
    await user1Page.click('button:has-text("💬 Comments")');

    // Comment section should be visible
    await expect(user1Page.locator('[data-testid="comment-thread"]')).toBeVisible();

    // Add a comment
    await user1Page.fill('textarea[placeholder*="comment"]', 'Great session!');
    await user1Page.click('button:has-text("Post")');

    // Comment should appear
    await expect(user1Page.locator('text=Great session!')).toBeVisible();
  });

  test('User 2 sees comment from User 1 in real-time', async () => {
    // User 2 opens comments
    await user2Page.click('button:has-text("💬 Comments")');

    // Should see User 1's comment
    await expect(user2Page.locator('text=Great session!')).toBeVisible({ timeout: 2000 });
  });

  test('User can edit their own comment', async () => {
    // User 1 edits their comment
    await user1Page.locator('[data-testid="comment"]').hover();
    await user1Page.click('button[title="Edit"]');
    await user1Page.fill('textarea', 'Updated comment!');
    await user1Page.click('button:has-text("Save")');

    // Updated comment should appear
    await expect(user1Page.locator('text=Updated comment!')).toBeVisible();

    // User 2 sees the updated comment
    await expect(user2Page.locator('text=Updated comment!')).toBeVisible({ timeout: 2000 });
  });

  test('User cannot edit another user\'s comment', async () => {
    // User 2 hovers over User 1's comment
    await user2Page.locator('[data-testid="comment"]').hover();

    // Edit button should not be visible for User 2
    const editButton = user2Page.locator('button[title="Edit"]');
    expect(await editButton.count()).toBe(0);
  });

  test('Viewer role cannot edit messages', async () => {
    // User 1 changes User 2's role to viewer
    await user1Page.click('button:has-text("+ Invite")'); // Opens collaborator list
    await user1Page.selectOption(`select[data-user-id="${await user2Page.evaluate(() => window.localStorage.getItem('user_id'))}"]`, 'viewer');

    // User 2 refreshes
    await user2Page.reload();

    // Message input should be disabled for viewer
    const messageInput = user2Page.locator('textarea[placeholder*="message"]');
    expect(await messageInput.isDisabled()).toBe(true);
  });

  test('Session state persists after refresh', async () => {
    // Get current message count
    const messageCountBefore = await user1Page.locator('[data-testid="message"]').count();

    // User 1 refreshes
    await user1Page.reload();

    // Wait for session to load
    await user1Page.waitForSelector('[data-testid="message"]');

    // Message count should be the same
    const messageCountAfter = await user1Page.locator('[data-testid="message"]').count();
    expect(messageCountAfter).toBe(messageCountBefore);
  });
});

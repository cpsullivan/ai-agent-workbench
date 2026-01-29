/**
 * E2E Tests for Multi-User Workflow Collaboration
 *
 * Tests real-time collaboration with two users editing the same workflow
 * Focus on Operational Transform for concurrent node edits
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

// Helper to create a workflow
async function createWorkflow(page: Page, name: string): Promise<string> {
  await page.goto('/workflows');
  await page.click('button:has-text("New Workflow")');
  await page.fill('input[placeholder*="Workflow name"]', name);
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workflow\/.+/);

  // Extract workflow ID from URL
  const url = page.url();
  const match = url.match(/\/workflow\/([^/]+)/);
  return match ? match[1] : '';
}

// Helper to add a node to the workflow
async function addNode(page: Page, nodeType: string) {
  await page.click('button:has-text("Add Node")');
  await page.click(`button:has-text("${nodeType}")`);
}

// Helper to get node count
async function getNodeCount(page: Page): Promise<number> {
  return await page.locator('[data-testid="workflow-node"]').count();
}

test.describe('Multi-User Workflow Collaboration', () => {
  let user1Page: Page;
  let user2Page: Page;
  let workflowId: string;

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

  test('User 1 creates a workflow and invites User 2', async () => {
    // User 1 creates a workflow
    workflowId = await createWorkflow(user1Page, 'Collaboration Test Workflow');
    expect(workflowId).toBeTruthy();

    // User 1 clicks invite button
    await user1Page.click('button:has-text("+ Invite")');

    // Fill in User 2's email
    await user1Page.fill('input[type="email"]', 'user2@example.com');
    await user1Page.selectOption('select', 'editor');
    await user1Page.click('button:has-text("Send Invite")');

    // Wait for success message
    await expect(user1Page.locator('text=User invited successfully')).toBeVisible();
  });

  test('User 2 can access the invited workflow', async () => {
    // User 2 navigates to the workflow
    await user2Page.goto(`/workflow/${workflowId}`);

    // Should see workflow name
    await expect(user2Page.locator('text=Collaboration Test Workflow')).toBeVisible();
  });

  test('Both users see each other in presence indicator', async () => {
    // User 1 should see User 2's avatar
    await expect(user1Page.locator('[data-testid="presence-indicator"]')).toContainText('U2');

    // User 2 should see User 1's avatar
    await expect(user2Page.locator('[data-testid="presence-indicator"]')).toContainText('U1');
  });

  test('User 1 adds a node and User 2 sees it in real-time', async () => {
    // Get initial node count
    const initialCount = await getNodeCount(user1Page);

    // User 1 adds a function node
    await addNode(user1Page, 'Function');

    // User 1 sees the new node
    await expect(user1Page.locator('[data-testid="workflow-node"]')).toHaveCount(initialCount + 1);

    // User 2 sees the new node in real-time
    await expect(user2Page.locator('[data-testid="workflow-node"]')).toHaveCount(initialCount + 1, { timeout: 2000 });
  });

  test('User 2 adds a node and User 1 sees it in real-time', async () => {
    // Get current node count
    const currentCount = await getNodeCount(user2Page);

    // User 2 adds an API call node
    await addNode(user2Page, 'API Call');

    // User 2 sees the new node
    await expect(user2Page.locator('[data-testid="workflow-node"]')).toHaveCount(currentCount + 1);

    // User 1 sees the new node in real-time
    await expect(user1Page.locator('[data-testid="workflow-node"]')).toHaveCount(currentCount + 1, { timeout: 2000 });
  });

  test('Concurrent node additions are handled correctly with OT', async () => {
    // Get current node count
    const currentCount = await getNodeCount(user1Page);

    // Both users add nodes at the same time
    await Promise.all([
      addNode(user1Page, 'Function'),
      addNode(user2Page, 'Condition'),
    ]);

    // Both users should see both new nodes (OT should resolve)
    await expect(user1Page.locator('[data-testid="workflow-node"]')).toHaveCount(currentCount + 2, { timeout: 3000 });
    await expect(user2Page.locator('[data-testid="workflow-node"]')).toHaveCount(currentCount + 2, { timeout: 3000 });
  });

  test('Node removal is synced in real-time', async () => {
    // User 1 selects a node
    const node = user1Page.locator('[data-testid="workflow-node"]').first();
    await node.click();

    // User 1 deletes the node
    await user1Page.keyboard.press('Delete');

    // Get updated count
    const user1Count = await getNodeCount(user1Page);

    // User 2 sees the removal
    await expect(user2Page.locator('[data-testid="workflow-node"]')).toHaveCount(user1Count, { timeout: 2000 });
  });

  test('Live cursors show other users positions', async () => {
    // User 2 moves mouse to a specific position
    await user2Page.mouse.move(500, 300);

    // User 1 should see User 2's cursor
    await expect(user1Page.locator('[data-testid="live-cursor-user-2"]')).toBeVisible({ timeout: 2000 });

    // Cursor should be near the position (within 50px tolerance)
    const cursorBox = await user1Page.locator('[data-testid="live-cursor-user-2"]').boundingBox();
    expect(cursorBox?.x).toBeGreaterThan(450);
    expect(cursorBox?.x).toBeLessThan(550);
  });

  test('Cursor label shows user name', async () => {
    // User 1 should see User 2's name on the cursor
    const cursorLabel = user1Page.locator('[data-testid="live-cursor-user-2"] text=User 2');
    await expect(cursorLabel).toBeVisible();
  });

  test('Node edits are synced in real-time', async () => {
    // User 1 clicks on a node to edit
    const node = user1Page.locator('[data-testid="workflow-node"]').first();
    await node.dblclick();

    // User 1 changes node label
    await user1Page.fill('input[placeholder*="Node label"]', 'Updated Node Label');
    await user1Page.click('button:has-text("Save")');

    // User 2 sees the updated label
    await expect(user2Page.locator('text=Updated Node Label')).toBeVisible({ timeout: 2000 });
  });

  test('Concurrent edits to different nodes do not conflict', async () => {
    // Ensure we have at least 2 nodes
    const nodeCount = await getNodeCount(user1Page);
    if (nodeCount < 2) {
      await addNode(user1Page, 'Function');
      await addNode(user1Page, 'Condition');
    }

    // User 1 edits first node
    const user1Node = user1Page.locator('[data-testid="workflow-node"]').first();
    await user1Node.dblclick();
    await user1Page.fill('input[placeholder*="Node label"]', 'User 1 Node');
    await user1Page.click('button:has-text("Save")');

    // User 2 edits second node
    const user2Node = user2Page.locator('[data-testid="workflow-node"]').nth(1);
    await user2Node.dblclick();
    await user2Page.fill('input[placeholder*="Node label"]', 'User 2 Node');
    await user2Page.click('button:has-text("Save")');

    // Both edits should be preserved
    await expect(user1Page.locator('text=User 1 Node')).toBeVisible();
    await expect(user1Page.locator('text=User 2 Node')).toBeVisible({ timeout: 2000 });

    await expect(user2Page.locator('text=User 1 Node')).toBeVisible({ timeout: 2000 });
    await expect(user2Page.locator('text=User 2 Node')).toBeVisible();
  });

  test('Concurrent edits to same node use last-write-wins', async () => {
    // Both users edit the same node at the same time
    const node = user1Page.locator('[data-testid="workflow-node"]').first();
    await node.dblclick();

    // User 1 types
    await user1Page.fill('input[placeholder*="Node label"]', 'User 1 Edit');

    // User 2 opens the same node
    const sameNode = user2Page.locator('[data-testid="workflow-node"]').first();
    await sameNode.dblclick();
    await user2Page.fill('input[placeholder*="Node label"]', 'User 2 Edit');

    // User 2 saves slightly later (last write)
    await user1Page.click('button:has-text("Save")');
    await user2Page.waitForTimeout(100);
    await user2Page.click('button:has-text("Save")');

    // Last write (User 2) should win
    await expect(user1Page.locator('text=User 2 Edit')).toBeVisible({ timeout: 3000 });
    await expect(user2Page.locator('text=User 2 Edit')).toBeVisible();
  });

  test('Comment on workflow is synced in real-time', async () => {
    // User 1 opens comments
    await user1Page.click('button:has-text("💬 Comments")');

    // Add a comment
    await user1Page.fill('textarea[placeholder*="comment"]', 'Great workflow!');
    await user1Page.click('button:has-text("Post")');

    // Comment should appear
    await expect(user1Page.locator('text=Great workflow!')).toBeVisible();

    // User 2 opens comments
    await user2Page.click('button:has-text("💬 Comments")');

    // User 2 sees the comment
    await expect(user2Page.locator('text=Great workflow!')).toBeVisible({ timeout: 2000 });
  });

  test('Workflow execution is visible to all collaborators', async () => {
    // User 1 runs the workflow
    await user1Page.click('button:has-text("Run Workflow")');

    // Both users see execution status
    await expect(user1Page.locator('text=Running...')).toBeVisible();
    await expect(user2Page.locator('text=Running...')).toBeVisible({ timeout: 2000 });

    // Wait for completion
    await expect(user1Page.locator('text=Completed')).toBeVisible({ timeout: 10000 });
    await expect(user2Page.locator('text=Completed')).toBeVisible({ timeout: 2000 });
  });

  test('Workflow state persists after refresh', async () => {
    // Get current node count
    const nodeCountBefore = await getNodeCount(user1Page);

    // User 1 refreshes
    await user1Page.reload();

    // Wait for workflow to load
    await user1Page.waitForSelector('[data-testid="workflow-node"]');

    // Node count should be the same
    const nodeCountAfter = await getNodeCount(user1Page);
    expect(nodeCountAfter).toBe(nodeCountBefore);
  });

  test('Changes are autosaved', async () => {
    // User 1 adds a node
    await addNode(user1Page, 'Function');

    // Wait for autosave indicator
    await expect(user1Page.locator('text=Saved')).toBeVisible({ timeout: 5000 });

    // User 2 refreshes and sees the change
    await user2Page.reload();
    await user2Page.waitForSelector('[data-testid="workflow-node"]');

    // Node should be present
    const hasNewNode = await user2Page.locator('text=Function').count();
    expect(hasNewNode).toBeGreaterThan(0);
  });

  test('Viewer role cannot edit workflow', async () => {
    // Create User 3 as viewer
    const browser = user1Page.context().browser()!;
    const context3 = await browser.newContext();
    const user3Page = await context3.newPage();
    await login(user3Page, 'user3@example.com', 'password123');

    // User 1 invites User 3 as viewer
    await user1Page.click('button:has-text("+ Invite")');
    await user1Page.fill('input[type="email"]', 'user3@example.com');
    await user1Page.selectOption('select', 'viewer');
    await user1Page.click('button:has-text("Send Invite")');
    await expect(user1Page.locator('text=User invited successfully')).toBeVisible();

    // User 3 navigates to workflow
    await user3Page.goto(`/workflow/${workflowId}`);

    // Add Node button should be disabled
    const addButton = user3Page.locator('button:has-text("Add Node")');
    expect(await addButton.isDisabled()).toBe(true);

    // Nodes should not be editable
    const node = user3Page.locator('[data-testid="workflow-node"]').first();
    await node.dblclick();

    // Edit dialog should not open
    const editDialog = user3Page.locator('[data-testid="node-edit-dialog"]');
    expect(await editDialog.count()).toBe(0);

    await user3Page.close();
  });
});

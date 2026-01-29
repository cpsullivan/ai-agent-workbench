/**
 * Test Data Factories
 *
 * Helper functions to generate test data for unit and E2E tests.
 * Using factories ensures consistent test data across the test suite.
 */

import type { User, Session, Workflow } from '../types';

let idCounter = 0;

/**
 * Generate a unique ID for testing
 */
export function generateId(): string {
  idCounter++;
  return `test-id-${idCounter}`;
}

/**
 * Generate a unique email for testing
 */
export function generateEmail(): string {
  return `test-user-${generateId()}@example.com`;
}

/**
 * Create a mock user object
 */
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: generateId(),
    email: generateEmail(),
    full_name: 'Test User',
    organization_id: generateId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock session object
 */
export function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: generateId(),
    user_id: generateId(),
    name: 'Test Session',
    status: 'active',
    model: 'gpt-4',
    snapshot_count: 0,
    visibility: 'private' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock workflow object
 */
export function createMockWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: generateId(),
    user_id: generateId(),
    organization_id: generateId(),
    name: 'Test Workflow',
    description: 'A test workflow',
    category: 'automation',
    tags: [],
    status: 'draft',
    visibility: 'private',
    current_version_id: null,
    version_count: 0,
    execution_count: 0,
    last_executed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create multiple mock objects
 */
export function createMockUsers(count: number, overrides?: Partial<User>): User[] {
  return Array.from({ length: count }, () => createMockUser(overrides));
}

export function createMockSessions(count: number, overrides?: Partial<Session>): Session[] {
  return Array.from({ length: count }, () => createMockSession(overrides));
}

export function createMockWorkflows(count: number, overrides?: Partial<Workflow>): Workflow[] {
  return Array.from({ length: count }, () => createMockWorkflow(overrides));
}

/**
 * Reset ID counter (useful in beforeEach hooks)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

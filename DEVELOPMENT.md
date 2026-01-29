# Development Guide

This document provides detailed information for developers working on the AI Agent Workbench.

## Project Architecture

### Frontend Architecture

The frontend follows a modular architecture:

- **Pages:** Top-level routes (`src/pages/`)
- **Components:** Reusable UI components (`src/components/`)
- **Hooks:** Custom React hooks for business logic (`src/hooks/`)
- **Lib:** Utility functions and third-party integrations (`src/lib/`)

### State Management

- **React Query:** Server state, caching, and data fetching
- **Zustand:** Client-side global state (when needed)
- **React Context:** Authentication and theme state

### Styling

- **Tailwind CSS:** Utility-first CSS framework
- **Component Structure:** Mobile-first, responsive design

## Development Workflow

### 1. Setting Up Your Environment

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials
# - VITE_SUPABASE_URL: Your Supabase project URL
# - VITE_SUPABASE_ANON_KEY: Your Supabase anonymous key
```

### 2. Running the Development Server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 3. Code Style

- **TypeScript:** All new code must be TypeScript
- **Linting:** Run `npm run lint` before committing
- **Naming Conventions:**
  - Components: PascalCase (`UserProfile.tsx`)
  - Hooks: camelCase with 'use' prefix (`useAuth.ts`)
  - Utilities: camelCase (`formatDate.ts`)
  - Types: PascalCase (`UserSession.ts`)

### 4. Testing

#### Unit Tests (Vitest)

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Generate coverage report
npm run test:coverage
```

Write tests alongside your code:
- `Component.tsx` → `Component.test.tsx`
- `useHook.ts` → `useHook.test.ts`

#### E2E Tests (Playwright)

```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Install Playwright browsers (first time only)
npx playwright install
```

E2E tests go in `tests/e2e/`.

### 5. Git Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add user authentication"

# Push and create PR
git push origin feature/your-feature-name
```

#### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style changes (formatting, no logic change)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Phase 1 Development Tasks

### Phase 1.1: Authentication & Authorization (Current)

**Database Setup:**
1. Create Supabase project
2. Run migration `001_add_auth_tables.sql`
3. Enable OAuth providers in Supabase dashboard

**Files to Create:**
- `src/hooks/useAuth.ts`
- `src/components/Auth/LoginForm.tsx`
- `src/components/Auth/ProtectedRoute.tsx`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/rbac.ts`

**Testing:**
- Unit tests for `useAuth` hook
- E2E test for OAuth login flow
- E2E test for RBAC enforcement

### Phase 1.2: Secrets Management

**Database Setup:**
1. Enable pgcrypto extension
2. Run migration `002_add_secrets_tables.sql`

**Files to Create:**
- `src/components/Settings/SecretsManager.tsx`
- `src/hooks/useSecrets.ts`
- `supabase/functions/secrets-get/index.ts`
- `supabase/functions/secrets-set/index.ts`
- `supabase/functions/_shared/encryption.ts`

**Security Requirements:**
- All secrets must be encrypted at rest
- Secrets never logged or exposed in errors
- Audit trail for secret access

### Phase 1.3: Session Persistence

**Database Setup:**
1. Run migration `003_add_session_snapshots.sql`

**Files to Create:**
- `src/hooks/useSessionPersistence.ts`
- `src/hooks/useSessionRestore.ts`
- `supabase/functions/session-snapshot-save/index.ts`
- `supabase/functions/session-snapshot-restore/index.ts`

**Requirements:**
- Auto-save every 30 seconds
- Restore on page load
- Handle snapshot conflicts

### Phase 1.4: Workflow Persistence & Versioning

**Database Setup:**
1. Run migration `004_add_workflow_tables.sql`

**Files to Create:**
- `src/components/WorkflowBuilder.tsx`
- `src/hooks/useWorkflowPersistence.ts`
- `src/hooks/useWorkflowVersioning.ts`
- `src/components/Workflows/WorkflowList.tsx`
- `src/components/Workflows/VersionHistory.tsx`

**Requirements:**
- Git-style versioning
- Diff view between versions
- Rollback capability

## Supabase Edge Functions

### Creating a New Edge Function

```bash
# Initialize Supabase CLI (first time only)
npx supabase init

# Create new function
npx supabase functions new function-name

# Deploy function
npx supabase functions deploy function-name
```

### Edge Function Structure

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest } from '../_shared/auth.ts';

serve(async (req) => {
  try {
    // Authenticate request
    const { user, error } = await authenticateRequest(req);
    if (error) {
      return new Response(JSON.stringify({ error }), { status: 401 });
    }

    // Your logic here
    const data = await req.json();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

## Database Migrations

### Creating a Migration

```bash
# Create new migration
npx supabase migration new migration_name

# Apply migrations locally
npx supabase db push

# Apply migrations to production
# (After review and approval)
npx supabase db push --db-url $PRODUCTION_DB_URL
```

### Migration Best Practices

1. **Always create new migrations** - Never edit existing ones
2. **Test migrations locally first** - Use `npx supabase db reset` to test
3. **Include rollback SQL** - Add comments with rollback instructions
4. **Add indexes** - For any column used in WHERE clauses
5. **Use transactions** - Wrap related changes in BEGIN/COMMIT

### Example Migration

```sql
-- Migration: 001_add_auth_tables.sql
-- Description: Create user authentication and authorization tables

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization_id ON users(organization_id);

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS users CASCADE;
```

## Testing Guidelines

### Unit Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    // Setup mocks
    vi.clearAllMocks();
  });

  it('should return null user when not authenticated', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
  });

  it('should login successfully with valid credentials', async () => {
    const { result } = renderHook(() => useAuth());

    await result.current.login('test@example.com', 'password');

    await waitFor(() => {
      expect(result.current.user).toBeDefined();
      expect(result.current.user?.email).toBe('test@example.com');
    });
  });
});
```

### E2E Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should login with OAuth provider', async ({ page }) => {
    await page.goto('/');

    // Click login button
    await page.click('button:has-text("Login")');

    // Select OAuth provider
    await page.click('button:has-text("Continue with Google")');

    // Should redirect to dashboard after login
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});
```

### Coverage Requirements

- **Overall:** 70% minimum
- **Critical paths:** 90%+ (auth, secrets, core hooks)
- **Components:** 60%+
- **Utilities:** 80%+

## Performance Best Practices

1. **Code Splitting:** Use dynamic imports for large components
   ```typescript
   const WorkflowBuilder = lazy(() => import('./components/WorkflowBuilder'));
   ```

2. **Memoization:** Use `useMemo` and `useCallback` for expensive operations
   ```typescript
   const expensiveValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);
   ```

3. **Virtualization:** Use react-window for large lists

4. **Debouncing:** Debounce user input and auto-save operations
   ```typescript
   const debouncedSave = useMemo(
     () => debounce(saveSession, 30000),
     []
   );
   ```

5. **Image Optimization:** Use WebP format, lazy loading

## Security Checklist

Before merging any PR:

- [ ] No secrets in code or logs
- [ ] All user inputs sanitized
- [ ] SQL queries parameterized
- [ ] Authentication checked on all protected routes
- [ ] RBAC permissions enforced
- [ ] Error messages don't leak sensitive data
- [ ] Rate limiting applied to API endpoints
- [ ] CORS properly configured

## Troubleshooting

### Common Issues

**Supabase connection errors:**
- Check `.env` file has correct credentials
- Verify Supabase project is running
- Check network connectivity

**Test failures:**
- Run `npm run test:coverage` to see what's not covered
- Check mock data in `src/test/factories.ts`
- Verify test setup in `src/test/setup.ts`

**TypeScript errors:**
- Run `npm run build` to see all type errors
- Regenerate Supabase types: `npx supabase gen types typescript`

**Tailwind not working:**
- Verify `tailwind.config.js` content paths
- Check `index.css` has Tailwind directives
- Restart dev server

## Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Vitest Documentation](https://vitest.dev)
- [Playwright Documentation](https://playwright.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Getting Help

- Check this documentation first
- Search existing GitHub issues
- Ask in team Slack channel
- Create a GitHub issue with reproduction steps

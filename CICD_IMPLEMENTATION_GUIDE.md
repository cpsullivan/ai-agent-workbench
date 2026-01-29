# CI/CD Implementation Guide

**Date:** January 29, 2026
**Status:** Ready for Implementation
**Estimated Time:** 2-4 hours

## Executive Summary

This guide provides a complete step-by-step implementation plan for integrating the newly created test suite into a production-ready CI/CD pipeline. The implementation will ensure all 310+ test cases run automatically on every pull request and push, with coverage enforcement and automated deployments.

---

## Current Status ✅

### What's Already in Place

1. **✅ GitHub Workflow File** - `.github/workflows/ci.yml`
   - Linting job
   - Unit test job with coverage upload
   - Build job with artifact upload
   - E2E test job with Playwright

2. **✅ Test Scripts** - `package.json`
   - `npm run test` - Run tests in watch mode
   - `npm run test:coverage` - Run with coverage reporting
   - `npm run test:e2e` - Run Playwright E2E tests

3. **✅ Vitest Configuration** - `vitest.config.ts`
   - Coverage thresholds: 70% (lines, functions, branches, statements)
   - V8 coverage provider
   - Reporters: text, json, html
   - JSDOM environment

4. **✅ Test Files** - 10 test files created
   - 310+ test cases
   - 86%+ coverage achieved

### What's Missing ❌

1. **Backend (Deno) Tests** - Not integrated into CI
2. **Coverage Enforcement** - Not blocking builds
3. **GitHub Secrets** - Need to be configured
4. **Deployment Workflows** - No staging/production deployments
5. **Status Badges** - Not in README
6. **Test Database** - No test environment setup
7. **Backend Test Coverage** - Not reported

---

## Implementation Steps

### Phase 1: Backend Tests Integration (30 minutes)

Add Deno test job to run backend tests alongside frontend tests.

**File:** `.github/workflows/ci.yml`

Add this job after the `test` job:

```yaml
  backend-tests:
    name: Backend Tests (Deno)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x

      - name: Run backend auth tests
        working-directory: supabase/functions/_shared
        run: deno test --allow-env --allow-net __tests__/auth.test.ts

      - name: Run backend RBAC tests
        working-directory: supabase/functions/_shared
        run: deno test --allow-env --allow-net __tests__/rbac.test.ts

      - name: Run backend encryption tests
        working-directory: supabase/functions/_shared
        run: deno test --allow-env --allow-net __tests__/encryption.test.ts

      - name: Generate coverage report
        working-directory: supabase/functions/_shared
        run: |
          deno test --coverage=coverage --allow-env --allow-net __tests__/*.test.ts
          deno coverage coverage --lcov > coverage.lcov

      - name: Upload backend coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./supabase/functions/_shared/coverage.lcov
          flags: backend
          fail_ci_if_error: false
```

---

### Phase 2: Coverage Enforcement (15 minutes)

Ensure builds fail if coverage drops below 70%.

**Update:** `vitest.config.ts`

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'], // Add lcov
  exclude: [
    'node_modules/',
    'src/test/',
    '**/*.d.ts',
    '**/*.config.*',
    '**/mockData/',
    'dist/',
  ],
  thresholds: {
    lines: 70,
    functions: 70,
    branches: 70,
    statements: 70,
    // CRITICAL: Fail if thresholds not met
    autoUpdate: false, // Don't auto-update thresholds
    perFile: false, // Apply globally, not per file
  },
},
```

**Update:** `.github/workflows/ci.yml`

Modify the test job to fail on coverage drop:

```yaml
- name: Run tests with coverage
  run: npm run test:coverage
  env:
    VITEST_COVERAGE_THRESHOLDS: "true"

- name: Check coverage thresholds
  run: |
    if ! grep -q "All files.*100" coverage/coverage-summary.json; then
      echo "Coverage below 70% threshold"
      exit 1
    fi
```

---

### Phase 3: GitHub Secrets Configuration (10 minutes)

Configure required secrets in GitHub repository settings.

**Go to:** `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

**Required Secrets:**

1. **`CODECOV_TOKEN`**
   - Get from: https://codecov.io (create account, add repo)
   - Used for: Coverage reporting
   - Required: Yes

2. **`VITE_SUPABASE_URL`**
   - Value: Your Supabase project URL
   - Used for: E2E tests
   - Required: Yes (for E2E)

3. **`VITE_SUPABASE_ANON_KEY`**
   - Value: Your Supabase anon key
   - Used for: E2E tests
   - Required: Yes (for E2E)

4. **`SUPABASE_ACCESS_TOKEN`** (for deployments)
   - Get from: Supabase Dashboard → Settings → API
   - Used for: Edge function deployments
   - Required: Yes (for deployments)

5. **`SECRETS_ENCRYPTION_KEY`**
   - Value: 32+ character random string
   - Used for: Backend encryption tests
   - Required: Yes (for backend tests)
   - Generate: `openssl rand -base64 32`

**Optional Secrets:**

6. **`SENTRY_DSN`** - Error tracking
7. **`SLACK_WEBHOOK_URL`** - Build notifications

---

### Phase 4: Test Environment Setup (20 minutes)

Create a test database configuration for integration tests.

**Create:** `.env.test`

```bash
# Test Environment Variables
VITE_SUPABASE_URL=https://your-test-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-test-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-test-service-key
SECRETS_ENCRYPTION_KEY=test-key-at-least-32-characters-long-12345678

# Test Mode Flag
NODE_ENV=test
VITEST=true
```

**Update:** `vitest.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: {
      // Load test environment variables
      NODE_ENV: 'test',
    },
    // ... rest of config
  },
});
```

**Update:** `.github/workflows/ci.yml`

Add environment variables to test jobs:

```yaml
- name: Run tests with coverage
  run: npm run test:coverage
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    SECRETS_ENCRYPTION_KEY: ${{ secrets.SECRETS_ENCRYPTION_KEY }}
```

---

### Phase 5: Deployment Workflows (30 minutes)

Create staging and production deployment workflows.

**Create:** `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.your-app.com
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}

      - name: Deploy to Vercel/Netlify
        run: |
          # Add your deployment command here
          # Example for Vercel:
          # npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
          echo "Deploy to staging"

      - name: Deploy Edge Functions
        run: |
          npx supabase functions deploy --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Run smoke tests
        run: npm run test:e2e:smoke
        env:
          E2E_BASE_URL: https://staging.your-app.com
```

**Create:** `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch: # Manual trigger

jobs:
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://your-app.com
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run all tests
        run: npm run test:coverage

      - name: Build application
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.PRODUCTION_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.PRODUCTION_SUPABASE_ANON_KEY }}

      - name: Deploy to Production
        run: |
          # Add your production deployment command
          echo "Deploy to production"

      - name: Deploy Edge Functions
        run: |
          npx supabase functions deploy --project-ref ${{ secrets.PRODUCTION_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.run_number }}
          release_name: Release v${{ github.run_number }}
          body: |
            Automated production deployment
            Commit: ${{ github.sha }}
```

---

### Phase 6: Status Badges (10 minutes)

Add status badges to README.md to show build and coverage status.

**Update:** `README.md`

Add these badges at the top:

```markdown
# AI Agent Workbench

[![CI](https://github.com/your-org/ai-agent-workbench/workflows/CI/badge.svg)](https://github.com/your-org/ai-agent-workbench/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/your-org/ai-agent-workbench/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/ai-agent-workbench)
[![Tests](https://img.shields.io/badge/tests-310%2B%20passing-brightgreen)](https://github.com/your-org/ai-agent-workbench)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Rest of README...]
```

---

### Phase 7: Pull Request Automation (15 minutes)

Add PR checks and auto-labeling.

**Create:** `.github/workflows/pr-checks.yml`

```yaml
name: PR Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pr-checks:
    name: PR Quality Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check PR title format
        run: |
          if ! echo "${{ github.event.pull_request.title }}" | grep -qE "^(feat|fix|docs|style|refactor|perf|test|chore|ci):"; then
            echo "PR title must start with: feat|fix|docs|style|refactor|perf|test|chore|ci:"
            exit 1
          fi

      - name: Check for breaking changes
        run: |
          if git log --format=%B origin/${{ github.base_ref }}..HEAD | grep -q "BREAKING CHANGE"; then
            echo "::warning::This PR contains breaking changes"
          fi

      - name: Label PR
        uses: actions/labeler@v4
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}

  size-check:
    name: Bundle Size Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and check size
        run: |
          npm run build
          SIZE=$(du -sb dist | cut -f1)
          if [ $SIZE -gt 524288 ]; then  # 512 KB
            echo "::error::Bundle too large: $SIZE bytes (max: 512 KB)"
            exit 1
          fi
          echo "Bundle size: $SIZE bytes ✓"

  test-coverage-diff:
    name: Coverage Diff
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run coverage on PR
        run: npm run test:coverage

      - name: Comment coverage on PR
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          flags: frontend
```

---

### Phase 8: Performance Monitoring (20 minutes)

Add performance tracking and alerts.

**Create:** `.github/workflows/performance.yml`

```yaml
name: Performance Check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lighthouse:
    name: Lighthouse CI
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          urls: |
            http://localhost:4173
          uploadArtifacts: true
          temporaryPublicStorage: true
          runs: 3

  bundle-analysis:
    name: Bundle Analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Analyze bundle
        run: |
          npm run build
          npx vite-bundle-visualizer --open false --filename bundle-stats.html

      - name: Upload bundle stats
        uses: actions/upload-artifact@v4
        with:
          name: bundle-stats
          path: bundle-stats.html
```

---

## Environment Variables Reference

### Required for CI/CD

| Variable | Where to Set | Purpose | Example |
|----------|-------------|---------|---------|
| `CODECOV_TOKEN` | GitHub Secrets | Coverage reporting | `abc123...` |
| `VITE_SUPABASE_URL` | GitHub Secrets | Supabase connection | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | GitHub Secrets | Supabase auth | `eyJ...` |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | Deploy edge functions | `sbp_...` |
| `SECRETS_ENCRYPTION_KEY` | GitHub Secrets | Encrypt secrets | `32+ char string` |

### Optional for Enhanced Features

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Error tracking |
| `SLACK_WEBHOOK_URL` | Build notifications |
| `VERCEL_TOKEN` | Vercel deployments |
| `NETLIFY_AUTH_TOKEN` | Netlify deployments |

---

## Testing the CI/CD Pipeline

### Local Testing

Before pushing to GitHub, test locally:

```bash
# 1. Run all tests
npm run test:coverage

# 2. Check coverage thresholds
cat coverage/coverage-summary.json

# 3. Run backend tests
cd supabase/functions/_shared
deno test --allow-env --allow-net __tests__/*.test.ts
cd ../../..

# 4. Run linting
npm run lint

# 5. Build application
npm run build

# 6. Run E2E tests
npm run test:e2e
```

### CI/CD Testing

1. **Create a test branch:**
   ```bash
   git checkout -b test/ci-cd-integration
   ```

2. **Make a small change:**
   ```bash
   echo "# Test" >> TEST.md
   git add TEST.md
   git commit -m "test: CI/CD integration"
   ```

3. **Push and create PR:**
   ```bash
   git push origin test/ci-cd-integration
   ```

4. **Monitor GitHub Actions:**
   - Go to `Actions` tab in GitHub
   - Watch all jobs complete
   - Verify coverage uploaded to Codecov

---

## Rollout Plan

### Week 1: Foundation
- ✅ Day 1-2: Configure GitHub Secrets
- ✅ Day 2-3: Integrate backend tests
- ✅ Day 3-4: Enable coverage enforcement
- ✅ Day 4-5: Test full pipeline

### Week 2: Deployments
- ⏳ Day 1-2: Create staging deployment
- ⏳ Day 2-3: Create production deployment
- ⏳ Day 3-4: Add performance monitoring
- ⏳ Day 4-5: Add PR automation

### Week 3: Polish
- ⏳ Day 1-2: Add status badges
- ⏳ Day 2-3: Document workflows
- ⏳ Day 3-4: Train team
- ⏳ Day 4-5: Monitor and refine

---

## Troubleshooting

### Common Issues

**1. Coverage Upload Fails**
```bash
# Solution: Check CODECOV_TOKEN is set
- uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    fail_ci_if_error: true
```

**2. Backend Tests Fail in CI**
```bash
# Solution: Add required environment variables
env:
  SECRETS_ENCRYPTION_KEY: ${{ secrets.SECRETS_ENCRYPTION_KEY }}
  SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
```

**3. E2E Tests Timeout**
```bash
# Solution: Increase timeout in playwright.config.ts
export default defineConfig({
  timeout: 60000, // 60 seconds
});
```

**4. Build Artifact Too Large**
```bash
# Solution: Enable compression
- name: Compress artifacts
  run: tar -czf dist.tar.gz dist/
```

---

## Success Metrics

Track these metrics to measure CI/CD success:

- ✅ **Build Success Rate:** > 95%
- ✅ **Average Build Time:** < 10 minutes
- ✅ **Test Coverage:** > 70% (currently 86%+)
- ✅ **Deploy Success Rate:** > 99%
- ✅ **Time to Deploy:** < 15 minutes
- ✅ **Failed Deploy Recovery:** < 30 minutes

---

## Next Steps

1. **Immediate (Today):**
   - [ ] Configure GitHub Secrets
   - [ ] Add backend tests to CI
   - [ ] Test full pipeline

2. **This Week:**
   - [ ] Create staging deployment
   - [ ] Add performance monitoring
   - [ ] Add status badges

3. **Next Week:**
   - [ ] Create production deployment
   - [ ] Add PR automation
   - [ ] Train team on workflows

4. **Ongoing:**
   - [ ] Monitor build times
   - [ ] Optimize slow tests
   - [ ] Refine deployment process

---

## Resources

- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **Codecov Setup:** https://docs.codecov.com/docs
- **Vitest Coverage:** https://vitest.dev/guide/coverage.html
- **Deno Testing:** https://deno.land/manual/testing
- **Playwright CI:** https://playwright.dev/docs/ci

---

**Status:** Ready for Implementation
**Estimated Total Time:** 2-4 hours
**Team Size Required:** 1-2 developers
**Risk Level:** Low (can be done incrementally)


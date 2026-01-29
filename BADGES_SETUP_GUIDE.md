# Status Badges Setup Guide

This guide explains how to configure and customize the status badges in README.md.

---

## Current Badges

The README.md includes 5 status badges:

1. **CI Badge** - Shows CI workflow status (passing/failing)
2. **Coverage Badge** - Shows test coverage percentage
3. **Deploy Staging Badge** - Shows staging deployment status
4. **Deploy Production Badge** - Shows production deployment status
5. **License Badge** - Shows project license

---

## Step 1: Update Repository URLs

Replace `YOUR_USERNAME` in README.md with your actual GitHub username or organization name.

### Find and Replace

In **README.md**, replace all instances of:
```
YOUR_USERNAME/ai-agent-workbench
```

With your actual repository path, for example:
```
your-org-name/ai-agent-workbench
```

Or:
```
your-github-username/ai-agent-workbench
```

### Badge URLs to Update

```markdown
<!-- CI Badge -->
[![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml)

<!-- Coverage Badge -->
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)

<!-- Staging Deployment Badge -->
[![Deploy Staging](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml)

<!-- Production Deployment Badge -->
[![Deploy Production](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml)
```

---

## Step 2: Set Up Codecov Badge

The coverage badge requires Codecov to be configured.

### 2.1 Create Codecov Account

1. Go to [https://codecov.io](https://codecov.io)
2. Sign in with your GitHub account
3. Authorize Codecov to access your repositories

### 2.2 Add Repository to Codecov

1. Click **Add Repository** in Codecov dashboard
2. Find `ai-agent-workbench` in the list
3. Click **Set up repository**

### 2.3 Get Upload Token

1. In Codecov, go to repository **Settings**
2. Copy the **CODECOV_TOKEN**
3. Add to GitHub Secrets:
   - Go to GitHub repository → **Settings** → **Secrets** → **Actions**
   - Click **New repository secret**
   - Name: `CODECOV_TOKEN`
   - Value: [paste token from Codecov]
   - Click **Add secret**

### 2.4 Verify Coverage Badge

After your first CI run with coverage upload:
1. Go to Codecov dashboard for your repository
2. Click **Settings** → **Badge**
3. Copy the Markdown badge code
4. Replace the badge in README.md if format is different

**Expected format:**
```markdown
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg?token=YOUR_CODECOV_TOKEN)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)
```

Note: If repository is public, token in badge URL is optional.

---

## Step 3: Verify Badges

### 3.1 Push Changes

```bash
git add README.md
git commit -m "docs: configure status badges with repository URLs"
git push origin main
```

### 3.2 Check Badge Status

1. **CI Badge:**
   - Go to **Actions** tab in GitHub
   - Verify CI workflow is running
   - Badge should show "passing" in green after workflow completes

2. **Coverage Badge:**
   - First CI run must complete with coverage upload
   - Check Codecov dashboard for coverage report
   - Badge will show percentage (e.g., "86%")

3. **Deployment Badges:**
   - Will show "passing" after first successful deployment
   - Staging badge updates on push to `develop`
   - Production badge updates on push to `main`

### 3.3 Badge Colors

- 🟢 **Green (passing):** All checks passed
- 🔴 **Red (failing):** At least one check failed
- ⚫ **Gray (no status):** Workflow hasn't run yet

---

## Step 4: Customize Badge Styles

GitHub and Codecov support different badge styles.

### GitHub Actions Badge Styles

Add `?style=` parameter to badge URL:

```markdown
<!-- Flat style (default) -->
![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg?style=flat)

<!-- Flat-square style -->
![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg?style=flat-square)

<!-- For-the-badge style (larger) -->
![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg?style=for-the-badge)
```

### Codecov Badge Styles

Add `&style=` parameter to Codecov badge:

```markdown
<!-- Flat style -->
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg?style=flat)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)

<!-- Flat-square style -->
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg?style=flat-square)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)
```

### Shields.io Custom Badges

For more customization, use [shields.io](https://shields.io):

```markdown
<!-- Custom CI badge -->
[![CI](https://img.shields.io/github/actions/workflow/status/YOUR_USERNAME/ai-agent-workbench/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml)

<!-- Custom coverage badge -->
[![Coverage](https://img.shields.io/codecov/c/github/YOUR_USERNAME/ai-agent-workbench?label=Coverage&style=flat-square)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)

<!-- Custom deployment badge -->
[![Staging](https://img.shields.io/github/deployments/YOUR_USERNAME/ai-agent-workbench/staging?label=Staging&style=flat-square)](https://github.com/YOUR_USERNAME/ai-agent-workbench/deployments)
```

---

## Step 5: Add Additional Badges (Optional)

### Version Badge

Shows current version from package.json:

```markdown
[![Version](https://img.shields.io/github/package-json/v/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench)
```

### Issues Badge

Shows open issues count:

```markdown
[![Issues](https://img.shields.io/github/issues/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench/issues)
```

### Pull Requests Badge

Shows open PRs count:

```markdown
[![Pull Requests](https://img.shields.io/github/issues-pr/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench/pulls)
```

### Last Commit Badge

Shows time since last commit:

```markdown
[![Last Commit](https://img.shields.io/github/last-commit/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench/commits/main)
```

### Contributors Badge

Shows number of contributors:

```markdown
[![Contributors](https://img.shields.io/github/contributors/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench/graphs/contributors)
```

### Code Size Badge

Shows repository code size:

```markdown
[![Code Size](https://img.shields.io/github/languages/code-size/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench)
```

### Language Badge

Shows primary programming language:

```markdown
[![Language](https://img.shields.io/github/languages/top/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench)
```

---

## Troubleshooting

### Badge Shows "unknown" or Gray

**Cause:** Workflow hasn't run yet or badge URL is incorrect

**Fix:**
1. Verify workflow file exists (`.github/workflows/ci.yml`)
2. Check workflow has run at least once (Actions tab)
3. Verify badge URL matches your repository path
4. Wait a few minutes for badge to update

### Coverage Badge Not Updating

**Cause:** Codecov token not configured or upload failed

**Fix:**
1. Verify `CODECOV_TOKEN` is set in GitHub Secrets
2. Check CI workflow logs for Codecov upload step
3. Verify Codecov action is included in workflow:
   ```yaml
   - name: Upload coverage reports
     uses: codecov/codecov-action@v4
     with:
       files: ./coverage/coverage-final.json
       fail_ci_if_error: true
   ```
4. Check Codecov dashboard for recent uploads

### Deployment Badge Always Gray

**Cause:** Deployment workflows haven't run or environments not configured

**Fix:**
1. Verify environment exists in GitHub (Settings → Environments)
2. Run deployment workflow at least once
3. Check deployment workflow logs for errors
4. Badge URL must match environment name exactly

### Badge Shows Wrong Status

**Cause:** Badge cache or branch mismatch

**Fix:**
1. Add `?branch=main` to force specific branch
2. Clear browser cache and refresh page
3. Check badge is pointing to correct workflow file
4. Wait up to 5 minutes for badge to update

---

## Badge Best Practices

### 1. Place Important Badges First

Order badges by importance:
1. CI status
2. Coverage
3. Deployments
4. License

### 2. Limit Badge Count

Too many badges can clutter README. Recommended: 3-7 badges maximum.

### 3. Group Related Badges

Use line breaks to group related badges:

```markdown
<!-- Build Status -->
[![CI](...)](#) [![Coverage](...)](#)

<!-- Deployments -->
[![Staging](...)](#) [![Production](...)](#)

<!-- Project Info -->
[![License](...)](#) [![Version](...)](#)
```

### 4. Keep Badge Links Working

Ensure badge links redirect to relevant pages:
- CI badge → GitHub Actions
- Coverage badge → Codecov dashboard
- Deployment badge → Deployments page

### 5. Update Badges When Changing Branch Names

If you rename `main` to `master` or vice versa, update badge URLs:
```markdown
<!-- Change branch in badge URL -->
...branch/main/...  →  ...branch/master/...
```

---

## Example Badge Configurations

### Minimal (Recommended)

```markdown
[![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
```

### Standard (Current)

```markdown
[![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)
[![Deploy Staging](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml)
[![Deploy Production](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
```

### Comprehensive

```markdown
<!-- Build & Quality -->
[![CI](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/ai-agent-workbench)
[![Code Quality](https://img.shields.io/codeclimate/maintainability/YOUR_USERNAME/ai-agent-workbench)](https://codeclimate.com/github/YOUR_USERNAME/ai-agent-workbench)

<!-- Deployments -->
[![Deploy Staging](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-staging.yml)
[![Deploy Production](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-agent-workbench/actions/workflows/deploy-production.yml)

<!-- Project Info -->
[![Version](https://img.shields.io/github/package-json/v/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Contributors](https://img.shields.io/github/contributors/YOUR_USERNAME/ai-agent-workbench)](https://github.com/YOUR_USERNAME/ai-agent-workbench/graphs/contributors)
```

---

## Summary

### Quick Setup Checklist

- ✅ Replace `YOUR_USERNAME` with actual repository path in README.md
- ✅ Create Codecov account and add repository
- ✅ Add `CODECOV_TOKEN` to GitHub Secrets
- ✅ Push changes and verify CI runs
- ✅ Check all badges display correctly
- ✅ Verify badge links work

### Badge Status After Setup

- **CI Badge:** Should show "passing" after first workflow run
- **Coverage Badge:** Should show "86%" (current coverage)
- **Staging Badge:** Shows "passing" after first staging deployment
- **Production Badge:** Shows "passing" after first production deployment
- **License Badge:** Always shows "MIT" (static)

---

**Status badges are now configured!** 🎉

Update YOUR_USERNAME placeholders and push to GitHub to see badges in action.

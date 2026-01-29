# Deployment Setup Guide

This guide explains how to configure GitHub environments and secrets for staging and production deployments.

---

## Prerequisites

- Admin access to GitHub repository
- Supabase projects created (staging + production)
- Hosting provider account (Vercel, Netlify, or similar)
- Optional: Slack webhook for notifications

---

## Step 1: Create GitHub Environments

### 1.1 Create Staging Environment

1. Go to repository **Settings** → **Environments**
2. Click **New environment**
3. Name: `staging`
4. Click **Configure environment**
5. **Protection rules:**
   - ☐ Required reviewers: None (auto-deploy)
   - ☑ Wait timer: 0 minutes
   - ☑ Deployment branches: Only `develop`
6. Click **Save protection rules**

### 1.2 Create Production Environment

1. Click **New environment** again
2. Name: `production`
3. Click **Configure environment**
4. **Protection rules:**
   - ☑ **Required reviewers:** Add 1-2 team members (MANDATORY)
   - ☑ Wait timer: 5 minutes (gives time to verify staging)
   - ☑ Deployment branches: Only `main`
5. Click **Save protection rules**

**Critical:** Production MUST have required reviewers to prevent accidental deployments.

---

## Step 2: Configure Staging Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **Environments** → **staging**

### Required Staging Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `STAGING_SUPABASE_URL` | Staging Supabase project URL | Supabase Dashboard → Project Settings → API |
| `STAGING_SUPABASE_ANON_KEY` | Staging anonymous key | Supabase Dashboard → Project Settings → API |
| `STAGING_SUPABASE_PROJECT_REF` | Staging project reference ID | Extract from URL: `https://app.supabase.com/project/**[THIS-PART]**` |
| `STAGING_SUPABASE_ACCESS_TOKEN` | Personal access token for CLI | Supabase Dashboard → Account → Access Tokens |
| `STAGING_SUPABASE_DB_PASSWORD` | Staging database password | Supabase Dashboard → Project Settings → Database |
| `STAGING_SECRETS_ENCRYPTION_KEY` | Encryption key for secrets | Generate: `openssl rand -base64 32` |
| `STAGING_APP_URL` | Staging frontend URL | e.g., `https://staging.your-app.com` |
| `STAGING_UPSTASH_REDIS_REST_URL` | Staging Redis URL | Upstash Dashboard → Your Database → REST API |
| `STAGING_UPSTASH_REDIS_REST_TOKEN` | Staging Redis token | Upstash Dashboard → Your Database → REST API |
| `STAGING_SENTRY_DSN` | Optional: Staging Sentry DSN | Sentry → Project Settings → Client Keys (DSN) |

### Optional Staging Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `VERCEL_TOKEN` | Vercel deployment token | Vercel → Settings → Tokens |
| `NETLIFY_SITE_ID` | Netlify site ID | Netlify → Site Settings → General |
| `NETLIFY_AUTH_TOKEN` | Netlify auth token | Netlify → User Settings → Applications → Personal Access Tokens |
| `SLACK_WEBHOOK_URL` | Slack notifications | Slack → Apps → Incoming Webhooks |

---

## Step 3: Configure Production Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **Environments** → **production**

### Required Production Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `VITE_SUPABASE_URL` | Production Supabase URL | Supabase Dashboard → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Production anonymous key | Supabase Dashboard → Project Settings → API |
| `SUPABASE_PROJECT_REF` | Production project reference | Extract from Supabase project URL |
| `SUPABASE_ACCESS_TOKEN` | Personal access token | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Production database password | Supabase Dashboard → Project Settings → Database |
| `SECRETS_ENCRYPTION_KEY` | Production encryption key | Generate: `openssl rand -base64 32` (DIFFERENT from staging!) |
| `PRODUCTION_APP_URL` | Production frontend URL | e.g., `https://your-app.com` |
| `PRODUCTION_SUPABASE_URL` | Same as VITE_SUPABASE_URL | (for consistency in health checks) |
| `SENTRY_DSN` | Production Sentry DSN | Sentry → Project Settings → Client Keys (DSN) |

### Optional Production Secrets

Same as staging (Vercel, Netlify, Slack tokens)

**Important:** Use separate Supabase projects for staging and production!

---

## Step 4: Configure Repository Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **Repository secrets**

These are shared across all environments (used in CI workflow):

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `CODECOV_TOKEN` | Code coverage tracking | Codecov.io → Repository Settings → General |
| `VITE_SUPABASE_URL` | Default (dev) Supabase URL | Development Supabase project |
| `VITE_SUPABASE_ANON_KEY` | Default (dev) Supabase anon key | Development Supabase project |

---

## Step 5: Configure Hosting Provider

### Option A: Vercel

1. Install Vercel CLI: `npm install -g vercel`
2. Login: `vercel login`
3. Link project: `vercel link`
4. Get deployment token:
   - Go to Vercel → Settings → Tokens
   - Create token with deployment permissions
   - Add as `VERCEL_TOKEN` secret

### Option B: Netlify

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Login: `netlify login`
3. Link site: `netlify link`
4. Get site ID: `netlify status` (copy Site ID)
5. Get auth token:
   - Go to Netlify → User Settings → Applications
   - Create Personal Access Token
   - Add as `NETLIFY_AUTH_TOKEN` secret
6. Add site ID as `NETLIFY_SITE_ID` secret

### Option C: Custom Hosting

Update deployment workflows to use your hosting provider's CLI/API.

---

## Step 6: Update Deployment Workflows

### 6.1 Update Staging Workflow

Edit `.github/workflows/deploy-staging.yml`:

1. Replace frontend deployment placeholder (line ~60):
```yaml
# For Vercel:
- name: Deploy Frontend to Vercel
  run: |
    npm install -g vercel
    vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}

# OR for Netlify:
- name: Deploy Frontend to Netlify
  run: |
    npm install -g netlify-cli
    netlify deploy --prod --site=${{ secrets.NETLIFY_SITE_ID }} --auth=${{ secrets.NETLIFY_AUTH_TOKEN }}
```

### 6.2 Update Production Workflow

Edit `.github/workflows/deploy-production.yml`:

1. Update frontend deployment (line ~120) - same as staging
2. Update CDN cache clearing (line ~240):
```yaml
# For Cloudflare:
- name: Clear CDN cache
  run: |
    curl -X POST "https://api.cloudflare.com/client/v4/zones/${{ secrets.CLOUDFLARE_ZONE_ID }}/purge_cache" \
      -H "Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}'
```

---

## Step 7: Test Deployments

### 7.1 Test Staging Deployment

1. Create a test branch from `develop`:
   ```bash
   git checkout develop
   git checkout -b test/staging-deployment
   git push origin test/staging-deployment
   ```

2. Merge to `develop`:
   ```bash
   git checkout develop
   git merge test/staging-deployment
   git push origin develop
   ```

3. Monitor GitHub Actions:
   - Go to **Actions** → **Deploy to Staging**
   - Verify all steps complete successfully
   - Check staging URL works

### 7.2 Test Production Deployment

1. Merge `develop` to `main`:
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. **Manual approval required:**
   - Go to **Actions** → **Deploy to Production**
   - Workflow will pause at "Waiting for approval"
   - Reviewer clicks **Review deployments** → **Approve and deploy**

3. Monitor deployment:
   - Verify pre-deployment checks pass
   - Verify edge functions deploy
   - Verify frontend deploys
   - Verify health checks pass

4. **If deployment fails:**
   - Workflow automatically initiates rollback
   - Check logs in GitHub Actions
   - Review error messages
   - Fix issue and redeploy

---

## Step 8: Verify Deployments

### Staging Verification

```bash
# Check frontend
curl https://staging.your-app.com/health

# Check edge functions
curl https://your-staging-project.supabase.co/functions/v1/health-check \
  -H "Authorization: Bearer YOUR_STAGING_ANON_KEY"

# Check Redis
curl https://your-staging-redis.upstash.io/ping \
  -H "Authorization: Bearer YOUR_STAGING_REDIS_TOKEN"
```

### Production Verification

```bash
# Check frontend
curl https://your-app.com/health

# Check edge functions
curl https://your-production-project.supabase.co/functions/v1/health-check \
  -H "Authorization: Bearer YOUR_PRODUCTION_ANON_KEY"

# Verify authentication
curl https://your-production-project.supabase.co/auth/v1/health \
  -H "apikey: YOUR_PRODUCTION_ANON_KEY"
```

---

## Deployment Workflow Summary

### Staging (Auto-Deploy)
```
Push to develop
    ↓
Run tests
    ↓
Build application
    ↓
Deploy edge functions
    ↓
Deploy frontend
    ↓
Run migrations
    ↓
Health checks
    ↓
✅ Deployed to staging
```

### Production (Manual Approval)
```
Push to main
    ↓
Pre-deployment checks
    ↓
⏸ Wait for manual approval (required reviewer)
    ↓
Create backup
    ↓
Deploy edge functions
    ↓
Run migrations
    ↓
Deploy frontend
    ↓
Warm up application
    ↓
Health checks
    ↓
Smoke tests
    ↓
✅ Deployed to production
```

---

## Rollback Procedure

### Manual Rollback (Emergency)

1. **Revert to previous commit:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Redeploy previous version:**
   - Go to **Actions** → **Deploy to Production**
   - Find last successful deployment
   - Click **Re-run all jobs**

3. **Database rollback (if needed):**
   ```bash
   supabase db reset --linked
   supabase db push --db-url=<backup-connection-string>
   ```

### Automated Rollback (Built-in)

Production workflow automatically initiates rollback on failure:
- Edge functions reverted to previous deployment
- Database migrations rolled back
- Slack notification sent (if configured)
- Manual verification required

---

## Monitoring Deployments

### GitHub Actions Dashboard

- **Actions** tab shows all workflow runs
- Green checkmark = success
- Red X = failure
- Yellow dot = in progress

### Deployment Logs

- Click on any workflow run
- Click on job name to see detailed logs
- Download artifacts for troubleshooting

### Slack Notifications (Optional)

Uncomment Slack notification blocks in workflows to enable:
```yaml
- name: Notify Deployment Success
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"✅ Production deployment successful!"}'
```

---

## Troubleshooting

### Common Issues

**Issue:** "Supabase CLI not authenticated"
- **Fix:** Verify `SUPABASE_ACCESS_TOKEN` is correct

**Issue:** "Health check failed"
- **Fix:** Check edge function is deployed and responding

**Issue:** "Bundle size exceeded"
- **Fix:** Run `npm run build` locally and analyze bundle size

**Issue:** "Database migration failed"
- **Fix:** Test migration locally with `supabase db push`

**Issue:** "Required reviewers not available"
- **Fix:** Add additional reviewers to production environment settings

---

## Security Checklist

Before going live:

- ✅ Production environment has required reviewers
- ✅ All secrets use different values than staging
- ✅ Database passwords are strong (16+ characters)
- ✅ Encryption keys are 32-byte random strings
- ✅ Access tokens have minimum required permissions
- ✅ Secrets are never logged in workflow output
- ✅ Health check endpoint doesn't expose sensitive info
- ✅ Rollback procedure tested and documented

---

## Next Steps

1. Complete Phase 6: Add status badges to README
2. Complete Phase 7: Implement PR automation
3. Complete Phase 8: Add performance monitoring

---

**Deployment workflows are now configured!** 🚀

Test staging deployment first, then proceed to production with manual approval.

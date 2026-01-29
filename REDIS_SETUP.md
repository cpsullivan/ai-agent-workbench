# Redis Caching Setup Guide

**Phase 2.3: Performance Optimization**

This guide explains how to set up Upstash Redis for caching in the AI Agent Workbench.

---

## Overview

Redis caching provides:
- **15-minute TTL** for active session state
- **5-minute TTL** for quota checks and usage summaries
- **1-hour TTL** for user preferences
- **24-hour TTL** for cost estimates
- **50%+ cache hit rate** target

---

## Setup Instructions

### 1. Create Upstash Redis Instance

1. Go to [Upstash Console](https://console.upstash.com/)
2. Click "Create Database"
3. Choose:
   - **Name:** ai-agent-workbench-cache
   - **Region:** Choose closest to your Supabase region
   - **Type:** Pay as you go (free tier available)
4. Click "Create"

### 2. Get Redis Credentials

After creating the database:
1. Go to database details
2. Copy **REST URL** (e.g., `https://us1-xxx.upstash.io`)
3. Copy **REST Token** (starts with `AX...`)

### 3. Configure Supabase Edge Functions

Add environment variables to Supabase:

```bash
# Using Supabase CLI
supabase secrets set UPSTASH_REDIS_REST_URL=https://us1-xxx.upstash.io
supabase secrets set UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxxxxx
```

Or via Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add secrets:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 4. Configure Local Development

Create `.env.local` file in `supabase/` directory:

```bash
UPSTASH_REDIS_REST_URL=https://us1-xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxxxxx
```

**Important:** Add `.env.local` to `.gitignore` to avoid committing secrets!

### 5. Verify Setup

Test the connection:

```bash
# Using Supabase CLI
supabase functions deploy health-check
curl https://your-project.supabase.co/functions/v1/health-check
```

Expected response:
```json
{
  "status": "healthy",
  "cache": {
    "enabled": true,
    "connected": true,
    "keyCount": 0
  }
}
```

---

## Cache Usage

### Automatic Caching

The cache is automatically used by:
- **Quota checks** - 5-minute cache
- **Usage summaries** - 5-minute cache
- **Cost estimates** - 24-hour cache
- **Session state** - 15-minute cache (when implemented)

### Manual Cache Operations

```typescript
import * as cache from '@/functions/_shared/cache.ts';

// Get cached value
const value = await cache.get('my-key');

// Set cached value with TTL
await cache.set('my-key', { data: 'value' }, cache.TTL.MEDIUM);

// Get or set (fetch if not in cache)
const data = await cache.getOrSet(
  'my-key',
  async () => {
    // Fetch from database
    return await fetchFromDB();
  },
  cache.TTL.LONG
);

// Delete from cache
await cache.del('my-key');

// Delete all keys matching pattern
await cache.delPattern('session:*');
```

---

## Cache Keys

The system uses standardized cache keys:

| Type | Key Pattern | TTL | Example |
|------|-------------|-----|---------|
| Session State | `session:{id}:state` | 15 min | `session:abc123:state` |
| User Preferences | `user:{id}:prefs` | 1 hour | `user:user-456:prefs` |
| Quota Check | `quota:{org}:{provider}:{model}` | 5 min | `quota:org-123:openai:gpt-4` |
| Usage Summary | `usage:{org}:{start}:{end}` | 5 min | `usage:org-123:2024-01-01:2024-01-31` |
| Cost Estimate | `cost:{provider}:{model}` | 24 hours | `cost:openai:gpt-4` |

---

## Cache Invalidation

### Automatic Invalidation

Cache is automatically invalidated when:
- **TTL expires** - Redis automatically removes expired keys
- **Quota updated** - All org quota caches cleared
- **Session updated** - Session state cache cleared

### Manual Invalidation

```typescript
import * as cache from '@/functions/_shared/cache.ts';

// Invalidate session
await cache.invalidateSession('session-id');

// Invalidate all organization quotas
await cache.invalidateOrganizationQuotas('org-id');

// Clear all caches (use with caution!)
await cache.delPattern('*');
```

---

## Monitoring

### Cache Statistics

Get cache stats via health check endpoint:

```bash
curl https://your-project.supabase.co/functions/v1/health-check
```

Response:
```json
{
  "cache": {
    "enabled": true,
    "connected": true,
    "keyCount": 1234
  }
}
```

### Upstash Dashboard

Monitor cache usage in Upstash Console:
- **Total Keys** - Number of cached items
- **Hit Rate** - Cache effectiveness (target: > 50%)
- **Memory Usage** - Redis memory consumption
- **Request Count** - Total cache operations

---

## Performance Impact

### Expected Improvements

With caching enabled:
- **Quota checks:** 100ms → 10ms (90% faster)
- **Usage summaries:** 500ms → 50ms (90% faster)
- **Cost estimates:** 100ms → 5ms (95% faster)
- **Database load:** Reduced by 50%+

### Cache Hit Rate Targets

- **Quota checks:** 80%+ (same org/model checked repeatedly)
- **Usage summaries:** 60%+ (dashboard refreshes)
- **Cost estimates:** 95%+ (pricing rarely changes)
- **Session state:** 70%+ (active sessions accessed frequently)

---

## Troubleshooting

### Cache Not Working

**Symptoms:** All cache operations return null

**Solutions:**
1. Check environment variables are set:
   ```bash
   supabase secrets list
   ```
2. Verify Redis URL and token are correct
3. Check Upstash dashboard - is database active?
4. Test connection:
   ```bash
   curl -X GET \
     -H "Authorization: Bearer YOUR_TOKEN" \
     https://YOUR_URL/ping
   ```

### High Memory Usage

**Symptoms:** Upstash shows high memory usage

**Solutions:**
1. Reduce TTL values for large objects
2. Review cached data size
3. Implement cache size limits
4. Use cache eviction policies (LRU)

### Low Hit Rate

**Symptoms:** Cache hit rate < 30%

**Solutions:**
1. Increase TTL for stable data
2. Identify cache misses in logs
3. Preload frequently accessed data
4. Review cache key patterns

### Connection Errors

**Symptoms:** "Failed to connect to Redis"

**Solutions:**
1. Check network connectivity
2. Verify Upstash region matches Supabase region
3. Check firewall rules
4. Review Upstash status page

---

## Cost Estimation

### Upstash Pricing

Free tier includes:
- **10,000 commands/day**
- **256 MB storage**
- **100 MB bandwidth/day**

Paid tier:
- **$0.20 per 100K commands**
- **$0.25 per GB storage**
- **$0.15 per GB bandwidth**

### Expected Usage

For 100 concurrent users:
- **Commands:** ~50K/day (within free tier)
- **Storage:** ~50 MB (within free tier)
- **Bandwidth:** ~20 MB/day (within free tier)

For 1000 concurrent users:
- **Commands:** ~500K/day (~$1/day)
- **Storage:** ~200 MB (within free tier)
- **Bandwidth:** ~150 MB/day (within free tier)

**Estimated cost for 100 users:** $0/month (free tier)
**Estimated cost for 1000 users:** ~$30/month

---

## Best Practices

### 1. Choose Appropriate TTLs

```typescript
// Frequently changing data - short TTL
await cache.set('key', value, cache.TTL.SHORT); // 1 minute

// Occasionally changing data - medium TTL
await cache.set('key', value, cache.TTL.MEDIUM); // 5 minutes

// Rarely changing data - long TTL
await cache.set('key', value, cache.TTL.LONG); // 1 hour
```

### 2. Handle Cache Failures Gracefully

```typescript
const cached = await cache.get('key');
if (cached !== null) {
  return cached; // Use cache
}

// Fallback to database if cache fails
const data = await fetchFromDatabase();
return data;
```

### 3. Invalidate on Updates

```typescript
// Update database
await updateDatabase(data);

// Invalidate cache
await cache.del('key');
```

### 4. Use Batch Operations

```typescript
// Bad: Multiple single operations
for (const key of keys) {
  await cache.del(key);
}

// Good: Single pattern delete
await cache.delPattern('prefix:*');
```

### 5. Monitor Cache Performance

```typescript
// Track cache hits/misses
const start = Date.now();
const cached = await cache.get('key');
const duration = Date.now() - start;

if (cached !== null) {
  console.log(`Cache HIT (${duration}ms)`);
} else {
  console.log(`Cache MISS (${duration}ms)`);
}
```

---

## Migration Checklist

When adding caching to existing code:

- [ ] Create Upstash Redis instance
- [ ] Add environment variables to Supabase
- [ ] Test connection with health check
- [ ] Import cache module in functions
- [ ] Wrap database calls with cache.getOrSet()
- [ ] Add cache invalidation on updates
- [ ] Monitor cache hit rate (target: > 50%)
- [ ] Adjust TTLs based on performance
- [ ] Document cache keys used
- [ ] Update team on caching strategy

---

## Next Steps

After setting up Redis caching:
1. Monitor cache hit rate in Upstash dashboard
2. Optimize TTLs based on actual usage patterns
3. Implement additional caching for session state
4. Consider caching workflow definitions
5. Set up alerts for cache failures

---

**Last Updated:** January 28, 2026
**Phase:** 2.3 - Performance Optimization
**Version:** 1.0

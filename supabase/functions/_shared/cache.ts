/**
 * Redis Cache Wrapper
 *
 * Provides caching utilities using Upstash Redis
 * 15-minute TTL for active session data
 *
 * @module cache
 */

import { Redis } from 'https://esm.sh/@upstash/redis@1.25.1';

// ============================================================================
// Configuration
// ============================================================================

const REDIS_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const REDIS_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

const CACHE_ENABLED = Boolean(REDIS_URL && REDIS_TOKEN);

// Initialize Redis client
let redis: Redis | null = null;

if (CACHE_ENABLED) {
  redis = new Redis({
    url: REDIS_URL!,
    token: REDIS_TOKEN!,
  });
}

// ============================================================================
// Cache TTL Constants (in seconds)
// ============================================================================

export const TTL = {
  SESSION_STATE: 15 * 60, // 15 minutes
  USER_PREFERENCES: 60 * 60, // 1 hour
  QUOTA_CHECK: 5 * 60, // 5 minutes
  USAGE_SUMMARY: 5 * 60, // 5 minutes
  COST_ESTIMATES: 24 * 60 * 60, // 24 hours
  SHORT: 60, // 1 minute
  MEDIUM: 5 * 60, // 5 minutes
  LONG: 60 * 60, // 1 hour
} as const;

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Generate cache key for session state
 */
export function sessionStateKey(sessionId: string): string {
  return `session:${sessionId}:state`;
}

/**
 * Generate cache key for user preferences
 */
export function userPreferencesKey(userId: string): string {
  return `user:${userId}:prefs`;
}

/**
 * Generate cache key for quota check
 */
export function quotaCheckKey(
  organizationId: string,
  provider: string,
  model: string
): string {
  return `quota:${organizationId}:${provider}:${model}`;
}

/**
 * Generate cache key for usage summary
 */
export function usageSummaryKey(
  organizationId: string,
  startDate: string,
  endDate: string
): string {
  return `usage:${organizationId}:${startDate}:${endDate}`;
}

/**
 * Generate cache key for cost estimates
 */
export function costEstimateKey(provider: string, model: string): string {
  return `cost:${provider}:${model}`;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  if (!CACHE_ENABLED || !redis) {
    return null;
  }

  try {
    const value = await redis.get<T>(key);
    return value;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
export async function set(
  key: string,
  value: any,
  ttl: number = TTL.MEDIUM
): Promise<boolean> {
  if (!CACHE_ENABLED || !redis) {
    return false;
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

/**
 * Delete value from cache
 */
export async function del(key: string): Promise<boolean> {
  if (!CACHE_ENABLED || !redis) {
    return false;
  }

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

/**
 * Delete multiple keys matching pattern
 */
export async function delPattern(pattern: string): Promise<number> {
  if (!CACHE_ENABLED || !redis) {
    return 0;
  }

  try {
    // Scan for keys matching pattern
    let cursor = 0;
    let deletedCount = 0;
    const keys: string[] = [];

    do {
      const result = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });

      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    // Delete all matching keys
    if (keys.length > 0) {
      await redis.del(...keys);
      deletedCount = keys.length;
    }

    return deletedCount;
  } catch (error) {
    console.error('Cache delete pattern error:', error);
    return 0;
  }
}

/**
 * Check if key exists in cache
 */
export async function exists(key: string): Promise<boolean> {
  if (!CACHE_ENABLED || !redis) {
    return false;
  }

  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error('Cache exists error:', error);
    return false;
  }
}

/**
 * Get TTL of key
 */
export async function ttl(key: string): Promise<number> {
  if (!CACHE_ENABLED || !redis) {
    return -1;
  }

  try {
    return await redis.ttl(key);
  } catch (error) {
    console.error('Cache TTL error:', error);
    return -1;
  }
}

/**
 * Increment counter in cache
 */
export async function incr(key: string): Promise<number> {
  if (!CACHE_ENABLED || !redis) {
    return 0;
  }

  try {
    return await redis.incr(key);
  } catch (error) {
    console.error('Cache incr error:', error);
    return 0;
  }
}

/**
 * Decrement counter in cache
 */
export async function decr(key: string): Promise<number> {
  if (!CACHE_ENABLED || !redis) {
    return 0;
  }

  try {
    return await redis.decr(key);
  } catch (error) {
    console.error('Cache decr error:', error);
    return 0;
  }
}

// ============================================================================
// Higher-Level Cache Functions
// ============================================================================

/**
 * Get or set cached value
 * If value exists in cache, return it. Otherwise, fetch from source and cache it.
 */
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = TTL.MEDIUM
): Promise<T> {
  // Try to get from cache
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch from source
  const value = await fetchFn();

  // Store in cache
  await set(key, value, ttl);

  return value;
}

/**
 * Cache session state
 */
export async function cacheSessionState(
  sessionId: string,
  state: any
): Promise<boolean> {
  const key = sessionStateKey(sessionId);
  return await set(key, state, TTL.SESSION_STATE);
}

/**
 * Get cached session state
 */
export async function getCachedSessionState<T>(
  sessionId: string
): Promise<T | null> {
  const key = sessionStateKey(sessionId);
  return await get<T>(key);
}

/**
 * Invalidate session cache
 */
export async function invalidateSession(sessionId: string): Promise<boolean> {
  const key = sessionStateKey(sessionId);
  return await del(key);
}

/**
 * Cache user preferences
 */
export async function cacheUserPreferences(
  userId: string,
  preferences: any
): Promise<boolean> {
  const key = userPreferencesKey(userId);
  return await set(key, preferences, TTL.USER_PREFERENCES);
}

/**
 * Get cached user preferences
 */
export async function getCachedUserPreferences<T>(
  userId: string
): Promise<T | null> {
  const key = userPreferencesKey(userId);
  return await get<T>(key);
}

/**
 * Cache quota check result
 */
export async function cacheQuotaCheck(
  organizationId: string,
  provider: string,
  model: string,
  result: any
): Promise<boolean> {
  const key = quotaCheckKey(organizationId, provider, model);
  return await set(key, result, TTL.QUOTA_CHECK);
}

/**
 * Get cached quota check
 */
export async function getCachedQuotaCheck<T>(
  organizationId: string,
  provider: string,
  model: string
): Promise<T | null> {
  const key = quotaCheckKey(organizationId, provider, model);
  return await get<T>(key);
}

/**
 * Invalidate all quota caches for organization
 */
export async function invalidateOrganizationQuotas(
  organizationId: string
): Promise<number> {
  const pattern = `quota:${organizationId}:*`;
  return await delPattern(pattern);
}

/**
 * Cache usage summary
 */
export async function cacheUsageSummary(
  organizationId: string,
  startDate: string,
  endDate: string,
  summary: any
): Promise<boolean> {
  const key = usageSummaryKey(organizationId, startDate, endDate);
  return await set(key, summary, TTL.USAGE_SUMMARY);
}

/**
 * Get cached usage summary
 */
export async function getCachedUsageSummary<T>(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<T | null> {
  const key = usageSummaryKey(organizationId, startDate, endDate);
  return await get<T>(key);
}

/**
 * Cache cost estimate
 */
export async function cacheCostEstimate(
  provider: string,
  model: string,
  estimate: any
): Promise<boolean> {
  const key = costEstimateKey(provider, model);
  return await set(key, estimate, TTL.COST_ESTIMATES);
}

/**
 * Get cached cost estimate
 */
export async function getCachedCostEstimate<T>(
  provider: string,
  model: string
): Promise<T | null> {
  const key = costEstimateKey(provider, model);
  return await get<T>(key);
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  enabled: boolean;
  connected: boolean;
  keyCount?: number;
}> {
  if (!CACHE_ENABLED || !redis) {
    return {
      enabled: false,
      connected: false,
    };
  }

  try {
    // Try to ping Redis
    await redis.ping();

    // Get approximate key count (using DBSIZE)
    const keyCount = await redis.dbsize();

    return {
      enabled: true,
      connected: true,
      keyCount,
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return {
      enabled: true,
      connected: false,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  get,
  set,
  del,
  delPattern,
  exists,
  ttl,
  incr,
  decr,
  getOrSet,
  cacheSessionState,
  getCachedSessionState,
  invalidateSession,
  cacheUserPreferences,
  getCachedUserPreferences,
  cacheQuotaCheck,
  getCachedQuotaCheck,
  invalidateOrganizationQuotas,
  cacheUsageSummary,
  getCachedUsageSummary,
  cacheCostEstimate,
  getCachedCostEstimate,
  getCacheStats,
  TTL,
};

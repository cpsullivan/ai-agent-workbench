/**
 * Lazy Loading Utilities
 *
 * Utilities for code splitting and lazy loading components
 * Reduces initial bundle size and improves load time
 *
 * @module lazyLoad
 */

import React, { lazy, type ComponentType } from 'react';

// ============================================================================
// Types
// ============================================================================

interface RetryOptions {
  retries?: number;
  delay?: number;
}

// ============================================================================
// Lazy Load with Retry
// ============================================================================

/**
 * Lazy load a component with automatic retry on failure
 *
 * Handles network failures gracefully by retrying the import
 *
 * @param importFn - Dynamic import function
 * @param options - Retry options
 * @returns Lazy-loaded component
 *
 * @example
 * ```tsx
 * const Dashboard = lazyWithRetry(() => import('./Dashboard'));
 * ```
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: RetryOptions = {}
): React.LazyExoticComponent<T> {
  const { retries = 3, delay = 1000 } = options;

  return lazy(async () => {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        return await importFn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (i < retries - 1) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, delay * Math.pow(2, i))
          );
        }
      }
    }

    // All retries failed
    throw lastError;
  });
}

// ============================================================================
// Preload Function
// ============================================================================

/**
 * Preload a lazy component before it's needed
 *
 * Useful for preloading components that will likely be needed soon
 *
 * @param importFn - Dynamic import function
 *
 * @example
 * ```tsx
 * // Preload on hover
 * <button onMouseEnter={() => preload(() => import('./HeavyComponent'))}>
 *   Load Heavy Component
 * </button>
 * ```
 */
export function preload<T>(
  importFn: () => Promise<{ default: T }>
): Promise<{ default: T }> {
  return importFn();
}

// ============================================================================
// Lazy Components with Preload
// ============================================================================

/**
 * Create a lazy component with a preload function
 *
 * Returns both the lazy component and a preload function
 *
 * @param importFn - Dynamic import function
 * @returns Object with component and preload function
 *
 * @example
 * ```tsx
 * const { Component: Dashboard, preload: preloadDashboard } = lazyWithPreload(
 *   () => import('./Dashboard')
 * );
 *
 * // Preload on route hover
 * <Link to="/dashboard" onMouseEnter={preloadDashboard}>
 *   Dashboard
 * </Link>
 * ```
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): {
  Component: React.LazyExoticComponent<T>;
  preload: () => Promise<{ default: T }>;
} {
  return {
    Component: lazy(importFn),
    preload: () => preload(importFn),
  };
}

// ============================================================================
// Loading Component
// ============================================================================

/**
 * Default loading component for Suspense fallback
 */
export function DefaultLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

/**
 * Minimal loading component (for small components)
 */
export function MinimalLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    </div>
  );
}

/**
 * Full-page loading component
 */
export function FullPageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

// ============================================================================
// Chunk Names
// ============================================================================

/**
 * Add webpack magic comment for chunk naming
 *
 * @param chunkName - Name for the chunk
 * @param importFn - Dynamic import function
 *
 * @example
 * ```tsx
 * const Dashboard = lazy(() =>
 *   withChunkName('dashboard', () => import('./Dashboard'))
 * );
 * ```
 */
export function withChunkName<T>(
  _chunkName: string,
  importFn: () => Promise<{ default: T }>
): Promise<{ default: T }> {
  // The chunk name is actually specified in the import comment
  // This is just a helper for documentation
  return importFn();
}

// ============================================================================
// Lazy Route Loading
// ============================================================================

/**
 * Load route component with code splitting
 *
 * @param importFn - Dynamic import function for route component
 * @returns Lazy-loaded route component
 */
export function lazyRoute<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazyWithRetry(importFn, { retries: 3, delay: 500 });
}

// ============================================================================
// Lazy Modal Loading
// ============================================================================

/**
 * Load modal component lazily
 *
 * Modals are often large and only needed when opened
 *
 * @param importFn - Dynamic import function for modal component
 * @returns Lazy-loaded modal component
 */
export function lazyModal<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazyWithRetry(importFn, { retries: 2, delay: 300 });
}

// ============================================================================
// Prefetch Utilities
// ============================================================================

/**
 * Prefetch a module when browser is idle
 *
 * @param importFn - Dynamic import function
 */
export function prefetchOnIdle<T>(
  importFn: () => Promise<{ default: T }>
): void {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      preload(importFn);
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      preload(importFn);
    }, 1000);
  }
}

/**
 * Prefetch a module when visible in viewport
 *
 * @param element - DOM element to observe
 * @param importFn - Dynamic import function
 */
export function prefetchOnVisible<T>(
  element: HTMLElement,
  importFn: () => Promise<{ default: T }>
): void {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          preload(importFn);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    observer.observe(element);
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  lazyWithRetry,
  lazyWithPreload,
  preload,
  lazyRoute,
  lazyModal,
  prefetchOnIdle,
  prefetchOnVisible,
  DefaultLoadingFallback,
  MinimalLoadingFallback,
  FullPageLoadingFallback,
};

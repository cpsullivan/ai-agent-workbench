/**
 * Debounce Hook
 *
 * React hooks for debouncing values and callbacks
 * Reduces unnecessary re-renders and API calls
 *
 * @module useDebounce
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// useDebounce Hook
// ============================================================================

/**
 * Debounce a value
 *
 * Returns a debounced version of the value that only updates after
 * the specified delay has passed without changes
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced value
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   // This only runs when user stops typing for 300ms
 *   fetchResults(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timeout to update debounced value
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// useDebouncedCallback Hook
// ============================================================================

/**
 * Debounce a callback function
 *
 * Returns a debounced version of the callback that will only execute
 * after the specified delay has passed without being called again
 *
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @param deps - Dependency array for callback
 * @returns Debounced callback
 *
 * @example
 * ```tsx
 * const handleSearch = useDebouncedCallback(
 *   (term: string) => {
 *     fetchResults(term);
 *   },
 *   300,
 *   []
 * );
 *
 * <input onChange={(e) => handleSearch(e.target.value)} />
 * ```
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300,
  deps: React.DependencyList = []
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<number | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [delay, ...deps] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// ============================================================================
// useThrottle Hook
// ============================================================================

/**
 * Throttle a value
 *
 * Returns a throttled version of the value that updates at most
 * once per specified interval
 *
 * @param value - Value to throttle
 * @param interval - Minimum interval in milliseconds (default: 100ms)
 * @returns Throttled value
 *
 * @example
 * ```tsx
 * const [scrollPosition, setScrollPosition] = useState(0);
 * const throttledScrollPosition = useThrottle(scrollPosition, 100);
 *
 * // Scroll position only updates every 100ms
 * ```
 */
export function useThrottle<T>(value: T, interval: number = 100): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= interval) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, interval - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, interval]);

  return throttledValue;
}

// ============================================================================
// useThrottledCallback Hook
// ============================================================================

/**
 * Throttle a callback function
 *
 * Returns a throttled version of the callback that will execute
 * at most once per specified interval
 *
 * @param callback - Function to throttle
 * @param interval - Minimum interval in milliseconds (default: 100ms)
 * @param deps - Dependency array for callback
 * @returns Throttled callback
 *
 * @example
 * ```tsx
 * const handleScroll = useThrottledCallback(
 *   (event: Event) => {
 *     updateScrollPosition(event);
 *   },
 *   100,
 *   []
 * );
 *
 * <div onScroll={handleScroll} />
 * ```
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number = 100,
  deps: React.DependencyList = []
): (...args: Parameters<T>) => void {
  const lastRan = useRef(Date.now());
  const timeoutRef = useRef<number | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastRan.current >= interval) {
        // Execute immediately if interval has passed
        callback(...args);
        lastRan.current = now;
      } else {
        // Schedule for later if interval hasn't passed
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRan.current = Date.now();
        }, interval - (now - lastRan.current));
      }
    },
    [interval, ...deps] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// ============================================================================
// useDebounceState Hook
// ============================================================================

/**
 * State hook with built-in debouncing
 *
 * Returns [value, setValue, debouncedValue]
 *
 * @param initialValue - Initial state value
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @returns [value, setValue, debouncedValue]
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm, debouncedSearchTerm] = useDebounceState('', 300);
 *
 * <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
 *
 * useEffect(() => {
 *   // Only runs when user stops typing
 *   fetchResults(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 * ```
 */
export function useDebounceState<T>(
  initialValue: T,
  delay: number = 300
): [T, React.Dispatch<React.SetStateAction<T>>, T] {
  const [value, setValue] = useState<T>(initialValue);
  const debouncedValue = useDebounce(value, delay);

  return [value, setValue, debouncedValue];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a debounced function (non-hook version)
 *
 * Use this outside of React components
 *
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number = 300
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  let timeoutId: number | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  return debounced;
}

/**
 * Create a throttled function (non-hook version)
 *
 * Use this outside of React components
 *
 * @param func - Function to throttle
 * @param interval - Minimum interval in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  interval: number = 100
): (...args: Parameters<T>) => void {
  let lastRan = 0;
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastRan >= interval) {
      func(...args);
      lastRan = now;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        func(...args);
        lastRan = Date.now();
      }, interval - (now - lastRan));
    }
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback,
  useDebounceState,
  debounce,
  throttle,
};

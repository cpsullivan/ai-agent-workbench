# Debounce & Throttle Usage Examples

**Phase 2.3: Performance Optimization**

This guide shows how to use debouncing and throttling to improve performance and reduce unnecessary operations.

---

## Overview

**Debouncing:** Delays execution until after a certain time has passed without the event firing
**Throttling:** Limits execution to at most once per specified interval

### When to Use

| Scenario | Use | Delay/Interval |
|----------|-----|----------------|
| Search input | Debounce | 300ms |
| Form validation | Debounce | 300ms |
| Auto-save | Debounce | 1000ms |
| Window resize | Throttle | 100ms |
| Scroll events | Throttle | 100ms |
| Mouse move | Throttle | 50ms |
| API calls on input | Debounce | 500ms |
| State updates | Debounce | 300ms |

---

## useDebounce Examples

### Example 1: Search Input

```typescript
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

function SearchBar() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (debouncedSearchTerm) {
      // Only runs when user stops typing for 300ms
      fetchSearchResults(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

**Benefits:**
- Reduces API calls from 10+ per second to 1 every 300ms
- Improves server load by 90%+
- Better user experience (no flickering results)

### Example 2: Auto-Save

```typescript
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

function Editor() {
  const [content, setContent] = useState('');
  const debouncedContent = useDebounce(content, 1000);

  useEffect(() => {
    // Auto-save after 1 second of no typing
    saveToServer(debouncedContent);
  }, [debouncedContent]);

  return (
    <textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
    />
  );
}
```

**Benefits:**
- Saves every 1 second instead of every keystroke
- Reduces database writes by 95%+
- No data loss with reasonable save interval

### Example 3: Form Validation

```typescript
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

function EmailInput() {
  const [email, setEmail] = useState('');
  const [isValid, setIsValid] = useState(true);
  const debouncedEmail = useDebounce(email, 300);

  useEffect(() => {
    // Validate only after user stops typing
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail);
    setIsValid(valid);
  }, [debouncedEmail]);

  return (
    <div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={isValid ? '' : 'border-red-500'}
      />
      {!isValid && <span className="text-red-500">Invalid email</span>}
    </div>
  );
}
```

---

## useDebouncedCallback Examples

### Example 4: Filter Updates

```typescript
import { useDebouncedCallback } from '@/hooks/useDebounce';

function FilterPanel() {
  const handleFilterChange = useDebouncedCallback(
    (filters: FilterOptions) => {
      // API call to fetch filtered data
      fetchData(filters);
    },
    500,
    []
  );

  return (
    <div>
      <input
        type="text"
        onChange={(e) => handleFilterChange({ search: e.target.value })}
      />
      <select
        onChange={(e) => handleFilterChange({ category: e.target.value })}
      >
        {/* options */}
      </select>
    </div>
  );
}
```

### Example 5: Session State Updates

```typescript
import { useDebouncedCallback } from '@/hooks/useDebounce';

function SessionEditor() {
  const updateSession = useDebouncedCallback(
    async (updates: Partial<Session>) => {
      // Save to database
      await supabase
        .from('free_agent_sessions')
        .update(updates)
        .eq('id', sessionId);
    },
    1000,
    [sessionId]
  );

  const handleMessageAdd = (message: Message) => {
    // Update local state immediately
    setMessages((prev) => [...prev, message]);

    // Debounced save to database
    updateSession({ messages: [...messages, message] });
  };

  return <ChatInterface onMessageSend={handleMessageAdd} />;
}
```

**Benefits:**
- Updates UI immediately (no lag)
- Batches database writes
- Reduces database load by 80%+

---

## useThrottle Examples

### Example 6: Scroll Position Tracking

```typescript
import { useState, useEffect } from 'react';
import { useThrottle } from '@/hooks/useDebounce';

function ScrollTracker() {
  const [scrollPosition, setScrollPosition] = useState(0);
  const throttledScrollPosition = useThrottle(scrollPosition, 100);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Only runs at most once per 100ms
    updateScrollIndicator(throttledScrollPosition);
  }, [throttledScrollPosition]);

  return <ScrollIndicator position={throttledScrollPosition} />;
}
```

### Example 7: Workflow Node Dragging

```typescript
import { useThrottledCallback } from '@/hooks/useDebounce';

function WorkflowCanvas() {
  const handleNodeMove = useThrottledCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      // Update node position (expensive operation)
      updateNodePosition(nodeId, position);
    },
    100,
    []
  );

  return (
    <DraggableNode
      onDrag={(position) => handleNodeMove(node.id, position)}
    />
  );
}
```

**Benefits:**
- Smooth dragging experience
- Reduces re-renders from 60/second to 10/second
- Lower CPU usage

---

## useDebounceState Examples

### Example 8: Search with State

```typescript
import { useEffect } from 'react';
import { useDebounceState } from '@/hooks/useDebounce';

function SearchableList() {
  const [searchTerm, setSearchTerm, debouncedSearchTerm] = useDebounceState('', 300);
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (debouncedSearchTerm) {
      fetchResults(debouncedSearchTerm).then(setResults);
    }
  }, [debouncedSearchTerm]);

  return (
    <div>
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search..."
      />
      <div className="text-sm text-gray-500">
        Searching for: {debouncedSearchTerm || 'nothing'}
      </div>
      <ResultsList results={results} />
    </div>
  );
}
```

---

## Integration Points

### Where to Add Debouncing in AI Agent Workbench

#### 1. Session Messages
**File:** `src/hooks/useFreeAgentSession.ts`

```typescript
import { useDebouncedCallback } from '@/hooks/useDebounce';

// Debounce message state updates
const updateMessagesDebounced = useDebouncedCallback(
  async (messages: Message[]) => {
    await supabase
      .from('free_agent_sessions')
      .update({ messages })
      .eq('id', sessionId);
  },
  1000,
  [sessionId]
);
```

**Impact:** Reduces database writes from 10+/second to 1/second

#### 2. Workflow Node Positions
**File:** `src/components/WorkflowBuilder.tsx`

```typescript
import { useThrottledCallback } from '@/hooks/useDebounce';

const handleNodeDrag = useThrottledCallback(
  (nodeId: string, position: Position) => {
    updateNodePosition(nodeId, position);
  },
  100,
  []
);
```

**Impact:** Reduces re-renders by 80%, smoother dragging

#### 3. Search/Filter Inputs
**File:** `src/components/Analytics/UsageDashboard.tsx`

```typescript
import { useDebounce } from '@/hooks/useDebounce';

const [filterText, setFilterText] = useState('');
const debouncedFilter = useDebounce(filterText, 300);

useEffect(() => {
  // Only re-fetch when user stops typing
  refetch({ filter: debouncedFilter });
}, [debouncedFilter]);
```

**Impact:** Reduces API calls by 90%+

#### 4. Usage Analytics Refresh
**File:** `src/hooks/useUsageMetrics.ts`

```typescript
import { useThrottledCallback } from '@/hooks/useDebounce';

const throttledRefetch = useThrottledCallback(
  () => {
    fetchUsageData();
  },
  5000, // At most once per 5 seconds
  []
);
```

**Impact:** Prevents excessive refetching

---

## Performance Improvements

### Before Debouncing

```
User types "hello" (5 keystrokes)
├─ API call 1: "h"
├─ API call 2: "he"
├─ API call 3: "hel"
├─ API call 4: "hell"
└─ API call 5: "hello"

Total: 5 API calls in ~500ms
```

### After Debouncing (300ms)

```
User types "hello" (5 keystrokes)
└─ (waits 300ms after last keystroke)
  └─ API call 1: "hello"

Total: 1 API call after 300ms delay
```

**Savings:** 80% fewer API calls

---

## Best Practices

### 1. Choose Appropriate Delays

```typescript
// Too short - not effective
useDebounce(value, 50); // ❌

// Good for search
useDebounce(value, 300); // ✅

// Good for auto-save
useDebounce(value, 1000); // ✅

// Too long - poor UX
useDebounce(value, 5000); // ❌
```

### 2. Combine with React.memo

```typescript
const ExpensiveComponent = React.memo(({ data }) => {
  // Expensive rendering
  return <div>{/* ... */}</div>;
});

function Parent() {
  const [value, setValue] = useState('');
  const debouncedValue = useDebounce(value, 300);

  // Only re-renders when debouncedValue changes
  return <ExpensiveComponent data={debouncedValue} />;
}
```

### 3. Use Throttle for Continuous Events

```typescript
// Good: Throttle for scroll
const handleScroll = useThrottledCallback(
  (e) => updatePosition(e),
  100,
  []
);

// Bad: Debounce for scroll (only fires when scrolling stops)
const handleScroll = useDebouncedCallback(
  (e) => updatePosition(e),
  100,
  []
);
```

### 4. Clean Up on Unmount

```typescript
import { debounce } from '@/hooks/useDebounce';

useEffect(() => {
  const debouncedHandler = debounce(() => {
    // Handle event
  }, 300);

  window.addEventListener('resize', debouncedHandler);

  return () => {
    // Cancel pending debounce
    debouncedHandler.cancel();
    window.removeEventListener('resize', debouncedHandler);
  };
}, []);
```

---

## Migration Checklist

When adding debouncing to existing code:

- [ ] Identify high-frequency state updates
- [ ] Choose appropriate delay/interval
- [ ] Import debounce hook
- [ ] Wrap value or callback
- [ ] Test that functionality still works
- [ ] Measure performance improvement
- [ ] Document the debounce delay chosen

---

## Monitoring Performance

### Before Adding Debouncing

```typescript
let callCount = 0;

function fetchData(query: string) {
  callCount++;
  console.log(`API call #${callCount}: ${query}`);
  // ... fetch logic
}
```

### After Adding Debouncing

```typescript
let callCount = 0;

const fetchDataDebounced = useDebouncedCallback(
  (query: string) => {
    callCount++;
    console.log(`API call #${callCount}: ${query}`);
    // ... fetch logic
  },
  300,
  []
);

// Monitor reduction in calls
console.log(`Total API calls: ${callCount}`);
```

---

**Last Updated:** January 28, 2026
**Phase:** 2.3 - Performance Optimization
**Version:** 1.0

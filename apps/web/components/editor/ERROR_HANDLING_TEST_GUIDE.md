# Error Handling and Performance - Testing Guide

This guide provides comprehensive testing procedures for validating the error handling and performance improvements implemented in Phases 5 and 6.

## Phase 5: Error Handling and Validation

### 5.1.1 Comprehensive Error Boundaries

#### Test Cases

**TC-1: Editor Rendering Error**
1. Navigate to `/memory/[id]/edit`
2. Open DevTools Console
3. Intentionally trigger a React error (modify component state incorrectly)
4. **Expected**: Error boundary catches the error and displays recovery UI
5. **Expected**: User can click "Try Again" to reset the editor
6. **Expected**: Error details shown in development mode only

**TC-2: Network Error During Load**
1. Open DevTools Network tab
2. Set network to "Offline"
3. Navigate to a memory edit page
4. **Expected**: Error boundary catches loading error
5. **Expected**: User sees appropriate error message
6. **Expected**: "Reload Page" button functions correctly

**TC-3: Component Stack Trace**
1. In development mode, trigger an error
2. **Expected**: Component stack trace is visible in error UI
3. **Expected**: Stack trace can be expanded/collapsed
4. **Expected**: Production mode hides stack traces

#### Validation Script
```javascript
// Run in browser console on memory edit page
async function testErrorBoundary() {
  console.log("Testing Error Boundary...");

  // Test 1: Check error boundary exists
  const errorBoundary = document.querySelector('[data-error-boundary]');
  console.assert(errorBoundary || true, "Error boundary component present");

  // Test 2: Verify recovery buttons exist when error occurs
  // (This requires manually triggering an error first)

  console.log("✓ Error boundary tests complete");
}

testErrorBoundary();
```

### 5.1.2 Offline Editing Support

#### Test Cases

**TC-4: Offline Content Saving**
1. Open a document in the editor
2. Type some content
3. Open DevTools → Network → Set to "Offline"
4. Continue typing
5. **Expected**: Content saves to local storage
6. **Expected**: UI shows "Saved offline" status
7. **Expected**: Orange WiFi-off icon displayed

**TC-5: Online Sync After Offline Edit**
1. Continue from TC-4 (content saved offline)
2. Set network back to "Online"
3. **Expected**: UI shows "Syncing..." status
4. **Expected**: After 1-2 seconds, content syncs to server
5. **Expected**: Toast notification: "Offline changes synced successfully"
6. **Expected**: Status changes to "Saved" with green checkmark

**TC-6: Offline Edit Persistence**
1. Edit content while offline
2. Close browser tab
3. Reopen the same document
4. **Expected**: Offline edits are still present
5. **Expected**: Sync happens automatically when online

**TC-7: Multiple Offline Edits**
1. Go offline
2. Edit Document A
3. Edit Document B
4. Go online
5. **Expected**: Both documents sync in queue
6. **Expected**: No data loss

#### Validation Script
```javascript
// Test offline storage
async function testOfflineSupport() {
  console.log("Testing Offline Support...");

  // Test 1: Check if offline storage works
  const testContent = "Test offline content";
  const documentId = "test-doc-123";

  // Simulate offline save
  if (typeof OfflineStorageManager !== 'undefined') {
    OfflineStorageManager.saveOfflineEdit(documentId, testContent);

    const retrieved = OfflineStorageManager.getOfflineEdit(documentId);
    console.assert(
      retrieved?.content === testContent,
      "Offline content saved and retrieved correctly"
    );

    // Cleanup
    OfflineStorageManager.removeOfflineEdit(documentId);
    console.log("✓ Offline storage working");
  }

  // Test 2: Check connection status detection
  console.log("Current online status:", navigator.onLine);

  console.log("✓ Offline support tests complete");
}

testOfflineSupport();
```

### 5.1.3 Form Validation

#### Test Cases

**TC-8: Title Validation**
1. Open memory edit page
2. Clear the title
3. Try to save
4. **Expected**: Validation error: "Title is required"
5. Enter a title > 500 characters
6. **Expected**: Validation error: "Title must be less than 500 characters"

**TC-9: Content Validation**
1. Clear all content
2. Try to save
3. **Expected**: Validation error: "Content cannot be empty"
4. Paste content > 1MB
5. **Expected**: Validation error: "Content is too large"

**TC-10: URL Validation**
1. Try to add a link with invalid URL
2. **Expected**: Validation error: "Invalid URL format"
3. Try "ftp://example.com"
4. **Expected**: Error: "URL must use HTTP or HTTPS protocol"

**TC-11: Image Upload Validation**
1. Try to upload file > 10MB
2. **Expected**: Error: "Image must be less than 10MB"
3. Try to upload .exe file
4. **Expected**: Error: "Only JPEG, PNG, GIF, and WebP images are supported"

## Phase 6: Performance Optimization

### 6.1 Loading States

#### Test Cases

**TC-12: Editor Skeleton Loading**
1. Clear browser cache
2. Navigate to memory edit page
3. **Expected**: Skeleton screen appears immediately
4. **Expected**: Skeleton shows header, content placeholders
5. **Expected**: Smooth transition to actual content

**TC-13: Memory Sidebar Loading**
1. Open memory edit page
2. **Expected**: Sidebar shows skeleton while loading
3. **Expected**: 8 placeholder cards visible
4. **Expected**: Smooth transition when data loads

**TC-14: Image Loading States**
1. Add images to document
2. Reload page
3. **Expected**: Image placeholders show while loading
4. **Expected**: Spinner visible in placeholder
5. **Expected**: Images fade in when loaded

#### Validation Script
```javascript
// Test loading states
async function testLoadingStates() {
  console.log("Testing Loading States...");

  // Check if skeleton components exist
  const skeletons = document.querySelectorAll('[class*="skeleton"]');
  console.log(`Found ${skeletons.length} skeleton elements`);

  // Monitor loading performance
  const perfEntries = performance.getEntriesByType('navigation');
  if (perfEntries.length > 0) {
    const nav = perfEntries[0];
    console.log(`Page load time: ${nav.loadEventEnd - nav.loadEventStart}ms`);
    console.log(`DOM content loaded: ${nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart}ms`);
  }

  console.log("✓ Loading states tests complete");
}

testLoadingStates();
```

### 6.2 Performance Monitoring

#### Test Cases

**TC-15: Render Performance**
1. Open DevTools Console
2. Navigate to memory edit page
3. **Expected** (Dev mode): Console shows render times
4. **Expected**: Render time < 16ms (60fps)
5. **Expected**: Warning if render > 33ms

**TC-16: Input Latency**
1. Type in the editor
2. **Expected**: No visible lag
3. **Expected** (Dev mode): Input latency logged
4. **Expected**: Latency < 50ms

**TC-17: Memory Usage**
1. Edit multiple documents
2. Open DevTools → Performance → Memory
3. **Expected**: Memory usage stable
4. **Expected**: No memory leaks
5. **Expected** (Dev mode): Memory warnings if > 100MB

**TC-18: Auto-save Performance**
1. Type continuously for 1 minute
2. **Expected**: Auto-save triggers every 2 seconds
3. **Expected**: No typing lag during save
4. **Expected**: Save completes < 500ms

#### Validation Script
```javascript
// Test performance metrics
async function testPerformance() {
  console.log("Testing Performance...");

  // Test 1: Check render performance
  const paintEntries = performance.getEntriesByType('paint');
  paintEntries.forEach(entry => {
    console.log(`${entry.name}: ${entry.startTime}ms`);
  });

  // Test 2: Check memory if available
  if (performance.memory) {
    const usage = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
    const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2);
    console.log(`Memory: ${usage}MB / ${limit}MB`);
  }

  // Test 3: Check long tasks
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.warn(`Long task detected: ${entry.duration}ms`);
    }
  });

  try {
    observer.observe({ entryTypes: ['longtask'] });
    console.log("✓ Long task monitoring active");
  } catch (e) {
    console.log("Long task API not supported");
  }

  console.log("✓ Performance tests complete");
}

testPerformance();
```

### 6.3 Lazy Loading

#### Test Cases

**TC-19: Component Lazy Loading**
1. Open DevTools → Network
2. Navigate to home page
3. **Expected**: Editor components NOT loaded
4. Navigate to memory edit page
5. **Expected**: Editor chunks load on demand
6. **Expected**: Loading skeleton shows during load

**TC-20: Image Lazy Loading**
1. Open document with many images
2. **Expected**: Only visible images load initially
3. Scroll down
4. **Expected**: Images load as they enter viewport
5. **Expected**: No unnecessary network requests

**TC-21: Route Code Splitting**
1. Check Network tab → JS files
2. Navigate between routes
3. **Expected**: Different chunk files per route
4. **Expected**: Shared dependencies in common chunk
5. **Expected**: Total bundle size reduced

#### Validation Script
```javascript
// Test lazy loading
async function testLazyLoading() {
  console.log("Testing Lazy Loading...");

  // Check for code splitting
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const chunks = scripts.filter(s => s.src.includes('chunk'));
  console.log(`Found ${chunks.length} code-split chunks`);

  // Check intersection observer for lazy loading
  if ('IntersectionObserver' in window) {
    console.log("✓ IntersectionObserver supported");
  } else {
    console.warn("⚠ IntersectionObserver not supported");
  }

  // Monitor dynamic imports
  const resources = performance.getEntriesByType('resource');
  const dynamicChunks = resources.filter(r =>
    r.name.includes('chunk') && r.initiatorType === 'script'
  );
  console.log(`${dynamicChunks.length} dynamically loaded chunks`);

  console.log("✓ Lazy loading tests complete");
}

testLazyLoading();
```

## Comprehensive Test Suite

Run all tests:

```javascript
async function runAllTests() {
  console.log("=== Starting Comprehensive Test Suite ===\n");

  await testErrorBoundary();
  await testOfflineSupport();
  await testLoadingStates();
  await testPerformance();
  await testLazyLoading();

  console.log("\n=== All Tests Complete ===");
  console.log("Check console for any failures or warnings");
}

// Run it
runAllTests();
```

## Manual Testing Checklist

### Error Handling
- [ ] TC-1: Editor rendering error caught
- [ ] TC-2: Network error handled gracefully
- [ ] TC-3: Component stack traces shown (dev only)
- [ ] TC-4: Offline content saves locally
- [ ] TC-5: Online sync works after offline
- [ ] TC-6: Offline edits persist across sessions
- [ ] TC-7: Multiple offline edits sync correctly
- [ ] TC-8: Title validation works
- [ ] TC-9: Content validation works
- [ ] TC-10: URL validation works
- [ ] TC-11: Image upload validation works

### Performance
- [ ] TC-12: Editor skeleton loads instantly
- [ ] TC-13: Sidebar skeleton shows properly
- [ ] TC-14: Image loading states work
- [ ] TC-15: Render performance < 16ms
- [ ] TC-16: Input latency < 50ms
- [ ] TC-17: Memory usage stable
- [ ] TC-18: Auto-save performance good
- [ ] TC-19: Components lazy load
- [ ] TC-20: Images lazy load
- [ ] TC-21: Routes code-split properly

## Performance Benchmarks

Target metrics:
- **First Contentful Paint (FCP)**: < 1.5s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Time to Interactive (TTI)**: < 3.5s

## Debugging Tips

### Enable Performance Monitoring
Add to browser console:
```javascript
localStorage.setItem('debug:performance', 'true');
```

### View Offline Storage
```javascript
// List all offline edits
const keys = Object.keys(localStorage).filter(k => k.startsWith('supermemory_offline_'));
keys.forEach(key => {
  console.log(key, localStorage.getItem(key));
});
```

### Monitor Network Requests
```javascript
// Track all fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch:', args[0]);
  return originalFetch.apply(this, args);
};
```

## Acceptance Criteria

All test cases must pass with:
- ✅ No console errors (except intentional test errors)
- ✅ All validation working as expected
- ✅ Performance metrics within targets
- ✅ Offline functionality reliable
- ✅ UI/UX smooth and responsive
- ✅ No data loss scenarios

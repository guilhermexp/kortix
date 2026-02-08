'use client';

import { useState } from 'react';
import { useFeatureFlag, useFeatureFlags } from '@/hooks/use-feature-flag';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { Label } from '@ui/components/label';

/**
 * Feature Flag Test Page
 *
 * This page demonstrates and tests the useFeatureFlag hook for E2E verification.
 * It allows testing flag evaluation with different contexts and displays performance metrics.
 */
export default function FeatureFlagTestPage() {
  const [flagKey, setFlagKey] = useState('test-flag');

  // Test useFeatureFlags hook - fetches all flags
  const { data: allFlags, isLoading: loadingAll, error: errorAll } = useFeatureFlags();

  // Test useFeatureFlag hook - evaluates a specific flag
  const {
    data: flagResult,
    isLoading: loadingFlag,
    error: errorFlag,
    refetch
  } = useFeatureFlag(flagKey);

  // Performance tracking
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    evaluationTime: number;
    cacheHit: boolean;
  } | null>(null);

  const testFlagEvaluation = async () => {
    const startTime = performance.now();
    const result = await refetch();
    const endTime = performance.now();

    setPerformanceMetrics({
      evaluationTime: endTime - startTime,
      cacheHit: result.data?.cached || false,
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feature Flag E2E Test Page</h1>
        <p className="text-muted-foreground mt-2">
          Test feature flag evaluation and verify performance requirements
        </p>
      </div>

      {/* All Flags List */}
      <Card>
        <CardHeader>
          <CardTitle>All Feature Flags</CardTitle>
          <CardDescription>Testing useFeatureFlags() hook</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAll && <p className="text-sm text-muted-foreground">Loading flags...</p>}
          {errorAll && <p className="text-sm text-red-500">Error: {errorAll.message}</p>}
          {allFlags && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Found {allFlags.length} flag(s)</p>
              {allFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No flags found. Create one in the{' '}
                  <a href="/admin/feature-flags" className="underline">
                    Feature Flags Dashboard
                  </a>
                </p>
              ) : (
                <ul className="space-y-1">
                  {allFlags.map((flag) => (
                    <li key={flag.id} className="text-sm">
                      <code className="bg-muted px-2 py-1 rounded">{flag.key}</code>
                      {' - '}
                      <span className={flag.enabled ? 'text-green-600' : 'text-gray-500'}>
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flag Evaluation Test */}
      <Card>
        <CardHeader>
          <CardTitle>Flag Evaluation Test</CardTitle>
          <CardDescription>Testing useFeatureFlag(key, context) hook</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="flagKey">Flag Key</Label>
            <Input
              id="flagKey"
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="Enter flag key (e.g., test-flag)"
            />
          </div>

          <div>
            <Button onClick={testFlagEvaluation}>Evaluate Flag</Button>
          </div>

          {loadingFlag && (
            <p className="text-sm text-muted-foreground">Evaluating flag...</p>
          )}

          {errorFlag && (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-600 font-medium">Error</p>
              <p className="text-sm text-red-500">{errorFlag.message}</p>
            </div>
          )}

          {flagResult !== undefined && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm font-medium text-blue-900">Evaluation Result</p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">Enabled:</span>{' '}
                    <span className={flagResult?.enabled ? 'text-green-600 font-bold' : 'text-gray-500'}>
                      {flagResult?.enabled ? 'TRUE' : 'FALSE'}
                    </span>
                  </p>
                </div>
              </div>

              {performanceMetrics && (
                <div className="p-4 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-900">Performance Metrics</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">Evaluation Time:</span>{' '}
                      <span className={performanceMetrics.evaluationTime < 10 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {performanceMetrics.evaluationTime.toFixed(2)}ms
                      </span>
                      {performanceMetrics.evaluationTime < 10 ? ' ✓ (< 10ms requirement)' : ' ✗ (> 10ms requirement)'}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Cache Hit:</span>{' '}
                      {performanceMetrics.cacheHit ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>E2E Verification Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal list-inside space-y-2">
            <li>Go to <a href="/admin/feature-flags" className="underline">/admin/feature-flags</a> and create a test flag</li>
            <li>Set the flag key to "test-flag" (or any other key)</li>
            <li>Enable the flag using the toggle</li>
            <li>Return to this page and click "Evaluate Flag"</li>
            <li>Verify the flag shows as TRUE</li>
            <li>Verify evaluation time is &lt; 10ms (cached requests)</li>
            <li>Go back and toggle the flag off</li>
            <li>Return here and click "Evaluate Flag" again</li>
            <li>Verify the flag now shows as FALSE</li>
            <li>Check the audit log on the main dashboard</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

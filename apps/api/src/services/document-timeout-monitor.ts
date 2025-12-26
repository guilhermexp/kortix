/**
 * Document Timeout Monitor Service
 *
 * Monitors documents stuck in processing states and automatically marks them as failed
 * after a configurable timeout period (default: 5 minutes).
 *
 * This prevents documents from being stuck indefinitely when:
 * - Extraction services crash or hang
 * - Network requests timeout without proper error handling
 * - External APIs (MarkItDown, etc.) fail to respond
 *
 * Features:
 * - Circuit breaker pattern to prevent hammering the database when it's down
 * - Exponential backoff on connection failures
 * - Graceful degradation when database is unavailable
 *
 * Usage:
 * ```typescript
 * import { startDocumentTimeoutMonitor, stopDocumentTimeoutMonitor } from './services/document-timeout-monitor';
 *
 * // Start monitoring when server starts
 * startDocumentTimeoutMonitor();
 *
 * // Stop monitoring when server shuts down
 * process.on('SIGTERM', () => {
 *   stopDocumentTimeoutMonitor();
 * });
 * ```
 */

import { createClient } from "@supabase/supabase-js";
import { documentListCache, documentCache } from "./query-cache";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Check interval: 5 minutes in production, 2 minutes in development
const CHECK_INTERVAL_MS =
  process.env.NODE_ENV === "production"
    ? 5 * 60 * 1000 // 5 minutes
    : 2 * 60 * 1000; // 2 minutes

// Circuit breaker configuration
const CIRCUIT_BREAKER = {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: 3,
  /** Maximum backoff time (ms) */
  maxBackoff: 600_000, // 10 minutes
  /** Base backoff time (ms) */
  baseBackoff: 30_000, // 30 seconds
};

// Circuit breaker state
let circuitState: "closed" | "open" | "half-open" = "closed";
let consecutiveFailures = 0;
let lastFailureTime = 0;
let currentBackoff = CIRCUIT_BREAKER.baseBackoff;

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Check if the circuit breaker allows requests
 */
function canMakeRequest(): boolean {
  if (circuitState === "closed") {
    return true;
  }

  if (circuitState === "open") {
    const timeSinceFailure = Date.now() - lastFailureTime;
    if (timeSinceFailure >= currentBackoff) {
      circuitState = "half-open";
      console.log(
        `[DocumentTimeoutMonitor] Circuit breaker half-open, attempting recovery after ${Math.round(currentBackoff / 1000)}s`,
      );
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Record a successful database operation
 */
function recordSuccess(): void {
  if (circuitState !== "closed") {
    console.log(
      "[DocumentTimeoutMonitor] Circuit breaker closed - database recovered",
    );
  }
  circuitState = "closed";
  consecutiveFailures = 0;
  currentBackoff = CIRCUIT_BREAKER.baseBackoff;
}

/**
 * Record a failed database operation
 */
function recordFailure(error: unknown): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  const errorMessage = error instanceof Error ? error.message : String(error);
  const isConnectionError =
    errorMessage.includes("timeout") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("522") ||
    errorMessage.includes("Connection terminated");

  if (isConnectionError) {
    if (consecutiveFailures >= CIRCUIT_BREAKER.failureThreshold) {
      circuitState = "open";
      currentBackoff = Math.min(
        currentBackoff * 2 + Math.random() * 1000,
        CIRCUIT_BREAKER.maxBackoff,
      );
      console.error(
        `[DocumentTimeoutMonitor] Circuit breaker OPEN after ${consecutiveFailures} failures. ` +
          `Next retry in ${Math.round(currentBackoff / 1000)}s`,
      );
    } else {
      console.warn(
        `[DocumentTimeoutMonitor] Database connection failure ${consecutiveFailures}/${CIRCUIT_BREAKER.failureThreshold}`,
      );
    }
  }
}

/**
 * Check for stuck documents and mark them as failed
 * Calls the database function created in migration 0009
 */
async function checkStuckDocuments(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[DocumentTimeoutMonitor] Missing Supabase credentials");
    return;
  }

  // Check circuit breaker before making request
  if (!canMakeRequest()) {
    const waitTime = Math.round(
      (currentBackoff - (Date.now() - lastFailureTime)) / 1000,
    );
    console.log(
      `[DocumentTimeoutMonitor] Circuit breaker open, skipping check. Next attempt in ${waitTime}s`,
    );
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Execute the query directly instead of RPC to avoid PostgREST schema cache issues
    // Include all processing statuses that could get stuck
    const { data, error } = await supabase
      .from("documents")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .in("status", ["fetching", "generating_preview", "extracting", "chunking", "embedding", "processing", "indexing"])
      .lt("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .select("id");

    if (error) {
      recordFailure(error);
      console.error(
        "[DocumentTimeoutMonitor] Error checking stuck documents:",
        error,
      );
      return;
    }

    // Success - reset circuit breaker
    recordSuccess();

    const affectedCount = data?.length ?? 0;

    // Only log when documents are actually stuck
    if (affectedCount > 0) {
      // Invalidate caches to ensure fresh data is returned
      documentListCache.clear();
      for (const doc of data ?? []) {
        documentCache.delete(doc.id);
      }

      console.warn(
        `[DocumentTimeoutMonitor] Marked ${affectedCount} stuck document(s) as failed`,
      );
    }
    // Silent when no stuck documents (no need to spam logs)
  } catch (error) {
    recordFailure(error);
    console.error("[DocumentTimeoutMonitor] Unexpected error:", error);
  }
}

/**
 * Start the document timeout monitor
 * Runs the check at configured intervals
 */
export function startDocumentTimeoutMonitor(): void {
  if (isRunning) {
    console.warn("[DocumentTimeoutMonitor] Already running, skipping start");
    return;
  }

  const intervalMinutes = Math.floor(CHECK_INTERVAL_MS / 60000);
  console.log(
    `[DocumentTimeoutMonitor] Starting (checking every ${intervalMinutes} minutes)`,
  );
  console.log("[DocumentTimeoutMonitor] Circuit breaker config:", {
    failureThreshold: CIRCUIT_BREAKER.failureThreshold,
    maxBackoffSeconds: CIRCUIT_BREAKER.maxBackoff / 1000,
  });

  // Run immediately on start
  checkStuckDocuments().catch((error) => {
    console.error(
      "[DocumentTimeoutMonitor] Error during initial check:",
      error,
    );
  });

  // Then run every CHECK_INTERVAL_MS
  monitorInterval = setInterval(() => {
    checkStuckDocuments().catch((error) => {
      console.error(
        "[DocumentTimeoutMonitor] Error during scheduled check:",
        error,
      );
    });
  }, CHECK_INTERVAL_MS);

  isRunning = true;
}

/**
 * Stop the document timeout monitor
 * Call this when shutting down the server
 */
export function stopDocumentTimeoutMonitor(): void {
  if (!isRunning) {
    console.warn("[DocumentTimeoutMonitor] Not running, skipping stop");
    return;
  }

  console.log("[DocumentTimeoutMonitor] Stopping document timeout monitor");

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  isRunning = false;
}

/**
 * Get the current status of the monitor
 */
export function isDocumentTimeoutMonitorRunning(): boolean {
  return isRunning;
}

/**
 * Get circuit breaker status for debugging
 */
export function getCircuitBreakerStatus(): {
  state: string;
  consecutiveFailures: number;
  currentBackoffSeconds: number;
} {
  return {
    state: circuitState,
    consecutiveFailures,
    currentBackoffSeconds: Math.round(currentBackoff / 1000),
  };
}

/**
 * Manually trigger a check for stuck documents
 * Useful for testing or manual intervention
 */
export async function manualCheckStuckDocuments(): Promise<number> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("documents")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .in("status", ["fetching", "generating_preview", "extracting", "chunking", "embedding", "processing", "indexing"])
    .lt("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .select("id");

  if (error) {
    throw new Error(`Failed to check stuck documents: ${error.message}`);
  }

  return data?.length ?? 0;
}

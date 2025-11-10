/**
 * Document Timeout Monitor Service
 *
 * Monitors documents stuck in processing states and automatically marks them as failed
 * after a configurable timeout period (default: 5 minutes).
 *
 * This prevents documents from being stuck indefinitely when:
 * - Extraction services crash or hang
 * - Network requests timeout without proper error handling
 * - External APIs (MarkItDown, Puppeteer, etc.) fail to respond
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

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Check interval: every 60 seconds (1 minute)
const CHECK_INTERVAL_MS = 60 * 1000

let monitorInterval: NodeJS.Timeout | null = null
let isRunning = false

/**
 * Check for stuck documents and mark them as failed
 * Calls the database function created in migration 0009
 */
async function checkStuckDocuments(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[DocumentTimeoutMonitor] Missing Supabase credentials')
    return
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Call the database function to mark stuck documents as failed
    const { data, error } = await supabase.rpc('mark_stuck_documents_as_failed')

    if (error) {
      console.error('[DocumentTimeoutMonitor] Error checking stuck documents:', error)
      return
    }

    const affectedCount = data as number

    if (affectedCount > 0) {
      console.warn(
        `[DocumentTimeoutMonitor] Marked ${affectedCount} stuck document(s) as failed`
      )
    } else {
      console.log('[DocumentTimeoutMonitor] No stuck documents found')
    }
  } catch (error) {
    console.error('[DocumentTimeoutMonitor] Unexpected error:', error)
  }
}

/**
 * Start the document timeout monitor
 * Runs the check every 60 seconds
 */
export function startDocumentTimeoutMonitor(): void {
  if (isRunning) {
    console.warn('[DocumentTimeoutMonitor] Already running, skipping start')
    return
  }

  console.log('[DocumentTimeoutMonitor] Starting document timeout monitor')
  console.log(`[DocumentTimeoutMonitor] Check interval: ${CHECK_INTERVAL_MS / 1000}s`)

  // Run immediately on start
  checkStuckDocuments().catch((error) => {
    console.error('[DocumentTimeoutMonitor] Error during initial check:', error)
  })

  // Then run every CHECK_INTERVAL_MS
  monitorInterval = setInterval(() => {
    checkStuckDocuments().catch((error) => {
      console.error('[DocumentTimeoutMonitor] Error during scheduled check:', error)
    })
  }, CHECK_INTERVAL_MS)

  isRunning = true
}

/**
 * Stop the document timeout monitor
 * Call this when shutting down the server
 */
export function stopDocumentTimeoutMonitor(): void {
  if (!isRunning) {
    console.warn('[DocumentTimeoutMonitor] Not running, skipping stop')
    return
  }

  console.log('[DocumentTimeoutMonitor] Stopping document timeout monitor')

  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }

  isRunning = false
}

/**
 * Get the current status of the monitor
 */
export function isDocumentTimeoutMonitorRunning(): boolean {
  return isRunning
}

/**
 * Manually trigger a check for stuck documents
 * Useful for testing or manual intervention
 */
export async function manualCheckStuckDocuments(): Promise<number> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase.rpc('mark_stuck_documents_as_failed')

  if (error) {
    throw new Error(`Failed to check stuck documents: ${error.message}`)
  }

  return data as number
}

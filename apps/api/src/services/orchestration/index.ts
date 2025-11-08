/**
 * Orchestration Module Exports
 *
 * This module provides orchestration services for document processing:
 * - IngestionOrchestratorService - Main orchestration service
 * - CircuitBreaker - Failure protection
 * - RetryHandler - Retry logic with exponential backoff
 */

// Circuit breaker
export {
	CircuitBreaker,
	createCircuitBreaker,
	createAggressiveCircuitBreaker,
	createLenientCircuitBreaker,
} from './circuit-breaker'

// Retry handler
export {
	RetryHandler,
	createRetryHandler,
	getRetryHandler,
	withRetry,
	withAggressiveRetry,
	withConservativeRetry,
	withLinearRetry,
} from './retry-handler'

// Ingestion orchestrator
export {
	IngestionOrchestratorService,
	createIngestionOrchestrator,
} from './ingestion-orchestrator'

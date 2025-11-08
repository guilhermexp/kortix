/**
 * Orchestration Interfaces
 *
 * This file contains interfaces for orchestrating document processing workflows.
 * These interfaces define the contracts for circuit breakers, retry logic,
 * job queues, and workflow orchestration.
 *
 * Orchestration Components:
 * - CircuitBreaker: Protect against cascading failures
 * - RetryHandler: Automatic retry with exponential backoff
 * - JobQueue: Queue management for async processing
 * - WorkflowOrchestrator: Coordinate complex workflows
 */

import {
	ProcessDocumentInput,
	ProcessingResult,
	ProcessingError,
	RetryOptions,
	BaseService,
	CircuitBreakerState,
} from './document-processing'

// ============================================================================
// Circuit Breaker Interfaces
// ============================================================================

/**
 * Circuit breaker for protecting services from cascading failures
 */
export interface CircuitBreaker extends BaseService {
	/**
	 * Execute operation with circuit breaker protection
	 */
	execute<T>(operation: () => Promise<T>, options?: CircuitBreakerOptions): Promise<T>

	/**
	 * Get current state
	 */
	getState(): CircuitBreakerState

	/**
	 * Reset circuit breaker
	 */
	reset(): void

	/**
	 * Force open circuit breaker
	 */
	forceOpen(): void

	/**
	 * Force close circuit breaker
	 */
	forceClose(): void

	/**
	 * Get circuit breaker metrics
	 */
	getMetrics(): CircuitBreakerMetrics
}

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
	/** Failure threshold before opening */
	failureThreshold?: number
	/** Success threshold to close from half-open */
	successThreshold?: number
	/** Timeout before attempting reset (ms) */
	resetTimeout?: number
	/** Monitoring window duration (ms) */
	monitoringWindow?: number
	/** Minimum requests before evaluating */
	minimumRequests?: number
	/** Custom error filter */
	errorFilter?: (error: Error) => boolean
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
	/** Current state */
	state: 'closed' | 'open' | 'half-open'
	/** Failure count */
	failures: number
	/** Success count */
	successes: number
	/** Total requests */
	totalRequests: number
	/** Last failure time */
	lastFailureTime: Date | null
	/** Last success time */
	lastSuccessTime: Date | null
	/** State changes */
	stateChanges: StateChange[]
	/** Failure rate */
	failureRate: number
	/** Success rate */
	successRate: number
}

/**
 * Circuit breaker state change
 */
export interface StateChange {
	/** Previous state */
	from: 'closed' | 'open' | 'half-open'
	/** New state */
	to: 'closed' | 'open' | 'half-open'
	/** Timestamp */
	timestamp: Date
	/** Reason */
	reason: string
}

/**
 * Circuit breaker event
 */
export interface CircuitBreakerEvent {
	/** Event type */
	type: 'opened' | 'closed' | 'half_opened' | 'success' | 'failure' | 'rejected'
	/** Timestamp */
	timestamp: Date
	/** Service name */
	serviceName: string
	/** Error (if applicable) */
	error?: Error
	/** Metadata */
	metadata?: Record<string, unknown>
}

// ============================================================================
// Retry Handler Interfaces
// ============================================================================

/**
 * Retry handler with exponential backoff
 */
export interface RetryHandler extends BaseService {
	/**
	 * Execute operation with retry logic
	 */
	execute<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>

	/**
	 * Calculate delay for next retry
	 */
	calculateDelay(attempt: number, options: RetryOptions): number

	/**
	 * Check if error is retryable
	 */
	isRetryable(error: Error): boolean

	/**
	 * Get retry statistics
	 */
	getStats(): RetryStatistics
}

/**
 * Extended retry options with additional configuration
 */
export interface ExtendedRetryOptions extends RetryOptions {
	/** Custom retryable error check */
	isRetryableError?: (error: Error) => boolean
	/** Callback before retry */
	onRetry?: (attempt: number, error: Error) => void | Promise<void>
	/** Callback on final failure */
	onFailure?: (error: Error, attempts: number) => void | Promise<void>
	/** Custom delay calculator */
	calculateDelay?: (attempt: number) => number
}

/**
 * Retry statistics
 */
export interface RetryStatistics {
	/** Total operations */
	totalOperations: number
	/** Successful on first try */
	successfulFirstTry: number
	/** Successful after retry */
	successfulAfterRetry: number
	/** Failed after all retries */
	failed: number
	/** Average retry count */
	averageRetryCount: number
	/** Maximum retry count observed */
	maxRetryCount: number
	/** Retry success rate */
	retrySuccessRate: number
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
	/** Attempt number */
	attemptNumber: number
	/** Timestamp */
	timestamp: Date
	/** Error (if failed) */
	error?: Error
	/** Delay before next retry (ms) */
	nextRetryDelay?: number
	/** Was successful */
	successful: boolean
}

/**
 * Retry execution context
 */
export interface RetryExecutionContext {
	/** Operation ID */
	operationId: string
	/** All attempts */
	attempts: RetryAttempt[]
	/** Start time */
	startTime: Date
	/** End time */
	endTime?: Date
	/** Total duration */
	duration?: number
	/** Final result */
	result?: unknown
	/** Final error */
	error?: Error
}

// ============================================================================
// Job Queue Interfaces
// ============================================================================

/**
 * Job queue for managing async document processing
 */
export interface JobQueue extends BaseService {
	/**
	 * Add job to queue
	 */
	add(job: Job): Promise<string>

	/**
	 * Get job by ID
	 */
	get(jobId: string): Promise<Job | null>

	/**
	 * Get job status
	 */
	getStatus(jobId: string): Promise<JobStatus>

	/**
	 * Cancel job
	 */
	cancel(jobId: string): Promise<void>

	/**
	 * Retry failed job
	 */
	retry(jobId: string): Promise<void>

	/**
	 * Get queue statistics
	 */
	getStats(): Promise<QueueStatistics>

	/**
	 * Clear completed jobs
	 */
	clearCompleted(): Promise<number>

	/**
	 * Pause queue
	 */
	pause(): Promise<void>

	/**
	 * Resume queue
	 */
	resume(): Promise<void>
}

/**
 * Job definition
 */
export interface Job {
	/** Job ID */
	id?: string
	/** Job type */
	type: 'document_ingestion' | 'reprocessing' | 'batch_processing'
	/** Job data */
	data: ProcessDocumentInput
	/** Job options */
	options?: JobOptions
	/** Job metadata */
	metadata?: Record<string, unknown>
}

/**
 * Job options
 */
export interface JobOptions {
	/** Priority */
	priority?: 'low' | 'normal' | 'high' | 'critical'
	/** Delay before processing (ms) */
	delay?: number
	/** Maximum retry attempts */
	attempts?: number
	/** Backoff options */
	backoff?: BackoffOptions
	/** Timeout (ms) */
	timeout?: number
	/** Remove on complete */
	removeOnComplete?: boolean
	/** Remove on fail */
	removeOnFail?: boolean
}

/**
 * Backoff options for job retries
 */
export interface BackoffOptions {
	/** Backoff type */
	type: 'fixed' | 'exponential'
	/** Delay in milliseconds */
	delay: number
	/** Maximum delay */
	maxDelay?: number
}

/**
 * Job status
 */
export interface JobStatus {
	/** Job ID */
	id: string
	/** Current state */
	state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'
	/** Progress (0-100) */
	progress: number
	/** Result (if completed) */
	result?: ProcessingResult
	/** Error (if failed) */
	error?: ProcessingError
	/** Attempt count */
	attemptsMade: number
	/** Timestamps */
	timestamps: {
		created: Date
		started?: Date
		completed?: Date
		failed?: Date
	}
	/** Processing duration */
	duration?: number
}

/**
 * Queue statistics
 */
export interface QueueStatistics {
	/** Waiting jobs */
	waiting: number
	/** Active jobs */
	active: number
	/** Completed jobs */
	completed: number
	/** Failed jobs */
	failed: number
	/** Delayed jobs */
	delayed: number
	/** Paused jobs */
	paused: number
	/** Total processed */
	totalProcessed: number
	/** Success rate */
	successRate: number
	/** Average processing time */
	averageProcessingTime: number
}

/**
 * Job event
 */
export interface JobEvent {
	/** Event type */
	type:
		| 'added'
		| 'started'
		| 'progress'
		| 'completed'
		| 'failed'
		| 'delayed'
		| 'retrying'
		| 'removed'
	/** Job ID */
	jobId: string
	/** Timestamp */
	timestamp: Date
	/** Job data */
	data?: unknown
	/** Progress (if applicable) */
	progress?: number
	/** Error (if applicable) */
	error?: Error
	/** Metadata */
	metadata?: Record<string, unknown>
}

// ============================================================================
// Workflow Orchestration Interfaces
// ============================================================================

/**
 * Workflow orchestrator for coordinating complex processing workflows
 */
export interface WorkflowOrchestrator extends BaseService {
	/**
	 * Execute workflow
	 */
	execute(workflow: Workflow): Promise<WorkflowResult>

	/**
	 * Create workflow from input
	 */
	createWorkflow(input: ProcessDocumentInput): Workflow

	/**
	 * Get workflow status
	 */
	getStatus(workflowId: string): Promise<WorkflowStatus>

	/**
	 * Cancel workflow
	 */
	cancel(workflowId: string): Promise<void>

	/**
	 * Retry workflow
	 */
	retry(workflowId: string): Promise<WorkflowResult>

	/**
	 * Get workflow metrics
	 */
	getMetrics(workflowId: string): Promise<WorkflowMetrics>
}

/**
 * Workflow definition
 */
export interface Workflow {
	/** Workflow ID */
	id: string
	/** Workflow name */
	name: string
	/** Workflow steps */
	steps: WorkflowStep[]
	/** Input data */
	input: ProcessDocumentInput
	/** Workflow options */
	options?: WorkflowOptions
	/** Workflow metadata */
	metadata?: Record<string, unknown>
}

/**
 * Workflow step
 */
export interface WorkflowStep {
	/** Step ID */
	id: string
	/** Step name */
	name: string
	/** Step type */
	type: 'extraction' | 'processing' | 'preview' | 'storage' | 'validation' | 'custom'
	/** Step function */
	execute: (context: WorkflowContext) => Promise<WorkflowStepResult>
	/** Skip condition */
	skipIf?: (context: WorkflowContext) => boolean
	/** Retry options */
	retryOptions?: RetryOptions
	/** Timeout */
	timeout?: number
	/** Dependencies */
	dependencies?: string[]
	/** On error handler */
	onError?: (error: Error, context: WorkflowContext) => Promise<WorkflowStepResult>
}

/**
 * Workflow options
 */
export interface WorkflowOptions {
	/** Enable parallel execution where possible */
	parallel?: boolean
	/** Stop on first error */
	stopOnError?: boolean
	/** Global timeout for entire workflow */
	timeout?: number
	/** Enable checkpointing */
	enableCheckpoints?: boolean
	/** Retry failed steps */
	retryFailedSteps?: boolean
}

/**
 * Workflow context passed between steps
 */
export interface WorkflowContext {
	/** Workflow ID */
	workflowId: string
	/** Current step */
	currentStep: string
	/** Input data */
	input: ProcessDocumentInput
	/** Intermediate results */
	results: Map<string, unknown>
	/** Metadata */
	metadata: Map<string, unknown>
	/** Execution start time */
	startTime: Date
	/** Errors encountered */
	errors: ProcessingError[]
}

/**
 * Workflow step result
 */
export interface WorkflowStepResult {
	/** Step success */
	success: boolean
	/** Step output */
	output?: unknown
	/** Error */
	error?: ProcessingError
	/** Step duration */
	duration: number
	/** Metadata */
	metadata?: Record<string, unknown>
}

/**
 * Complete workflow result
 */
export interface WorkflowResult {
	/** Workflow ID */
	workflowId: string
	/** Success status */
	success: boolean
	/** Final result */
	result?: ProcessingResult
	/** Steps completed */
	stepsCompleted: string[]
	/** Steps failed */
	stepsFailed: string[]
	/** Total duration */
	duration: number
	/** Errors */
	errors: ProcessingError[]
	/** Metadata */
	metadata?: Record<string, unknown>
}

/**
 * Workflow status
 */
export interface WorkflowStatus {
	/** Workflow ID */
	id: string
	/** Current state */
	state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
	/** Current step */
	currentStep?: string
	/** Progress (0-100) */
	progress: number
	/** Steps completed */
	stepsCompleted: number
	/** Total steps */
	totalSteps: number
	/** Start time */
	startTime: Date
	/** End time */
	endTime?: Date
	/** Duration */
	duration?: number
	/** Errors */
	errors: ProcessingError[]
}

/**
 * Workflow metrics
 */
export interface WorkflowMetrics {
	/** Total execution time */
	totalTime: number
	/** Time per step */
	stepTimes: Map<string, number>
	/** Retry count per step */
	retryCount: Map<string, number>
	/** Error count */
	errorCount: number
	/** Success rate */
	successRate: number
	/** Parallel efficiency (if applicable) */
	parallelEfficiency?: number
}

/**
 * Workflow checkpoint for resumption
 */
export interface WorkflowCheckpoint {
	/** Workflow ID */
	workflowId: string
	/** Checkpoint timestamp */
	timestamp: Date
	/** Completed steps */
	completedSteps: string[]
	/** Current context */
	context: WorkflowContext
	/** Can resume from this point */
	resumable: boolean
}

// ============================================================================
// Transaction & Atomicity Interfaces
// ============================================================================

/**
 * Transaction manager for atomic operations
 */
export interface TransactionManager extends BaseService {
	/**
	 * Begin transaction
	 */
	begin(): Promise<Transaction>

	/**
	 * Execute operation within transaction
	 */
	execute<T>(operation: (tx: Transaction) => Promise<T>): Promise<T>

	/**
	 * Get active transactions
	 */
	getActiveTransactions(): Transaction[]
}

/**
 * Transaction
 */
export interface Transaction {
	/** Transaction ID */
	id: string
	/** Start time */
	startTime: Date
	/** Is active */
	active: boolean
	/** Commit transaction */
	commit(): Promise<void>
	/** Rollback transaction */
	rollback(): Promise<void>
	/** Save checkpoint */
	savepoint(name: string): Promise<void>
	/** Rollback to checkpoint */
	rollbackTo(name: string): Promise<void>
}

// ============================================================================
// Rate Limiting Interfaces
// ============================================================================

/**
 * Rate limiter for controlling request rates
 */
export interface RateLimiter extends BaseService {
	/**
	 * Check if operation is allowed
	 */
	isAllowed(key: string): Promise<boolean>

	/**
	 * Consume tokens
	 */
	consume(key: string, tokens?: number): Promise<RateLimitResult>

	/**
	 * Get remaining capacity
	 */
	getRemaining(key: string): Promise<number>

	/**
	 * Reset rate limit
	 */
	reset(key: string): Promise<void>

	/**
	 * Get rate limit info
	 */
	getInfo(key: string): Promise<RateLimitInfo>
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
	/** Allowed */
	allowed: boolean
	/** Remaining capacity */
	remaining: number
	/** Reset time */
	resetTime: Date
	/** Retry after (ms) */
	retryAfter?: number
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
	/** Limit */
	limit: number
	/** Remaining */
	remaining: number
	/** Reset time */
	resetTime: Date
	/** Window duration (ms) */
	windowDuration: number
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
	/** Maximum requests */
	max: number
	/** Window duration in milliseconds */
	windowMs: number
	/** Key generator */
	keyGenerator?: (input: unknown) => string
	/** Skip failed requests */
	skipFailedRequests?: boolean
	/** Skip successful requests */
	skipSuccessfulRequests?: boolean
}

// ============================================================================
// Orchestration Events & Monitoring
// ============================================================================

/**
 * Orchestration event
 */
export interface OrchestrationEvent {
	/** Event type */
	type:
		| 'workflow_started'
		| 'workflow_completed'
		| 'workflow_failed'
		| 'step_started'
		| 'step_completed'
		| 'step_failed'
		| 'circuit_opened'
		| 'circuit_closed'
		| 'retry_attempted'
		| 'job_queued'
		| 'rate_limited'
	/** Timestamp */
	timestamp: Date
	/** Entity ID (workflow/job/step) */
	entityId: string
	/** Entity type */
	entityType: 'workflow' | 'job' | 'step' | 'circuit_breaker' | 'rate_limiter'
	/** Duration (if applicable) */
	duration?: number
	/** Error (if applicable) */
	error?: Error
	/** Metadata */
	metadata?: Record<string, unknown>
}

/**
 * Orchestration monitor
 */
export interface OrchestrationMonitor extends BaseService {
	/**
	 * Record event
	 */
	recordEvent(event: OrchestrationEvent): void

	/**
	 * Get metrics
	 */
	getMetrics(): OrchestrationMetrics

	/**
	 * Get events
	 */
	getEvents(filter?: EventFilter): OrchestrationEvent[]

	/**
	 * Subscribe to events
	 */
	subscribe(listener: (event: OrchestrationEvent) => void): () => void
}

/**
 * Event filter
 */
export interface EventFilter {
	/** Event types */
	types?: OrchestrationEvent['type'][]
	/** Entity types */
	entityTypes?: OrchestrationEvent['entityType'][]
	/** Start time */
	startTime?: Date
	/** End time */
	endTime?: Date
	/** Entity ID */
	entityId?: string
}

/**
 * Orchestration metrics
 */
export interface OrchestrationMetrics {
	/** Total workflows */
	totalWorkflows: number
	/** Active workflows */
	activeWorkflows: number
	/** Completed workflows */
	completedWorkflows: number
	/** Failed workflows */
	failedWorkflows: number
	/** Average workflow duration */
	averageWorkflowDuration: number
	/** Success rate */
	successRate: number
	/** Circuit breaker trips */
	circuitBreakerTrips: number
	/** Total retries */
	totalRetries: number
	/** Rate limit hits */
	rateLimitHits: number
	/** Queue statistics */
	queueStats: QueueStatistics
}

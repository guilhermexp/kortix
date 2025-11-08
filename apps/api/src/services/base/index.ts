/**
 * Base Service Module Exports
 *
 * This module provides base functionality for all services:
 * - BaseService class with common functionality
 * - Logger implementations
 * - Performance monitoring
 * - Service configuration utilities
 */

// Base service class
export { BaseService, ConsoleLogger, SimplePerformanceMonitor } from './base-service'
export type {
	LogLevel,
	LogEntry,
	Logger,
	PerformanceMetric,
	PerformanceMonitor,
	PerformanceTracker,
} from './base-service'

// Configuration utilities
export {
	ConfigLoader,
	getDefaultExtractorConfig,
	getDefaultProcessorConfig,
	getDefaultPreviewConfig,
	getDefaultOrchestratorConfig,
	getDefaultRetryOptions,
	mergeConfig,
	validateExtractorConfig,
	validateProcessorConfig,
	validatePreviewConfig,
	validateOrchestratorConfig,
	validateRetryOptions,
	createExtractorConfig,
	createProcessorConfig,
	createPreviewConfig,
	createOrchestratorConfig,
} from './service-config'

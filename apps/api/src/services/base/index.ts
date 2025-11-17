/**
 * Base Service Module Exports
 *
 * This module provides base functionality for all services:
 * - BaseService class with common functionality
 * - Logger implementations
 * - Performance monitoring
 * - Service configuration utilities
 */

export type {
	LogEntry,
	Logger,
	LogLevel,
	PerformanceMetric,
	PerformanceMonitor,
	PerformanceTracker,
} from "./base-service"
// Base service class
export {
	BaseService,
	ConsoleLogger,
	SimplePerformanceMonitor,
} from "./base-service"

// Configuration utilities
export {
	ConfigLoader,
	createExtractorConfig,
	createOrchestratorConfig,
	createPreviewConfig,
	createProcessorConfig,
	getDefaultExtractorConfig,
	getDefaultOrchestratorConfig,
	getDefaultPreviewConfig,
	getDefaultProcessorConfig,
	getDefaultRetryOptions,
	mergeConfig,
	validateExtractorConfig,
	validateOrchestratorConfig,
	validatePreviewConfig,
	validateProcessorConfig,
	validateRetryOptions,
} from "./service-config"

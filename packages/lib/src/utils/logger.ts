/**
 * Structured logging utility
 * Replaces console statements throughout the codebase
 */

export type LogLevel = "error" | "warn" | "info" | "debug"

export interface LogEntry {
	level: LogLevel
	message: string
	service: string
	timestamp: string
	context?: Record<string, any>
	error?: Error
}

export interface LoggerOptions {
	service: string
	level?: LogLevel
	enableConsole?: boolean
}

class Logger {
	private service: string
	private level: LogLevel
	private enableConsole: boolean

	constructor(options: LoggerOptions) {
		this.service = options.service
		this.level =
			options.level ||
			(process.env.NODE_ENV === "production" ? "info" : "debug")
		this.enableConsole = options.enableConsole ?? true
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: Record<LogLevel, number> = {
			error: 0,
			warn: 1,
			info: 2,
			debug: 3,
		}

		return levels[level] <= levels[this.level]
	}

	private formatMessage(entry: LogEntry): string {
		const { level, message, service, timestamp, context, error } = entry

		let formatted = `[${timestamp}] [${level.toUpperCase()}] [${service}] ${message}`

		if (context && Object.keys(context).length > 0) {
			formatted += ` ${JSON.stringify(context)}`
		}

		if (error) {
			formatted += ` Error: ${error.message}`
			if (error.stack) {
				formatted += `\nStack: ${error.stack}`
			}
		}

		return formatted
	}

	private log(
		level: LogLevel,
		message: string,
		context?: Record<string, any>,
		error?: Error,
	): void {
		if (!this.shouldLog(level)) return

		const entry: LogEntry = {
			level,
			message,
			service: this.service,
			timestamp: new Date().toISOString(),
			context,
			error,
		}

		if (this.enableConsole) {
			const formatted = this.formatMessage(entry)

			switch (level) {
				case "error":
					console.error(formatted)
					break
				case "warn":
					console.warn(formatted)
					break
				case "info":
					console.info(formatted)
					break
				case "debug":
					console.debug(formatted)
					break
			}
		}

		// In production, you could send logs to external service here
		// Example: this.sendToLogService(entry)
	}

	error(message: string, context?: Record<string, any>, error?: Error): void {
		this.log("error", message, context, error)
	}

	warn(message: string, context?: Record<string, any>): void {
		this.log("warn", message, context)
	}

	info(message: string, context?: Record<string, any>): void {
		this.log("info", message, context)
	}

	debug(message: string, context?: Record<string, any>): void {
		this.log("debug", message, context)
	}

	// Performance logging
	timer(label: string): () => void {
		const start = Date.now()
		return () => {
			const duration = Date.now() - start
			this.debug(`${label} completed`, { duration: `${duration}ms` })
		}
	}

	// Structured logging for specific operations
	logOperation(operation: string, context?: Record<string, any>): void {
		this.info(`Operation: ${operation}`, context)
	}

	logError(
		operation: string,
		error: Error,
		context?: Record<string, any>,
	): void {
		this.error(`Operation failed: ${operation}`, context, error)
	}

	logCache(
		operation: "hit" | "miss" | "set" | "clear",
		key: string,
		context?: Record<string, any>,
	): void {
		this.debug(`Cache ${operation}`, { key, ...context })
	}

	logApi(
		method: string,
		url: string,
		status?: number,
		duration?: number,
	): void {
		this.info(`API ${method} ${url}`, {
			status,
			duration: duration ? `${duration}ms` : undefined,
		})
	}
}

// Create logger instances for different services
export const createLogger = (
	service: string,
	options?: Omit<LoggerOptions, "service">,
) => {
	return new Logger({ service, ...options })
}

// Default loggers for common services
export const loggers = {
	api: createLogger("api"),
	ingestion: createLogger("ingestion"),
	extractor: createLogger("extractor"),
	search: createLogger("search"),
	cache: createLogger("cache"),
	embedding: createLogger("embedding"),
	claude: createLogger("claude"),
	preview: createLogger("preview"),
	monitor: createLogger("monitor"),
	auth: createLogger("auth"),
	database: createLogger("database"),
}

// Export default logger for backward compatibility
export const logger = loggers.api

// Utility functions for quick logging
export const logError = (
	message: string,
	context?: Record<string, any>,
	error?: Error,
) => {
	logger.error(message, context, error)
}

export const logWarn = (message: string, context?: Record<string, any>) => {
	logger.warn(message, context)
}

export const logInfo = (message: string, context?: Record<string, any>) => {
	logger.info(message, context)
}

export const logDebug = (message: string, context?: Record<string, any>) => {
	logger.debug(message, context)
}

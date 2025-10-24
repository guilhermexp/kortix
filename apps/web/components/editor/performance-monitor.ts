/**
 * Performance Monitoring for Editor
 *
 * Provides performance monitoring, metrics collection,
 * and reporting for editor components.
 */

import { useEffect, useRef } from "react";

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
	// Component metrics
	renderTime: number;
	renderCount: number;
	lastRenderTime: number;

	// User interaction metrics
	inputLatency: number;
	scrollLatency: number;

	// Memory metrics
	memoryUsage?: number;
	memoryLimit?: number;

	// Network metrics
	saveLatency?: number;
	syncLatency?: number;
}

/**
 * Performance thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
	// Render time thresholds (ms)
	RENDER_TIME_WARNING: 16, // 60fps
	RENDER_TIME_CRITICAL: 33, // 30fps

	// Input latency thresholds (ms)
	INPUT_LATENCY_WARNING: 50,
	INPUT_LATENCY_CRITICAL: 100,

	// Memory thresholds (MB)
	MEMORY_WARNING: 100,
	MEMORY_CRITICAL: 200,

	// Network latency thresholds (ms)
	NETWORK_WARNING: 500,
	NETWORK_CRITICAL: 2000,
} as const;

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
	private metrics: Map<string, PerformanceMetrics>;
	private enabled: boolean;

	constructor(enabled: boolean = process.env.NODE_ENV === "development") {
		this.metrics = new Map();
		this.enabled = enabled;
	}

	/**
	 * Start measuring a component render
	 */
	startRender(componentName: string): void {
		if (!this.enabled || typeof window === "undefined") return;

		performance.mark(`${componentName}-render-start`);
	}

	/**
	 * End measuring a component render
	 */
	endRender(componentName: string): void {
		if (!this.enabled || typeof window === "undefined") return;

		const startMark = `${componentName}-render-start`;
		const endMark = `${componentName}-render-end`;
		const measureName = `${componentName}-render`;

		try {
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);

			const measures = performance.getEntriesByName(measureName);
			if (measures.length > 0) {
				const measure = measures[measures.length - 1];
				this.updateMetrics(componentName, {
					renderTime: measure.duration,
					lastRenderTime: Date.now(),
				});

				// Check thresholds
				if (measure.duration > PERFORMANCE_THRESHOLDS.RENDER_TIME_CRITICAL) {
					console.warn(
						`[Performance] ${componentName} render time is critical: ${measure.duration.toFixed(2)}ms`
					);
				} else if (measure.duration > PERFORMANCE_THRESHOLDS.RENDER_TIME_WARNING) {
					console.log(
						`[Performance] ${componentName} render time: ${measure.duration.toFixed(2)}ms`
					);
				}
			}

			// Cleanup
			performance.clearMarks(startMark);
			performance.clearMarks(endMark);
			performance.clearMeasures(measureName);
		} catch (error) {
			console.error(`[Performance] Error measuring ${componentName}:`, error);
		}
	}

	/**
	 * Measure input latency
	 */
	measureInputLatency(componentName: string, startTime: number): void {
		if (!this.enabled) return;

		const latency = Date.now() - startTime;
		this.updateMetrics(componentName, { inputLatency: latency });

		if (latency > PERFORMANCE_THRESHOLDS.INPUT_LATENCY_CRITICAL) {
			console.warn(
				`[Performance] ${componentName} input latency is critical: ${latency}ms`
			);
		}
	}

	/**
	 * Measure save operation latency
	 */
	measureSaveLatency(startTime: number): void {
		if (!this.enabled) return;

		const latency = Date.now() - startTime;

		if (latency > PERFORMANCE_THRESHOLDS.NETWORK_CRITICAL) {
			console.warn(`[Performance] Save latency is critical: ${latency}ms`);
		}
	}

	/**
	 * Check memory usage
	 */
	checkMemoryUsage(componentName: string): void {
		if (!this.enabled || typeof window === "undefined") return;

		// @ts-ignore - performance.memory is not in all browsers
		if (performance.memory) {
			// @ts-ignore
			const usage = performance.memory.usedJSHeapSize / 1048576; // MB
			// @ts-ignore
			const limit = performance.memory.jsHeapSizeLimit / 1048576; // MB

			this.updateMetrics(componentName, {
				memoryUsage: usage,
				memoryLimit: limit,
			});

			if (usage > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL) {
				console.warn(
					`[Performance] ${componentName} memory usage is critical: ${usage.toFixed(2)}MB`
				);
			} else if (usage > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
				console.log(
					`[Performance] ${componentName} memory usage: ${usage.toFixed(2)}MB`
				);
			}
		}
	}

	/**
	 * Update metrics for a component
	 */
	private updateMetrics(
		componentName: string,
		updates: Partial<PerformanceMetrics>
	): void {
		const current = this.metrics.get(componentName) || {
			renderTime: 0,
			renderCount: 0,
			lastRenderTime: 0,
			inputLatency: 0,
			scrollLatency: 0,
		};

		this.metrics.set(componentName, {
			...current,
			...updates,
			renderCount: current.renderCount + (updates.renderTime ? 1 : 0),
		});
	}

	/**
	 * Get metrics for a component
	 */
	getMetrics(componentName: string): PerformanceMetrics | undefined {
		return this.metrics.get(componentName);
	}

	/**
	 * Get all metrics
	 */
	getAllMetrics(): Map<string, PerformanceMetrics> {
		return new Map(this.metrics);
	}

	/**
	 * Clear metrics for a component
	 */
	clearMetrics(componentName: string): void {
		this.metrics.delete(componentName);
	}

	/**
	 * Clear all metrics
	 */
	clearAllMetrics(): void {
		this.metrics.clear();
	}

	/**
	 * Generate performance report
	 */
	generateReport(): string {
		const lines: string[] = ["\n=== Performance Report ===\n"];

		this.metrics.forEach((metrics, componentName) => {
			lines.push(`Component: ${componentName}`);
			lines.push(`  Renders: ${metrics.renderCount}`);
			lines.push(`  Avg Render Time: ${metrics.renderTime.toFixed(2)}ms`);

			if (metrics.inputLatency > 0) {
				lines.push(`  Input Latency: ${metrics.inputLatency.toFixed(2)}ms`);
			}

			if (metrics.memoryUsage) {
				lines.push(
					`  Memory Usage: ${metrics.memoryUsage.toFixed(2)}MB / ${metrics.memoryLimit?.toFixed(2)}MB`
				);
			}

			lines.push("");
		});

		return lines.join("\n");
	}

	/**
	 * Log performance report to console
	 */
	logReport(): void {
		if (!this.enabled) return;
		console.log(this.generateReport());
	}
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor(
	process.env.NODE_ENV === "development"
);

/**
 * React hook for component performance monitoring
 */
export function usePerformanceMonitor(
	componentName: string,
	enabled: boolean = process.env.NODE_ENV === "development"
) {
	const renderStartTime = useRef<number>(0);

	useEffect(() => {
		if (!enabled) return;

		// Start render measurement
		renderStartTime.current = performance.now();
		performanceMonitor.startRender(componentName);

		return () => {
			// End render measurement
			performanceMonitor.endRender(componentName);

			// Check memory periodically (every 10 renders)
			const metrics = performanceMonitor.getMetrics(componentName);
			if (metrics && metrics.renderCount % 10 === 0) {
				performanceMonitor.checkMemoryUsage(componentName);
			}
		};
	});

	return {
		measureInputLatency: (startTime: number) => {
			performanceMonitor.measureInputLatency(componentName, startTime);
		},
		measureSaveLatency: (startTime: number) => {
			performanceMonitor.measureSaveLatency(startTime);
		},
		getMetrics: () => performanceMonitor.getMetrics(componentName),
		logReport: () => performanceMonitor.logReport(),
	};
}

/**
 * Long task detection
 * Detects tasks that block the main thread
 */
export function detectLongTasks(threshold: number = 50) {
	if (typeof window === "undefined") return;

	// @ts-ignore - PerformanceObserver not fully typed
	if ("PerformanceObserver" in window) {
		try {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.duration > threshold) {
						console.warn(
							`[Performance] Long task detected: ${entry.duration.toFixed(2)}ms`,
							entry
						);
					}
				}
			});

			observer.observe({ entryTypes: ["longtask"] });
		} catch (error) {
			// Long task API not supported
		}
	}
}

/**
 * Core Web Vitals monitoring
 */
export function monitorWebVitals() {
	if (typeof window === "undefined") return;

	// Largest Contentful Paint (LCP)
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				console.log(`[Web Vitals] LCP: ${entry.startTime.toFixed(2)}ms`);
			}
		});
		observer.observe({ entryTypes: ["largest-contentful-paint"] });
	} catch (e) {
		// Not supported
	}

	// First Input Delay (FID)
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				// @ts-ignore
				const fid = entry.processingStart - entry.startTime;
				console.log(`[Web Vitals] FID: ${fid.toFixed(2)}ms`);
			}
		});
		observer.observe({ entryTypes: ["first-input"] });
	} catch (e) {
		// Not supported
	}

	// Cumulative Layout Shift (CLS)
	try {
		let cls = 0;
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				// @ts-ignore
				if (!entry.hadRecentInput) {
					// @ts-ignore
					cls += entry.value;
				}
			}
			console.log(`[Web Vitals] CLS: ${cls.toFixed(4)}`);
		});
		observer.observe({ entryTypes: ["layout-shift"] });
	} catch (e) {
		// Not supported
	}
}

/**
 * Initialize performance monitoring in development
 */
export function initPerformanceMonitoring() {
	if (process.env.NODE_ENV === "development") {
		detectLongTasks();
		monitorWebVitals();
	}
}

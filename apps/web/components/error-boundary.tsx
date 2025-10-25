"use client"

import { AlertTriangle, Home, RefreshCw } from "lucide-react"
import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface ErrorBoundaryProps {
	children: ReactNode
	fallback?: (error: Error, reset: () => void) => ReactNode
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
	errorInfo: React.ErrorInfo | null
}

/**
 * Comprehensive Error Boundary Component
 *
 * Features:
 * - Catches React rendering errors
 * - Provides recovery options (retry, go home)
 * - Customizable fallback UI
 * - Error logging support
 * - Graceful error display
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		}
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return {
			hasError: true,
			error,
		}
	}

	override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		// Log error to console in development
		console.error("ErrorBoundary caught an error:", error, errorInfo)

		// Update state with error info
		this.setState({
			errorInfo,
		})

		// Call custom error handler if provided
		if (this.props.onError) {
			this.props.onError(error, errorInfo)
		}

		// In production, you would send this to an error tracking service
		// Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
	}

	handleReset = (): void => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		})
	}

	handleGoHome = (): void => {
		window.location.href = "/"
	}

	handleReload = (): void => {
		window.location.reload()
	}

	override render(): ReactNode {
		if (this.state.hasError) {
			// Use custom fallback if provided
			if (this.props.fallback && this.state.error) {
				return this.props.fallback(this.state.error, this.handleReset)
			}

			// Default error UI
			return (
				<div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
					<Card className="max-w-2xl w-full p-8 space-y-6">
						<div className="flex items-center gap-4">
							<div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
								<AlertTriangle className="w-6 h-6 text-destructive" />
							</div>
							<div className="flex-1">
								<h1 className="text-2xl font-bold text-foreground">
									Something went wrong
								</h1>
								<p className="text-muted-foreground mt-1">
									We encountered an unexpected error. Don't worry, your data is
									safe.
								</p>
							</div>
						</div>

						{/* Error details (only in development) */}
						{process.env.NODE_ENV === "development" && this.state.error && (
							<div className="bg-muted rounded-lg p-4 space-y-2">
								<div className="text-sm font-mono text-destructive">
									<strong>Error:</strong> {this.state.error.message}
								</div>
								{this.state.error.stack && (
									<details className="text-xs font-mono text-muted-foreground">
										<summary className="cursor-pointer hover:text-foreground">
											Stack trace
										</summary>
										<pre className="mt-2 whitespace-pre-wrap overflow-x-auto">
											{this.state.error.stack}
										</pre>
									</details>
								)}
								{this.state.errorInfo?.componentStack && (
									<details className="text-xs font-mono text-muted-foreground">
										<summary className="cursor-pointer hover:text-foreground">
											Component stack
										</summary>
										<pre className="mt-2 whitespace-pre-wrap overflow-x-auto">
											{this.state.errorInfo.componentStack}
										</pre>
									</details>
								)}
							</div>
						)}

						{/* Recovery actions */}
						<div className="flex flex-col sm:flex-row gap-3">
							<Button
								className="flex-1"
								onClick={this.handleReset}
								variant="default"
							>
								<RefreshCw className="w-4 h-4 mr-2" />
								Try Again
							</Button>
							<Button
								className="flex-1"
								onClick={this.handleReload}
								variant="outline"
							>
								<RefreshCw className="w-4 h-4 mr-2" />
								Reload Page
							</Button>
							<Button
								className="flex-1"
								onClick={this.handleGoHome}
								variant="outline"
							>
								<Home className="w-4 h-4 mr-2" />
								Go Home
							</Button>
						</div>

						{/* Help text */}
						<div className="text-sm text-muted-foreground border-t pt-4">
							<p>If this problem persists, try:</p>
							<ul className="list-disc list-inside mt-2 space-y-1">
								<li>Clearing your browser cache</li>
								<li>Checking your internet connection</li>
								<li>Updating your browser to the latest version</li>
								<li>Contacting support if the issue continues</li>
							</ul>
						</div>
					</Card>
				</div>
			)
		}

		return this.props.children
	}
}

/**
 * Editor-specific error boundary with tailored recovery options
 */
export function EditorErrorBoundary({ children }: { children: ReactNode }) {
	return (
		<ErrorBoundary
			fallback={(error, reset) => (
				<div className="h-full flex items-center justify-center p-8 bg-[#0f1419]">
					<Card className="max-w-lg w-full p-6 space-y-4 bg-[#1a1f2e] border-white/10">
						<div className="flex items-center gap-3">
							<AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
							<div>
								<h2 className="text-xl font-semibold text-white">
									Editor Error
								</h2>
								<p className="text-sm text-gray-400 mt-1">
									The editor encountered an error while rendering.
								</p>
							</div>
						</div>

						{process.env.NODE_ENV === "development" && (
							<div className="bg-black/30 rounded p-3 text-xs font-mono text-red-400">
								{error.message}
							</div>
						)}

						<div className="flex gap-2">
							<Button className="flex-1" onClick={reset} size="sm">
								<RefreshCw className="w-4 h-4 mr-2" />
								Reset Editor
							</Button>
							<Button
								className="flex-1"
								onClick={() => (window.location.href = "/")}
								size="sm"
								variant="outline"
							>
								<Home className="w-4 h-4 mr-2" />
								Back to Home
							</Button>
						</div>

						<p className="text-xs text-gray-500">
							Your content is automatically saved. Try resetting the editor or
							refreshing the page.
						</p>
					</Card>
				</div>
			)}
			onError={(error, errorInfo) => {
				console.error("Editor error:", error, errorInfo)
				// In production: send to error tracking service
			}}
		>
			{children}
		</ErrorBoundary>
	)
}

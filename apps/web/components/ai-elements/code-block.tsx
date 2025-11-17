"use client"

import { cn } from "@lib/utils"
import { Button } from "@ui/components/button"
import { Check, Copy } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"

interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
	code: string
	language?: string
	showLineNumbers?: boolean
}

export function CodeBlock({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) {
	const lines = showLineNumbers ? code.split("\n") : null

	return (
		<div
			className={cn(
				"relative rounded-lg border border-border/30 bg-transparent font-mono text-xs",
				className,
			)}
			data-copy-code
			{...props}
		>
			{children && (
				<div className="absolute right-2 top-2 flex gap-1">{children}</div>
			)}
			<pre className="overflow-auto px-4 py-3 text-foreground">
				{showLineNumbers && lines ? (
					<code className="grid grid-cols-[auto_1fr] gap-x-4">
						{lines.map((line, index) => (
							<>
								<span
									className="select-none text-muted-foreground/70"
									key={`line-number-${index}`}
								>
									{index + 1}
								</span>
								<span key={`line-${index}`}>{line || "\u00A0"}</span>
							</>
						))}
					</code>
				) : (
					<code data-language={language}>{code}</code>
				)}
			</pre>
		</div>
	)
}

interface CodeBlockCopyButtonProps
	extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "onError"> {
	onCopy?: () => void
	onError?: (error: Error) => void
	timeout?: number
}

export function CodeBlockCopyButton({
	onCopy,
	onError,
	timeout = 2000,
	children,
	...props
}: CodeBlockCopyButtonProps) {
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(
		async (event: React.MouseEvent<HTMLButtonElement>) => {
			try {
				const parent = event.currentTarget.closest("[data-copy-code]")
				const code = parent?.querySelector("code")?.textContent
				if (!code) throw new Error("No code to copy")
				await navigator.clipboard.writeText(code)
				setCopied(true)
				onCopy?.()
				window.setTimeout(() => setCopied(false), timeout)
			} catch (error) {
				if (error instanceof Error) {
					onError?.(error)
				}
			}
		},
		[onCopy, onError, timeout],
	)

	return (
		<Button
			aria-label={copied ? "Copied" : "Copy code"}
			className={cn("h-7 w-7", props.className)}
			data-copy-code-button
			onClick={handleCopy}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ??
				(copied ? (
					<Check className="size-3.5" />
				) : (
					<Copy className="size-3.5" />
				))}
		</Button>
	)
}

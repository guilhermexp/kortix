"use client"

import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface CouncilMarkdownProps {
	content: string
}

/**
 * Markdown renderer for Council shapes
 * Uses inline styles to work within tldraw's HTMLContainer
 */
export const CouncilMarkdown = memo(({ content }: CouncilMarkdownProps) => {
	return (
		<>
			<ReactMarkdown
				components={{
					h1: ({ children }) => (
						<h1 style={{
							fontSize: "1.5em",
							fontWeight: 700,
							marginBottom: "0.75em",
							marginTop: "1em",
							lineHeight: 1.3,
							letterSpacing: "-0.02em",
						}}>
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 style={{
							fontSize: "1.25em",
							fontWeight: 600,
							marginBottom: "0.6em",
							marginTop: "0.9em",
							lineHeight: 1.35,
							letterSpacing: "-0.01em",
						}}>
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 style={{
							fontSize: "1.1em",
							fontWeight: 600,
							marginBottom: "0.5em",
							marginTop: "0.8em",
							lineHeight: 1.4,
						}}>
							{children}
						</h3>
					),
					p: ({ children }) => (
						<p style={{
							marginBottom: "0.8em",
							lineHeight: 1.7,
						}}>
							{children}
						</p>
					),
					ul: ({ children }) => (
						<ul style={{
							marginBottom: "0.8em",
							paddingLeft: "1.5em",
							listStyleType: "disc",
						}}>
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol style={{
							marginBottom: "0.8em",
							paddingLeft: "1.5em",
							listStyleType: "decimal",
						}}>
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li style={{
							marginBottom: "0.35em",
							lineHeight: 1.6,
							paddingLeft: "0.25em",
						}}>
							{children}
						</li>
					),
					strong: ({ children }) => (
						<strong style={{
							fontWeight: 600,
							color: "inherit",
						}}>
							{children}
						</strong>
					),
					em: ({ children }) => (
						<em style={{
							fontStyle: "italic",
							opacity: 0.95,
						}}>
							{children}
						</em>
					),
					blockquote: ({ children }) => (
						<blockquote style={{
							borderLeft: "3px solid currentColor",
							paddingLeft: "1em",
							marginLeft: 0,
							marginBottom: "0.8em",
							opacity: 0.85,
							fontStyle: "italic",
						}}>
							{children}
						</blockquote>
					),
					code: ({ children, className }) => {
						const isInline = !className
						if (isInline) {
							return (
								<code style={{
									fontFamily: "ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace",
									fontSize: "0.9em",
									padding: "0.15em 0.4em",
									borderRadius: "4px",
									backgroundColor: "rgba(255,255,255,0.1)",
								}}>
									{children}
								</code>
							)
						}
						return (
							<code style={{
								display: "block",
								fontFamily: "ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace",
								fontSize: "0.85em",
								padding: "0.8em 1em",
								borderRadius: "8px",
								backgroundColor: "rgba(255,255,255,0.08)",
								overflowX: "auto",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}>
								{children}
							</code>
						)
					},
					pre: ({ children }) => (
						<pre style={{
							marginBottom: "0.8em",
							overflow: "auto",
						}}>
							{children}
						</pre>
					),
					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								color: "inherit",
								textDecoration: "underline",
								textUnderlineOffset: "2px",
								opacity: 0.9,
							}}
						>
							{children}
						</a>
					),
					hr: () => (
						<hr style={{
							border: "none",
							borderTop: "1px solid currentColor",
							opacity: 0.2,
							margin: "1em 0",
						}} />
					),
				}}
				remarkPlugins={[remarkGfm]}
			>
				{content}
			</ReactMarkdown>
		</>
	)
})

CouncilMarkdown.displayName = "CouncilMarkdown"

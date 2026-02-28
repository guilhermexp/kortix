import { cn } from "@lib/utils"

export function Response({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"prose prose-invert max-w-none text-sm leading-relaxed",
				"prose-p:my-2 prose-strong:text-foreground prose-code:text-xs",
				"prose-table:border-white/10 prose-thead:border-white/10 prose-th:border-white/10 prose-td:border-white/10",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	)
}

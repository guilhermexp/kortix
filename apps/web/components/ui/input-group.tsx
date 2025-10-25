import { cn } from "@lib/utils"
import { Button } from "@ui/components/button"
import { Input } from "@ui/components/input"
import { Textarea } from "@ui/components/textarea"
import * as React from "react"

const InputGroup = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
	return (
		<div
			className={cn(
				"relative flex w-full items-center overflow-hidden rounded-xl transition-shadow bg-transparent",
				className,
			)}
			ref={ref}
			{...props}
		/>
	)
})
InputGroup.displayName = "InputGroup"

const InputGroupInput = React.forwardRef<
	HTMLInputElement,
	React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
	return (
		<Input
			className={cn(
				"flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
				className,
			)}
			ref={ref}
			{...props}
		/>
	)
})
InputGroupInput.displayName = "InputGroupInput"

const InputGroupTextarea = React.forwardRef<
	HTMLTextAreaElement,
	React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
	return (
		<Textarea
			className={cn(
				"min-h-[100px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3",
				className,
			)}
			ref={ref}
			{...props}
		/>
	)
})
InputGroupTextarea.displayName = "InputGroupTextarea"

const InputGroupAddon = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & {
		align?: "inline-start" | "inline-end" | "block-start" | "block-end"
	}
>(({ className, align = "inline-start", children, ...props }, ref) => {
	const alignClasses = {
		"inline-start": "left-0",
		"inline-end": "right-0",
		"block-start": "top-0 left-0 right-0",
		"block-end": "bottom-0 left-0 right-0",
	}

	const positionClasses = {
		"inline-start": "items-center",
		"inline-end": "items-center",
		"block-start": "items-start justify-between",
		"block-end": "items-end justify-between",
	}

	return (
		<div
			className={cn(
				"absolute flex gap-1.5 px-3 py-2 pointer-events-none",
				alignClasses[align],
				positionClasses[align],
				"[&>*]:pointer-events-auto",
				className,
			)}
			ref={ref}
			{...props}
		>
			{children}
		</div>
	)
})
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupText = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
	return (
		<span
			className={cn("text-sm text-muted-foreground", className)}
			ref={ref}
			{...props}
		/>
	)
})
InputGroupText.displayName = "InputGroupText"

const InputGroupButton = React.forwardRef<
	HTMLButtonElement,
	React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
	return <Button className={className} ref={ref} {...props} />
})
InputGroupButton.displayName = "InputGroupButton"

export {
	InputGroup,
	InputGroupInput,
	InputGroupTextarea,
	InputGroupAddon,
	InputGroupText,
	InputGroupButton,
}

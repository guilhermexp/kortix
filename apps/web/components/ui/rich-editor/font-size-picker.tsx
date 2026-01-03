"use client"

import { Minus, Plus } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"

import { Button } from "../button"
import { Input } from "../input"

interface FontSizePickerProps {
	disabled?: boolean
	onFontSizeSelect: (fontSize: string) => void
	currentFontSize?: string
}

// Extract numeric value from inline style fontSize value
const extractFontSize = (fontSizeValue?: string): number => {
	if (!fontSizeValue) return 16 // default

	// Check if it's a pixel value
	if (fontSizeValue.includes("px")) {
		return Number.parseInt(fontSizeValue.replace("px", ""), 10) || 16
	}

	// If it's just a number
	const parsed = Number.parseInt(fontSizeValue, 10)
	if (!Number.isNaN(parsed)) {
		return parsed
	}

	return 16
}

export function FontSizePicker({
	disabled = false,
	onFontSizeSelect,
	currentFontSize,
}: FontSizePickerProps) {
	const [fontSize, setFontSize] = useState<number>(
		extractFontSize(currentFontSize),
	)

	// Update fontSize when currentFontSize changes (selection changes)
	useEffect(() => {
		const extractedSize = extractFontSize(currentFontSize)
		setFontSize(extractedSize)
	}, [currentFontSize])

	const handleIncrement = () => {
		const newSize = Math.min(fontSize + 2, 128)
		setFontSize(newSize)
		onFontSizeSelect(`${newSize}px`)
	}

	const handleDecrement = () => {
		const newSize = Math.max(fontSize - 2, 8)
		setFontSize(newSize)
		onFontSizeSelect(`${newSize}px`)
	}

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = Number.parseInt(e.target.value, 10) || 16
		const clampedValue = Math.max(8, Math.min(value, 128))
		setFontSize(clampedValue)
	}

	const handleInputBlur = () => {
		onFontSizeSelect(`${fontSize}px`)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
		if (e.key === "Enter") {
			onFontSizeSelect(`${fontSize}px`)
			e.currentTarget.blur()
		}
	}

	return (
		<div className="bg-muted/50 flex items-center gap-0.5 rounded-md">
			<Button
				className="hover:bg-muted h-7 w-6 rounded-r-none md:h-8 md:w-7"
				disabled={disabled || fontSize <= 8}
				onClick={handleDecrement}
				size="icon"
				title="Decrease font size"
				variant="ghost"
			>
				<Minus className="size-3 md:size-3.5" />
			</Button>

			<Input
				className="h-7 w-10 [appearance:textfield] rounded-none border-0 bg-transparent px-0.5 text-center text-xs focus-visible:ring-0 focus-visible:ring-offset-0 md:h-8 md:w-14 md:px-1 md:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				disabled={disabled}
				max={128}
				min={8}
				onBlur={handleInputBlur}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				title="Font size in pixels"
				type="number"
				value={fontSize}
			/>

			<Button
				className="hover:bg-muted h-7 w-6 rounded-l-none md:h-8 md:w-7"
				disabled={disabled || fontSize >= 128}
				onClick={handleIncrement}
				size="icon"
				title="Increase font size"
				variant="ghost"
			>
				<Plus className="size-3 md:size-3.5" />
			</Button>
		</div>
	)
}

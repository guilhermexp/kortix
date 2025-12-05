// ============================================================
// TLDraw AI Conversions
// Fill style converters between simple and TLDraw formats
// ============================================================

import type { TLDefaultFillStyle } from "tldraw"

// Simple fill values to TLDraw fill values
export function simpleFillToTldrawFill(fill: string | undefined): TLDefaultFillStyle {
	switch (fill) {
		case "none":
			return "none"
		case "semi":
			return "semi"
		case "solid":
			return "solid"
		case "pattern":
			return "pattern"
		default:
			return "none"
	}
}

// TLDraw fill values to simple fill values
export function tldrawFillToSimpleFill(
	fill: TLDefaultFillStyle | undefined
): "none" | "semi" | "solid" | "pattern" {
	switch (fill) {
		case "none":
			return "none"
		case "semi":
			return "semi"
		case "solid":
			return "solid"
		case "pattern":
			return "pattern"
		default:
			return "none"
	}
}

// Convert simple color to TLDraw color
export function simpleColorToTldrawColor(color: string | undefined): string {
	// TLDraw uses the same color names, so just validate
	const validColors = [
		"black",
		"grey",
		"light-violet",
		"violet",
		"blue",
		"light-blue",
		"yellow",
		"orange",
		"green",
		"light-green",
		"light-red",
		"red",
		"white",
	]
	if (color && validColors.includes(color)) {
		return color
	}
	return "black"
}

// Convert simple size to TLDraw size
export function simpleSizeToTldrawSize(size: string | undefined): "s" | "m" | "l" | "xl" {
	switch (size) {
		case "s":
			return "s"
		case "m":
			return "m"
		case "l":
			return "l"
		case "xl":
			return "xl"
		default:
			return "m"
	}
}

// Convert simple dash to TLDraw dash
export function simpleDashToTldrawDash(
	dash: string | undefined
): "draw" | "dashed" | "dotted" | "solid" {
	switch (dash) {
		case "draw":
			return "draw"
		case "dashed":
			return "dashed"
		case "dotted":
			return "dotted"
		case "solid":
			return "solid"
		default:
			return "draw"
	}
}

// Convert simple font to TLDraw font
export function simpleFontToTldrawFont(font: string | undefined): "draw" | "sans" | "serif" | "mono" {
	switch (font) {
		case "draw":
			return "draw"
		case "sans":
			return "sans"
		case "serif":
			return "serif"
		case "mono":
			return "mono"
		default:
			return "draw"
	}
}

// Convert simple text align to TLDraw align
export function simpleAlignToTldrawAlign(
	align: string | undefined
): "start" | "middle" | "end" | "start-legacy" | "end-legacy" | "middle-legacy" {
	switch (align) {
		case "start":
			return "start"
		case "middle":
			return "middle"
		case "end":
			return "end"
		default:
			return "middle"
	}
}

// Convert simple arrowhead to TLDraw arrowhead
export function simpleArrowheadToTldrawArrowhead(
	arrowhead: string | undefined
): "none" | "arrow" | "triangle" | "square" | "dot" | "diamond" | "inverted" | "bar" | "pipe" {
	switch (arrowhead) {
		case "none":
			return "none"
		case "arrow":
			return "arrow"
		case "triangle":
			return "triangle"
		case "square":
			return "square"
		case "dot":
			return "dot"
		case "diamond":
			return "diamond"
		case "inverted":
			return "inverted"
		case "bar":
			return "bar"
		case "pipe":
			return "pipe"
		default:
			return "none"
	}
}

// Map simple geo type to TLDraw geo type
export function simpleGeoToTldrawGeo(type: string): string {
	const geoMap: Record<string, string> = {
		rectangle: "rectangle",
		ellipse: "ellipse",
		triangle: "triangle",
		diamond: "diamond",
		pentagon: "pentagon",
		hexagon: "hexagon",
		octagon: "octagon",
		star: "star",
		rhombus: "rhombus",
		"rhombus-2": "rhombus-2",
		heart: "heart",
		oval: "oval",
		trapezoid: "trapezoid",
		"arrow-left": "arrow-left",
		"arrow-right": "arrow-right",
		"arrow-up": "arrow-up",
		"arrow-down": "arrow-down",
		"x-box": "x-box",
		"check-box": "check-box",
		cloud: "cloud",
	}
	return geoMap[type] || "rectangle"
}

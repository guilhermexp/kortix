// ============================================================
// TLDraw AI Simple Schema
// Defines Zod schemas for shapes and AI events
// ============================================================

import { z } from "zod"

// ============================================================
// BASE SCHEMAS
// ============================================================

export const IdSchema = z.string().describe("A unique id for the shape")

export const ColorSchema = z
	.enum([
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
	])
	.describe("The color of the shape")

export const LabelColorSchema = z
	.enum([
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
	])
	.describe("The color of the label text")

export const TextAlignSchema = z
	.enum(["start", "middle", "end"])
	.describe("The alignment of the text within the text shape")

export const TextSizeSchema = z
	.enum(["s", "m", "l", "xl"])
	.describe("The size of the text")

export const FontSchema = z
	.enum(["draw", "sans", "serif", "mono"])
	.describe("The font family of the text")

export const FillSchema = z
	.enum(["none", "semi", "solid", "pattern"])
	.describe("The fill style of the shape")

export const DashSchema = z
	.enum(["draw", "dashed", "dotted", "solid"])
	.describe("The dash style of the shape")

export const SizeSchema = z
	.enum(["s", "m", "l", "xl"])
	.describe("The size of the shape")

export const ArrowheadSchema = z
	.enum([
		"none",
		"arrow",
		"triangle",
		"square",
		"dot",
		"diamond",
		"inverted",
		"bar",
		"pipe",
	])
	.describe("The arrowhead style")

export const GrowSchema = z
	.enum(["up", "right", "down", "left"])
	.describe("The direction of growth")

// ============================================================
// POINT SCHEMAS
// ============================================================

export const PointSchema = z
	.object({
		x: z.number().describe("The x coordinate"),
		y: z.number().describe("The y coordinate"),
	})
	.describe("A point in the canvas")

export const BoundsSchema = z
	.object({
		x: z.number().describe("The x coordinate of the top left corner"),
		y: z.number().describe("The y coordinate of the top left corner"),
		w: z.number().describe("The width of the bounds"),
		h: z.number().describe("The height of the bounds"),
	})
	.describe("The bounds of a shape")

// ============================================================
// SHAPE SCHEMAS
// ============================================================

const BaseShapeSchema = z.object({
	id: IdSchema,
	x: z.number().describe("The x coordinate of the shape"),
	y: z.number().describe("The y coordinate of the shape"),
})

export const RectangleSchema = BaseShapeSchema.extend({
	type: z.literal("rectangle"),
	w: z.number().describe("The width of the rectangle"),
	h: z.number().describe("The height of the rectangle"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the rectangle"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A rectangle shape")

export const EllipseSchema = BaseShapeSchema.extend({
	type: z.literal("ellipse"),
	w: z.number().describe("The width of the ellipse"),
	h: z.number().describe("The height of the ellipse"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the ellipse"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An ellipse shape")

export const TriangleSchema = BaseShapeSchema.extend({
	type: z.literal("triangle"),
	w: z.number().describe("The width of the triangle"),
	h: z.number().describe("The height of the triangle"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the triangle"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A triangle shape")

export const DiamondSchema = BaseShapeSchema.extend({
	type: z.literal("diamond"),
	w: z.number().describe("The width of the diamond"),
	h: z.number().describe("The height of the diamond"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the diamond"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A diamond shape")

export const PentagonSchema = BaseShapeSchema.extend({
	type: z.literal("pentagon"),
	w: z.number().describe("The width of the pentagon"),
	h: z.number().describe("The height of the pentagon"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the pentagon"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A pentagon shape")

export const HexagonSchema = BaseShapeSchema.extend({
	type: z.literal("hexagon"),
	w: z.number().describe("The width of the hexagon"),
	h: z.number().describe("The height of the hexagon"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the hexagon"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A hexagon shape")

export const OctagonSchema = BaseShapeSchema.extend({
	type: z.literal("octagon"),
	w: z.number().describe("The width of the octagon"),
	h: z.number().describe("The height of the octagon"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the octagon"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An octagon shape")

export const StarSchema = BaseShapeSchema.extend({
	type: z.literal("star"),
	w: z.number().describe("The width of the star"),
	h: z.number().describe("The height of the star"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z.string().optional().describe("Optional text label inside the star"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A star shape")

export const RhombusSchema = BaseShapeSchema.extend({
	type: z.literal("rhombus"),
	w: z.number().describe("The width of the rhombus"),
	h: z.number().describe("The height of the rhombus"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the rhombus"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A rhombus shape")

export const HeartSchema = BaseShapeSchema.extend({
	type: z.literal("heart"),
	w: z.number().describe("The width of the heart"),
	h: z.number().describe("The height of the heart"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z.string().optional().describe("Optional text label inside the heart"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A heart shape")

export const OvalSchema = BaseShapeSchema.extend({
	type: z.literal("oval"),
	w: z.number().describe("The width of the oval"),
	h: z.number().describe("The height of the oval"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z.string().optional().describe("Optional text label inside the oval"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An oval shape")

export const TrapezoidSchema = BaseShapeSchema.extend({
	type: z.literal("trapezoid"),
	w: z.number().describe("The width of the trapezoid"),
	h: z.number().describe("The height of the trapezoid"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the trapezoid"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A trapezoid shape")

export const ArrowLeftSchema = BaseShapeSchema.extend({
	type: z.literal("arrow-left"),
	w: z.number().describe("The width of the arrow-left"),
	h: z.number().describe("The height of the arrow-left"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the arrow-left"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An arrow-left shape")

export const ArrowRightSchema = BaseShapeSchema.extend({
	type: z.literal("arrow-right"),
	w: z.number().describe("The width of the arrow-right"),
	h: z.number().describe("The height of the arrow-right"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the arrow-right"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An arrow-right shape")

export const ArrowUpSchema = BaseShapeSchema.extend({
	type: z.literal("arrow-up"),
	w: z.number().describe("The width of the arrow-up"),
	h: z.number().describe("The height of the arrow-up"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the arrow-up"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An arrow-up shape")

export const ArrowDownSchema = BaseShapeSchema.extend({
	type: z.literal("arrow-down"),
	w: z.number().describe("The width of the arrow-down"),
	h: z.number().describe("The height of the arrow-down"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the arrow-down"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An arrow-down shape")

export const XBoxSchema = BaseShapeSchema.extend({
	type: z.literal("x-box"),
	w: z.number().describe("The width of the x-box"),
	h: z.number().describe("The height of the x-box"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z.string().optional().describe("Optional text label inside the x-box"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("An x-box shape")

export const CheckBoxSchema = BaseShapeSchema.extend({
	type: z.literal("check-box"),
	w: z.number().describe("The width of the check-box"),
	h: z.number().describe("The height of the check-box"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z
		.string()
		.optional()
		.describe("Optional text label inside the check-box"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A check-box shape")

export const CloudSchema = BaseShapeSchema.extend({
	type: z.literal("cloud"),
	w: z.number().describe("The width of the cloud"),
	h: z.number().describe("The height of the cloud"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	label: z.string().optional().describe("Optional text label inside the cloud"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
}).describe("A cloud shape")

export const TextSchema = BaseShapeSchema.extend({
	type: z.literal("text"),
	text: z.string().describe("The text content"),
	w: z.number().describe("The width of the text box"),
	color: ColorSchema.optional(),
	size: TextSizeSchema.optional(),
	font: FontSchema.optional(),
	align: TextAlignSchema.optional(),
	autoSize: z.boolean().optional().describe("Whether the text auto-sizes"),
}).describe("A text shape")

export const NoteSchema = BaseShapeSchema.extend({
	type: z.literal("note"),
	text: z.string().describe("The text content of the note"),
	w: z.number().describe("The width of the note"),
	h: z.number().describe("The height of the note"),
	color: ColorSchema.optional(),
	size: TextSizeSchema.optional(),
	font: FontSchema.optional(),
	align: TextAlignSchema.optional(),
	fontSizeAdjustment: z.number().optional().describe("Font size adjustment"),
	growY: z.number().optional().describe("Vertical growth"),
}).describe("A sticky note shape")

export const FrameSchema = BaseShapeSchema.extend({
	type: z.literal("frame"),
	w: z.number().describe("The width of the frame"),
	h: z.number().describe("The height of the frame"),
	name: z.string().optional().describe("The name/title of the frame"),
}).describe("A frame shape for grouping other shapes")

export const ArrowSchema = BaseShapeSchema.extend({
	type: z.literal("arrow"),
	start: z
		.union([
			PointSchema.describe("A point for the start of the arrow"),
			z
				.object({
					id: IdSchema.describe("The id of the shape to connect to"),
				})
				.describe("A reference to another shape"),
		])
		.describe("The start point or shape reference"),
	end: z
		.union([
			PointSchema.describe("A point for the end of the arrow"),
			z
				.object({
					id: IdSchema.describe("The id of the shape to connect to"),
				})
				.describe("A reference to another shape"),
		])
		.describe("The end point or shape reference"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	arrowheadStart: ArrowheadSchema.optional(),
	arrowheadEnd: ArrowheadSchema.optional(),
	label: z.string().optional().describe("Optional text label on the arrow"),
	labelColor: LabelColorSchema.optional(),
	font: FontSchema.optional(),
	bend: z.number().optional().describe("The bend of the arrow (-1 to 1)"),
}).describe("An arrow shape that can connect shapes")

export const LineSchema = BaseShapeSchema.extend({
	type: z.literal("line"),
	points: z.array(PointSchema).describe("The points of the line"),
	color: ColorSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	spline: z.enum(["line", "cubic"]).optional().describe("The spline type"),
}).describe("A line shape with multiple points")

export const DrawSchema = BaseShapeSchema.extend({
	type: z.literal("draw"),
	color: ColorSchema.optional(),
	fill: FillSchema.optional(),
	dash: DashSchema.optional(),
	size: SizeSchema.optional(),
	segments: z
		.array(
			z.object({
				type: z.enum(["free", "straight"]),
				points: z.array(
					z.object({
						x: z.number(),
						y: z.number(),
						z: z.number().optional(),
					}),
				),
			}),
		)
		.describe("The drawing segments"),
	isComplete: z.boolean().optional(),
	isClosed: z.boolean().optional(),
}).describe("A freehand drawing shape")

export const HighlightSchema = BaseShapeSchema.extend({
	type: z.literal("highlight"),
	color: ColorSchema.optional(),
	size: SizeSchema.optional(),
	segments: z
		.array(
			z.object({
				type: z.enum(["free", "straight"]),
				points: z.array(
					z.object({
						x: z.number(),
						y: z.number(),
						z: z.number().optional(),
					}),
				),
			}),
		)
		.describe("The highlight segments"),
	isComplete: z.boolean().optional(),
	isPen: z.boolean().optional(),
}).describe("A highlight shape")

export const ImageSchema = BaseShapeSchema.extend({
	type: z.literal("image"),
	w: z.number().describe("The width of the image"),
	h: z.number().describe("The height of the image"),
	assetId: z.string().describe("The asset id of the image"),
	playing: z.boolean().optional(),
	crop: z
		.object({
			topLeft: PointSchema,
			bottomRight: PointSchema,
		})
		.optional(),
}).describe("An image shape")

export const VideoSchema = BaseShapeSchema.extend({
	type: z.literal("video"),
	w: z.number().describe("The width of the video"),
	h: z.number().describe("The height of the video"),
	assetId: z.string().describe("The asset id of the video"),
	playing: z.boolean().optional(),
	time: z.number().optional(),
}).describe("A video shape")

export const EmbedSchema = BaseShapeSchema.extend({
	type: z.literal("embed"),
	w: z.number().describe("The width of the embed"),
	h: z.number().describe("The height of the embed"),
	url: z.string().describe("The URL of the embed"),
}).describe("An embed shape for external content")

export const BookmarkSchema = BaseShapeSchema.extend({
	type: z.literal("bookmark"),
	w: z.number().describe("The width of the bookmark"),
	h: z.number().describe("The height of the bookmark"),
	url: z.string().describe("The URL of the bookmark"),
	assetId: z.string().optional().describe("Optional preview asset"),
}).describe("A bookmark shape")

// Geo shape union (all geo types)
export const GeoShapeSchema = z.discriminatedUnion("type", [
	RectangleSchema,
	EllipseSchema,
	TriangleSchema,
	DiamondSchema,
	PentagonSchema,
	HexagonSchema,
	OctagonSchema,
	StarSchema,
	RhombusSchema,
	HeartSchema,
	OvalSchema,
	TrapezoidSchema,
	ArrowLeftSchema,
	ArrowRightSchema,
	ArrowUpSchema,
	ArrowDownSchema,
	XBoxSchema,
	CheckBoxSchema,
	CloudSchema,
])

// All shape union
export const ShapeSchema = z.union([
	GeoShapeSchema,
	TextSchema,
	NoteSchema,
	FrameSchema,
	ArrowSchema,
	LineSchema,
	DrawSchema,
	HighlightSchema,
	ImageSchema,
	VideoSchema,
	EmbedSchema,
	BookmarkSchema,
])

export type Shape = z.infer<typeof ShapeSchema>

// ============================================================
// EVENT SCHEMAS
// ============================================================

export const CreateEventSchema = z
	.object({
		type: z.literal("create"),
		shape: ShapeSchema.describe("The shape to create"),
	})
	.describe("Create a new shape on the canvas")

// Changes schema with explicit properties for Gemini compatibility
// Gemini requires object types to have at least one property defined
export const ShapeChangesSchema = z
	.object({
		x: z.number().optional().describe("New x coordinate"),
		y: z.number().optional().describe("New y coordinate"),
		w: z.number().optional().describe("New width"),
		h: z.number().optional().describe("New height"),
		color: ColorSchema.optional().describe("New color"),
		fill: FillSchema.optional().describe("New fill style"),
		dash: DashSchema.optional().describe("New dash style"),
		size: SizeSchema.optional().describe("New size"),
		label: z.string().optional().describe("New label text"),
		labelColor: LabelColorSchema.optional().describe("New label color"),
		font: FontSchema.optional().describe("New font"),
		text: z
			.string()
			.optional()
			.describe("New text content (for text/note shapes)"),
		align: TextAlignSchema.optional().describe("New text alignment"),
		name: z.string().optional().describe("New name (for frame shapes)"),
		rotation: z.number().optional().describe("New rotation angle"),
		opacity: z.number().optional().describe("New opacity (0-1)"),
	})
	.describe(
		"Properties to change on the shape. Only include properties that should change.",
	)

export const UpdateEventSchema = z
	.object({
		type: z.literal("update"),
		id: IdSchema.describe("The id of the shape to update"),
		changes: ShapeChangesSchema,
	})
	.describe("Update an existing shape's properties")

export const MoveEventSchema = z
	.object({
		type: z.literal("move"),
		id: IdSchema.describe("The id of the shape to move"),
		x: z.number().describe("The new x coordinate"),
		y: z.number().describe("The new y coordinate"),
	})
	.describe("Move an existing shape to a new position")

export const LabelEventSchema = z
	.object({
		type: z.literal("label"),
		id: IdSchema.describe("The id of the shape to label"),
		label: z.string().describe("The new label text"),
	})
	.describe("Update the label text of a shape")

export const DeleteEventSchema = z
	.object({
		type: z.literal("delete"),
		id: IdSchema.describe("The id of the shape to delete"),
	})
	.describe("Delete a shape from the canvas")

export const ThinkEventSchema = z
	.object({
		type: z.literal("think"),
		text: z.string().describe("The AI's thought process or reasoning"),
	})
	.describe("Internal AI thinking/reasoning (not shown to user)")

export const MessageEventSchema = z
	.object({
		type: z.literal("message"),
		text: z.string().describe("A message to display to the user"),
	})
	.describe("A message from the AI to the user")

// Note: ScheduleEventSchema removed due to Zod v4 compatibility issues with z.lazy
// If needed, can be added back with proper Zod v4 syntax

export const EventSchema = z.discriminatedUnion("type", [
	CreateEventSchema,
	UpdateEventSchema,
	MoveEventSchema,
	LabelEventSchema,
	DeleteEventSchema,
	ThinkEventSchema,
	MessageEventSchema,
])

export type SimpleEvent = z.infer<typeof EventSchema>

// ============================================================
// MODEL RESPONSE SCHEMA
// ============================================================

export const ModelResponseSchema = z.object({
	events: z
		.array(EventSchema)
		.describe("The list of events to execute on the canvas"),
})

export type ModelResponse = z.infer<typeof ModelResponseSchema>

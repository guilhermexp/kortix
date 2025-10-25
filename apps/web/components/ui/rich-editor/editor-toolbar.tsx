"use client"

import {
	Bold,
	Check,
	Copy,
	Download,
	Eye,
	EyeOff,
	ImagePlus,
	Italic,
	LayoutGrid,
	Link as LinkIcon,
	List,
	ListOrdered,
	Menu,
	Moon,
	Redo,
	Sun,
	Table as TableIcon,
	Type,
	Underline,
	Undo,
} from "lucide-react"
import { useTheme } from "next-themes"
import React from "react"

import { Button } from "../button"
import { ButtonGroup } from "../button-group"
import { CardContent } from "../card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../dialog"
import { Label } from "../label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../select"
import { Separator } from "../separator"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../sheet"
import { Switch } from "../switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs"
import { ToggleGroup, ToggleGroupItem } from "../toggle-group"
import { ColorPickerComponent } from "./color-picker"
import { FontSizePicker } from "./font-size-picker"
import {
	type ContainerNode,
	type SelectionInfo,
	serializeToHtml,
	type TextNode,
} from "./index"
import { MediaUploadPopover } from "./media-upload-popover"

interface EditorToolbarProps {
	currentNode?: TextNode | null
	currentSelection: SelectionInfo | null
	selectedColor: string
	isUploading: boolean
	enhanceSpaces: boolean
	copiedHtml: boolean
	copiedJson: boolean
	container: ContainerNode
	onTypeChange: (type: TextNode["type"]) => void
	onFormat: (format: "bold" | "italic" | "underline") => void
	onColorSelect: (color: string) => void
	onFontSizeSelect: (fontSize: string) => void
	onImageUploadClick: () => void
	onMultipleImagesUploadClick: () => void
	onVideoUploadClick: () => void
	onCreateList: (listType: "ul" | "ol") => void
	onCreateLink: () => void
	onCreateTable: () => void
	onCopyHtml: () => void
	onCopyJson: () => void
	onEnhanceSpacesChange: (checked: boolean) => void
}

export function EditorToolbar({
	currentNode,
	currentSelection,
	selectedColor,
	isUploading,
	enhanceSpaces,
	copiedHtml,
	copiedJson,
	container,
	onTypeChange,
	onFormat,
	onColorSelect,
	onFontSizeSelect,
	onImageUploadClick,
	onMultipleImagesUploadClick,
	onVideoUploadClick,
	onCreateList,
	onCreateLink,
	onCreateTable,
	onCopyHtml,
	onCopyJson,
	onEnhanceSpacesChange,
}: EditorToolbarProps) {
	return (
		<CardContent className="bg-background/30 sticky top-0 z-40 mx-auto w-full border-b p-2 backdrop-blur-2xl transition-all duration-300 md:p-3">
			<div className="mx-auto flex w-full max-w-4xl flex-col items-stretch justify-between gap-2 md:flex-row md:items-center md:gap-3 lg:px-6">
				{/* Left Section - Text Formatting */}
				<div className="flex flex-wrap items-center gap-1.5 md:gap-2">
					{/* Type Selector */}
					<div className="bg-muted/50 flex items-center gap-1 rounded-md px-1.5 py-1 md:gap-1.5 md:px-2">
						<Type className="text-muted-foreground hidden size-3 sm:block md:size-3.5" />
						<Select
							disabled={
								!currentNode ||
								currentNode.type === "br" ||
								currentNode.type === "img"
							}
							onValueChange={(value) => onTypeChange(value as TextNode["type"])}
							value={
								currentSelection?.elementType !== undefined &&
								currentSelection?.elementType !== null
									? currentSelection.elementType
									: currentNode?.type || "p"
							}
						>
							<SelectTrigger className="h-7 w-[90px] border-0 bg-transparent text-xs focus:ring-0 sm:w-[120px] sm:text-sm md:h-8 md:w-[140px]">
								<SelectValue placeholder="Select type">
									{(() => {
										const type =
											currentSelection?.elementType !== undefined &&
											currentSelection?.elementType !== null
												? currentSelection.elementType
												: currentNode?.type || "p"

										switch (type) {
											case "h1":
												return (
													<span className="text-base font-bold">Heading 1</span>
												)
											case "h2":
												return (
													<span className="text-sm font-bold">Heading 2</span>
												)
											case "h3":
												return (
													<span className="text-sm font-semibold">
														Heading 3
													</span>
												)
											case "h4":
												return (
													<span className="text-xs font-semibold">
														Heading 4
													</span>
												)
											case "h5":
												return (
													<span className="text-xs font-semibold">
														Heading 5
													</span>
												)
											case "h6":
												return (
													<span className="text-xs font-semibold">
														Heading 6
													</span>
												)
											case "li":
												return <span className="text-sm">List Item</span>
											case "blockquote":
												return <span className="text-sm italic">Quote</span>
											case "code":
												return <span className="font-mono text-xs">Code</span>
											default:
												return <span className="text-sm">Paragraph</span>
										}
									})()}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="p">
									<span className="text-sm">Paragraph</span>
								</SelectItem>
								<SelectItem value="h1">
									<span className="text-base font-bold">Heading 1</span>
								</SelectItem>
								<SelectItem value="h2">
									<span className="text-sm font-bold">Heading 2</span>
								</SelectItem>
								<SelectItem value="h3">
									<span className="text-sm font-semibold">Heading 3</span>
								</SelectItem>
								<SelectItem value="h4">
									<span className="text-xs font-semibold">Heading 4</span>
								</SelectItem>
								<SelectItem value="h5">
									<span className="text-xs font-semibold">Heading 5</span>
								</SelectItem>
								<SelectItem value="h6">
									<span className="text-xs font-semibold">Heading 6</span>
								</SelectItem>
								<SelectItem value="li">
									<span className="text-sm">List Item</span>
								</SelectItem>
								<SelectItem value="blockquote">
									<span className="text-sm italic">Quote</span>
								</SelectItem>
								<SelectItem value="code">
									<span className="font-mono text-xs">Code</span>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<Separator
						className="hidden h-5 sm:block md:h-6"
						orientation="vertical"
					/>

					{/* Format Buttons */}
					<ToggleGroup
						disabled={!currentSelection}
						size="sm"
						type="multiple"
						value={[
							...(currentSelection?.formats.bold ? ["bold"] : []),
							...(currentSelection?.formats.italic ? ["italic"] : []),
							...(currentSelection?.formats.underline ? ["underline"] : []),
						]}
						variant="outline"
					>
						<ToggleGroupItem
							aria-label="Toggle bold"
							className="h-7 w-7 md:h-8 md:w-8"
							disabled={!currentSelection}
							onClick={() => onFormat("bold")}
							value="bold"
						>
							<Bold className="size-3 md:size-3.5" />
						</ToggleGroupItem>
						<ToggleGroupItem
							aria-label="Toggle italic"
							className="h-7 w-7 md:h-8 md:w-8"
							disabled={!currentSelection}
							onClick={() => onFormat("italic")}
							value="italic"
						>
							<Italic className="size-3 md:size-3.5" />
						</ToggleGroupItem>
						<ToggleGroupItem
							aria-label="Toggle underline"
							className="h-7 w-7 md:h-8 md:w-8"
							disabled={!currentSelection}
							onClick={() => onFormat("underline")}
							value="underline"
						>
							<Underline className="size-3 md:size-3.5" />
						</ToggleGroupItem>
					</ToggleGroup>

					{/* Color Picker */}
					<ColorPickerComponent
						disabled={!currentSelection}
						onColorSelect={onColorSelect}
						selectedColor={selectedColor}
					/>

					<Separator
						className="hidden h-5 md:h-6 lg:block"
						orientation="vertical"
					/>

					{/* Font Size Picker */}
					<FontSizePicker
						currentFontSize={currentSelection?.styles?.fontSize || undefined}
						disabled={!currentSelection}
						onFontSizeSelect={onFontSizeSelect}
					/>
				</div>

				<Separator className="hidden h-8 xl:block" orientation="vertical" />

				{/* Right Section - Insert Elements */}
				<div className="flex flex-wrap items-center gap-1.5 md:gap-2">
					{/* Media Upload Popover - combines image and video uploads */}
					<MediaUploadPopover
						isUploading={isUploading}
						onImageUploadClick={onImageUploadClick}
						onMultipleImagesUploadClick={onMultipleImagesUploadClick}
						onVideoUploadClick={onVideoUploadClick}
					/>

					<Separator
						className="hidden h-5 sm:block md:h-6"
						orientation="vertical"
					/>

					{/* List Button Group */}
					<ButtonGroup>
						<Button
							className="h-7 w-7 md:h-8 md:w-8"
							onClick={() => onCreateList("ul")}
							size="icon"
							title="Add unordered list"
							variant="ghost"
						>
							<List className="size-3 md:size-3.5" />
						</Button>
						<Button
							className="h-7 w-7 md:h-8 md:w-8"
							onClick={() => onCreateList("ol")}
							size="icon"
							title="Add ordered list"
							variant="ghost"
						>
							<ListOrdered className="size-3 md:size-3.5" />
						</Button>
					</ButtonGroup>

					{/* Link Button */}
					<Button
						className="h-7 w-7 md:h-8 md:w-8"
						onClick={onCreateLink}
						size="icon"
						title="Add link"
						variant="ghost"
					>
						<LinkIcon className="size-3 md:size-3.5" />
					</Button>

					{/* Table Button */}
					<Button
						className="h-7 w-7 md:h-8 md:w-8"
						onClick={onCreateTable}
						size="icon"
						title="Add table"
						variant="ghost"
					>
						<TableIcon className="size-3 md:size-3.5" />
					</Button>

					<Separator
						className="hidden h-5 sm:block md:h-6"
						orientation="vertical"
					/>

					{/* View Code Button */}
					<Dialog>
						<DialogTrigger asChild>
							<Button
								className="h-7 w-7 md:h-8 md:w-8"
								size="icon"
								title="Export code"
								variant="ghost"
							>
								<Download className="size-3 md:size-3.5" />
							</Button>
						</DialogTrigger>
						<DialogContent className="flex max-h-[90vh] max-w-[90vw] min-w-[90vw] flex-col overflow-hidden">
							<DialogHeader>
								<DialogTitle>Export Code</DialogTitle>
								<DialogDescription>
									Copy the HTML or JSON output of your editor content
								</DialogDescription>
							</DialogHeader>

							<Tabs
								className="flex flex-1 flex-col overflow-hidden"
								defaultValue="preview"
							>
								<TabsList className="grid w-full grid-cols-3">
									<TabsTrigger value="preview">
										<Eye className="mr-2 h-4 w-4" />
										Preview
									</TabsTrigger>
									<TabsTrigger value="html">HTML Output</TabsTrigger>
									<TabsTrigger value="json">JSON Data</TabsTrigger>
								</TabsList>

								{/* Enhance Spaces Toggle */}
								<div className="mt-4 flex items-center justify-between px-1">
									<p className="text-muted-foreground text-sm">
										Preview Options
									</p>
									<div className="flex items-center gap-2">
										<Label
											className="cursor-pointer text-sm"
											htmlFor="enhance-spaces"
										>
											Enhance Spaces
										</Label>
										<Switch
											checked={enhanceSpaces}
											id="enhance-spaces"
											onCheckedChange={onEnhanceSpacesChange}
										/>
									</div>
								</div>

								<TabsContent
									className="mt-4 flex flex-1 flex-col overflow-hidden"
									value="preview"
								>
									<div className="mb-2 flex items-center justify-between">
										<p className="text-muted-foreground text-sm">
											Live preview of rendered HTML
										</p>
									</div>
									<div
										className="bg-background flex-1 overflow-auto rounded-lg border p-6"
										dangerouslySetInnerHTML={{
											__html: enhanceSpaces
												? `<div class="[&>*]:my-3 [&_*]:my-5">${serializeToHtml(
														container,
													)}</div>`
												: serializeToHtml(container),
										}}
									/>
								</TabsContent>

								<TabsContent
									className="mt-4 flex flex-1 flex-col overflow-hidden"
									value="html"
								>
									<div className="mb-2 flex items-center justify-between">
										<p className="text-muted-foreground text-sm">
											HTML with Tailwind CSS classes
										</p>
										<Button
											className="gap-2"
											onClick={onCopyHtml}
											size="sm"
											variant="ghost"
										>
											{copiedHtml ? (
												<>
													<Check className="h-4 w-4" />
													Copied!
												</>
											) : (
												<>
													<Copy className="h-4 w-4" />
													Copy HTML
												</>
											)}
										</Button>
									</div>
									<pre className="bg-secondary text-secondary-foreground flex-1 overflow-auto rounded-lg border p-4 text-xs">
										{enhanceSpaces
											? `<div class="[&>*]:my-3 [&_*]:my-5">\n${serializeToHtml(
													container,
												)}\n</div>`
											: serializeToHtml(container)}
									</pre>
								</TabsContent>

								<TabsContent
									className="mt-4 flex flex-1 flex-col overflow-hidden"
									value="json"
								>
									<div className="mb-2 flex items-center justify-between">
										<p className="text-muted-foreground text-sm">
											Editor state as JSON
										</p>
										<Button
											className="gap-2"
											onClick={onCopyJson}
											size="sm"
											variant="ghost"
										>
											{copiedJson ? (
												<>
													<Check className="h-4 w-4" />
													Copied!
												</>
											) : (
												<>
													<Copy className="h-4 w-4" />
													Copy JSON
												</>
											)}
										</Button>
									</div>
									<pre className="bg-secondary text-secondary-foreground flex-1 overflow-auto rounded-lg border p-4 text-xs">
										{JSON.stringify(container.children, null, 2)}
									</pre>
								</TabsContent>
							</Tabs>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		</CardContent>
	)
}

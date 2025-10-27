exports.__esModule = true
exports.isMarkdownTable = exports.parseMarkdownTable = void 0
/**
 * Parse markdown table string into table structure
 *
 * @example
 * ```
 * | Header 1 | Header 2 |
 * |----------|----------|
 * | Cell 1   | Cell 2   |
 * ```
 */
function parseMarkdownTable(markdown) {
	try {
		// Split into lines and remove empty lines
		var lines = markdown
			.trim()
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
		if (lines.length < 2) {
			return {
				success: false,
				error: "Table must have at least a header row and separator row",
			}
		}
		// Parse header row
		var headerLine = lines[0]
		if (
			!headerLine ||
			!headerLine.startsWith("|") ||
			!headerLine.endsWith("|")
		) {
			return {
				success: false,
				error: "Table rows must start and end with |",
			}
		}
		var headerCells = headerLine
			.split("|")
			.slice(1, -1) // Remove first and last empty strings
			.map((cell) => cell.trim())
		if (headerCells.length === 0) {
			return {
				success: false,
				error: "Header row must have at least one column",
			}
		}
		// Check separator row
		var separatorLine = lines[1]
		if (
			!separatorLine ||
			(!separatorLine.includes("---") && !separatorLine.includes("-"))
		) {
			return {
				success: false,
				error: "Second row must be a separator (e.g., |---|---|)",
			}
		}
		// Parse body rows
		var bodyLines = lines.slice(2)
		var numCols = headerCells.length
		// Validate all rows have same number of columns
		for (var i = 0; i < bodyLines.length; i++) {
			var line = bodyLines[i]
			if (!line) continue
			var cells = line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim())
			if (cells.length !== numCols) {
				return {
					success: false,
					error: "Row "
						.concat(i + 3, " has ")
						.concat(cells.length, " columns, expected ")
						.concat(numCols),
				}
			}
		}
		var timestamp_1 = Date.now()
		// Create header cells
		var headerCellNodes = headerCells.map((content, idx) => ({
			id: "th-".concat(timestamp_1, "-").concat(idx),
			type: "th",
			content: content || "",
			attributes: {},
		}))
		// Create header row
		var headerRow = {
			id: "tr-header-".concat(timestamp_1),
			type: "tr",
			children: headerCellNodes,
			attributes: {},
		}
		// Create thead
		var thead = {
			id: "thead-".concat(timestamp_1),
			type: "thead",
			children: [headerRow],
			attributes: {},
		}
		// Create body rows
		var bodyRows = bodyLines.map((line, rowIdx) => {
			var cells = line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim())
			var cellNodes = cells.map((content, colIdx) => ({
				id: "td-".concat(timestamp_1, "-").concat(rowIdx, "-").concat(colIdx),
				type: "td",
				content: content || "",
				attributes: {},
			}))
			return {
				id: "tr-".concat(timestamp_1, "-").concat(rowIdx),
				type: "tr",
				children: cellNodes,
				attributes: {},
			}
		})
		// Create tbody
		var tbody = {
			id: "tbody-".concat(timestamp_1),
			type: "tbody",
			children: bodyRows,
			attributes: {},
		}
		// Create table
		var table = {
			id: "table-".concat(timestamp_1),
			type: "table",
			children: [thead, tbody],
			attributes: {},
		}
		return {
			success: true,
			table: table,
		}
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to parse markdown table",
		}
	}
}
exports.parseMarkdownTable = parseMarkdownTable
/**
 * Validate if string looks like a markdown table
 */
function isMarkdownTable(text) {
	var lines = text
		.trim()
		.split("\n")
		.filter((line) => line.trim().length > 0)
	if (lines.length < 2) return false
	// Check if first line has pipes
	var firstLine = lines[0]
	if (!firstLine || !firstLine.includes("|")) return false
	// Check if second line is separator
	var secondLine = lines[1]
	if (!secondLine) return false
	return (
		secondLine.includes("---") ||
		(secondLine.includes("-") && secondLine.includes("|"))
	)
}
exports.isMarkdownTable = isMarkdownTable

"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.getFormattingAtPosition = exports.removeFormatting = exports.mergeAdjacentTextNodes = exports.applyFormatting = exports.convertToInlineFormat = exports.splitTextAtSelection = void 0;
var types_1 = require("../types");
/**
 * Split a text node into inline segments based on selection range
 *
 * @param node - The node to split
 * @param startOffset - Start offset of selection
 * @param endOffset - End offset of selection
 * @returns Array of text segments: [before, selected, after]
 *
 * @example
 * ```typescript
 * const node = { id: 'p-1', type: 'p', content: 'Hello world' };
 * const [before, selected, after] = splitTextNode(node, 6, 11);
 * // before: 'Hello ', selected: 'world', after: ''
 * ```
 */
function splitTextAtSelection(content, startOffset, endOffset) {
    return {
        before: content.substring(0, startOffset),
        selected: content.substring(startOffset, endOffset),
        after: content.substring(endOffset)
    };
}
exports.splitTextAtSelection = splitTextAtSelection;
/**
 * Convert a simple text node to inline children format
 *
 * @param node - The simple text node
 * @returns Node with inline children
 */
function convertToInlineFormat(node) {
    if ((0, types_1.hasInlineChildren)(node)) {
        return node; // Already in inline format
    }
    var content = node.content || "";
    return __assign(__assign({}, node), { content: undefined, children: [
            {
                content: content
            },
        ] });
}
exports.convertToInlineFormat = convertToInlineFormat;
/**
 * Apply formatting to a selection within a node
 *
 * @param node - The node to format
 * @param startOffset - Start offset of selection (in text content)
 * @param endOffset - End offset of selection (in text content)
 * @param className - Tailwind classes to apply
 * @returns New node with formatting applied
 */
function applyFormatting(node, startOffset, endOffset, className) {
    // Convert to inline format if needed
    var inlineNode = convertToInlineFormat(node);
    var fullText = (0, types_1.getNodeTextContent)(inlineNode);
    // Split the text
    var _a = splitTextAtSelection(fullText, startOffset, endOffset), before = _a.before, selected = _a.selected, after = _a.after;
    // Build new children array
    var newChildren = [];
    // Add "before" text if it exists
    if (before) {
        newChildren.push({
            content: before
        });
    }
    // Add formatted selection as a span
    if (selected) {
        newChildren.push({
            content: selected,
            bold: className.includes("font-bold"),
            italic: className.includes("italic"),
            underline: className.includes("underline")
        });
    }
    // Add "after" text if it exists
    if (after) {
        newChildren.push({
            content: after
        });
    }
    return __assign(__assign({}, inlineNode), { children: newChildren });
}
exports.applyFormatting = applyFormatting;
/**
 * Merge adjacent text nodes with the same formatting
 *
 * @param children - Array of inline text nodes
 * @returns Merged array
 */
function mergeAdjacentTextNodes(children) {
    var _a, _b;
    if (children.length <= 1)
        return children;
    var merged = [];
    var current = children[0];
    if (!current)
        return children;
    for (var i = 1; i < children.length; i++) {
        var next = children[i];
        if (!next)
            continue;
        // Check if both are plain text nodes (not spans) with same attributes
        if (current.type === "text" &&
            next.type === "text" &&
            ((_a = current.attributes) === null || _a === void 0 ? void 0 : _a.className) === ((_b = next.attributes) === null || _b === void 0 ? void 0 : _b.className)) {
            // Merge them
            current = __assign(__assign({}, current), { content: (current.content || "") + (next.content || "") });
        }
        else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}
exports.mergeAdjacentTextNodes = mergeAdjacentTextNodes;
/**
 * Remove formatting from a selection
 *
 * @param node - The node with inline formatting
 * @param startOffset - Start offset of selection
 * @param endOffset - End offset of selection
 * @param className - Class name to remove
 * @returns New node with formatting removed
 */
function removeFormatting(node, startOffset, endOffset, className) {
    if (!(0, types_1.hasInlineChildren)(node)) {
        return node; // Nothing to remove
    }
    // This is more complex - we need to traverse inline children
    // and split spans that intersect with the selection
    // For now, simplified implementation
    return node;
}
exports.removeFormatting = removeFormatting;
/**
 * Get the formatting at a specific cursor position
 *
 * @param node - The node to check
 * @param offset - Cursor position
 * @returns Array of class names at that position
 */
function getFormattingAtPosition(node, offset) {
    var _a;
    if (!(0, types_1.hasInlineChildren)(node)) {
        return ((_a = node.attributes) === null || _a === void 0 ? void 0 : _a.className)
            ? [String(node.attributes.className)]
            : [];
    }
    var currentOffset = 0;
    for (var _i = 0, _b = node.children; _i < _b.length; _i++) {
        var child = _b[_i];
        var childLength = (child.content || "").length;
        if (offset >= currentOffset && offset <= currentOffset + childLength) {
            var classes = [];
            if (child.bold)
                classes.push("font-bold");
            if (child.italic)
                classes.push("italic");
            if (child.underline)
                classes.push("underline");
            return classes;
        }
        currentOffset += childLength;
    }
    return [];
}
exports.getFormattingAtPosition = getFormattingAtPosition;

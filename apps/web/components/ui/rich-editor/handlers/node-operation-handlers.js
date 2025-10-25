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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.createHandleCopyJson = exports.createHandleCopyHtml = exports.createHandleCreateTable = exports.createHandleCreateLink = exports.createHandleCreateListFromCommand = exports.createHandleCreateList = exports.createHandleInsertImageFromCommand = exports.createHandleChangeBlockType = exports.createHandleCreateNested = exports.createHandleAddBlock = exports.createHandleDeleteNode = exports.createHandleNodeClick = void 0;
var actions_1 = require("../reducer/actions");
var types_1 = require("../types");
var editor_helpers_1 = require("../utils/editor-helpers");
/**
 * Handle node click
 */
function createHandleNodeClick(params) {
    return function (nodeId) {
        var container = params.container, dispatch = params.dispatch;
        // Don't set container nodes as active - they're not focusable
        // Only text nodes and image nodes can be focused
        var result = (0, editor_helpers_1.findNodeInTree)(nodeId, container);
        if (result && (0, types_1.isContainerNode)(result.node)) {
            // For container nodes, don't set as active
            // The child blocks will handle their own clicks
            return;
        }
        dispatch(actions_1.EditorActions.setActiveNode(nodeId));
    };
}
exports.createHandleNodeClick = createHandleNodeClick;
/**
 * Handle delete node
 */
function createHandleDeleteNode(params) {
    return function (nodeId) {
        var container = params.container, dispatch = params.dispatch, toast = params.toast;
        // Check if the node is inside a flex container
        var parentContainer = container.children.find(function (child) {
            return (0, types_1.isContainerNode)(child) &&
                child.children.some(function (c) { return c.id === nodeId; });
        });
        if (parentContainer) {
            var containerNode = parentContainer;
            var remainingChildren = containerNode.children.filter(function (c) { return c.id !== nodeId; });
            // If only one child left, unwrap it from the container
            if (remainingChildren.length === 1) {
                // Batch: delete container and insert remaining child (single history entry)
                var containerIndex = container.children.findIndex(function (c) { return c.id === parentContainer.id; });
                var actions = [actions_1.EditorActions.deleteNode(parentContainer.id)];
                var remainingChild = remainingChildren[0];
                if (!remainingChild)
                    return;
                if (containerIndex > 0) {
                    var prevNode = container.children[containerIndex - 1];
                    if (prevNode) {
                        actions.push(actions_1.EditorActions.insertNode(remainingChild, prevNode.id, "after"));
                    }
                }
                else if (containerIndex === 0 && container.children.length > 1) {
                    var nextNode = container.children[1];
                    if (nextNode) {
                        actions.push(actions_1.EditorActions.insertNode(remainingChild, nextNode.id, "before"));
                    }
                }
                dispatch(actions_1.EditorActions.batch(actions));
            }
            else if (remainingChildren.length === 0) {
                // No children left, delete the container
                dispatch(actions_1.EditorActions.deleteNode(parentContainer.id));
            }
            else {
                // Multiple children remain, just remove this one
                dispatch(actions_1.EditorActions.deleteNode(nodeId));
            }
        }
        else {
            dispatch(actions_1.EditorActions.deleteNode(nodeId));
        }
        toast({
            title: "Image removed",
            description: "The image has been deleted."
        });
    };
}
exports.createHandleDeleteNode = createHandleDeleteNode;
/**
 * Handle add block
 */
function createHandleAddBlock(params) {
    return function (targetId, position) {
        if (position === void 0) { position = "after"; }
        var dispatch = params.dispatch, nodeRefs = params.nodeRefs;
        // Create new paragraph node
        var newNode = {
            id: "p-" + Date.now(),
            type: "p",
            content: "",
            attributes: {}
        };
        dispatch(actions_1.EditorActions.insertNode(newNode, targetId, position));
        dispatch(actions_1.EditorActions.setActiveNode(newNode.id));
        // Focus the new node after a brief delay
        setTimeout(function () {
            var newElement = nodeRefs.current.get(newNode.id);
            if (newElement) {
                newElement.focus();
            }
        }, 50);
    };
}
exports.createHandleAddBlock = createHandleAddBlock;
/**
 * Handle create nested block
 */
function createHandleCreateNested(params) {
    return function (nodeId) {
        var container = params.container, dispatch = params.dispatch, toast = params.toast;
        var result = (0, editor_helpers_1.findNodeInTree)(nodeId, container);
        if (!result)
            return;
        var node = result.node, parentId = result.parentId;
        // If the node is inside a nested container (not root), we need to handle it differently
        // We only allow 1 level of nesting, so if we're already nested, add to the parent container
        var isAlreadyNested = parentId !== container.id;
        if (isAlreadyNested) {
            // We're inside a nested container, so just add a new paragraph to the parent container
            var newParagraph_1 = {
                id: "p-" + Date.now(),
                type: "p",
                content: "",
                attributes: {}
            };
            // Insert after the current node within the parent container
            dispatch(actions_1.EditorActions.insertNode(newParagraph_1, nodeId, "after"));
            dispatch(actions_1.EditorActions.setActiveNode(newParagraph_1.id));
            // Focus is handled by the useEffect watching state.activeNodeId
            return;
        }
        // Node is at root level, create a nested container
        if (!(0, types_1.isTextNode)(node))
            return;
        var textNode = node;
        // Create the new paragraph that will be focused
        var newParagraphId = "p-" + Date.now();
        var newParagraph = {
            id: newParagraphId,
            type: "p",
            content: "",
            attributes: {}
        };
        // Create a nested container with the current node inside it
        var nestedContainer = {
            id: "container-" + Date.now(),
            type: "container",
            children: [
                __assign({}, textNode),
                // Add a new empty paragraph inside the nested container
                newParagraph,
            ],
            attributes: {}
        };
        // Delete the original node
        dispatch(actions_1.EditorActions.deleteNode(nodeId));
        // Insert the nested container in its place
        // Since we deleted the node, we insert after the previous node or prepend to container
        var nodeIndex = container.children.findIndex(function (n) { return n.id === nodeId; });
        if (nodeIndex > 0) {
            var previousNode = container.children[nodeIndex - 1];
            if (previousNode) {
                dispatch(actions_1.EditorActions.insertNode(nestedContainer, previousNode.id, "after"));
            }
        }
        else {
            dispatch(actions_1.EditorActions.insertNode(nestedContainer, container.id, "prepend"));
        }
        // Set the new paragraph as active
        dispatch(actions_1.EditorActions.setActiveNode(newParagraphId));
        toast({
            title: "Nested block created",
            description: "Press Shift+Enter again to add more blocks in this container"
        });
        // Focus is handled by the useEffect watching state.activeNodeId
    };
}
exports.createHandleCreateNested = createHandleCreateNested;
/**
 * Handle change block type
 */
function createHandleChangeBlockType(params) {
    return function (nodeId, newType) {
        var dispatch = params.dispatch, nodeRefs = params.nodeRefs;
        // Special handling for list items - initialize with empty content
        if (newType === "li") {
            dispatch(actions_1.EditorActions.updateNode(nodeId, {
                type: newType,
                content: ""
            }));
        }
        else {
            dispatch(actions_1.EditorActions.updateNode(nodeId, { type: newType }));
        }
        // Focus the updated node after a brief delay
        setTimeout(function () {
            var element = nodeRefs.current.get(nodeId);
            if (element) {
                element.focus();
            }
        }, 50);
    };
}
exports.createHandleChangeBlockType = createHandleChangeBlockType;
/**
 * Handle insert image from command
 */
function createHandleInsertImageFromCommand(params, fileInputRef) {
    return function (nodeId) {
        var dispatch = params.dispatch;
        // Delete the current empty block
        dispatch(actions_1.EditorActions.deleteNode(nodeId));
        // Trigger the file input
        setTimeout(function () {
            var _a;
            (_a = fileInputRef.current) === null || _a === void 0 ? void 0 : _a.click();
        }, 100);
    };
}
exports.createHandleInsertImageFromCommand = createHandleInsertImageFromCommand;
/**
 * Handle create list
 */
function createHandleCreateList(params) {
    return function (listType) {
        var container = params.container, dispatch = params.dispatch, toast = params.toast, editorContentRef = params.editorContentRef;
        var timestamp = Date.now();
        // Create a container with a header and 1 nested item
        var listContainer = {
            id: "container-".concat(timestamp),
            type: "container",
            children: [
                {
                    id: "h3-".concat(timestamp),
                    type: "h3",
                    content: "List Title",
                    attributes: {}
                },
                {
                    id: "li-".concat(timestamp, "-1"),
                    type: "li",
                    content: "First item",
                    attributes: {}
                },
            ],
            attributes: {
                listType: listType
            }
        };
        // Insert the list container at the end
        var lastNode = container.children[container.children.length - 1];
        if (lastNode) {
            dispatch(actions_1.EditorActions.insertNode(listContainer, lastNode.id, "after"));
        }
        else {
            // If no nodes exist, replace the container
            dispatch(actions_1.EditorActions.replaceContainer(__assign(__assign({}, container), { children: [listContainer] })));
        }
        var listTypeLabel = listType === "ol" ? "ordered" : "unordered";
        toast({
            title: "List Created",
            description: "Added a new ".concat(listTypeLabel, " list with header and 3 items")
        });
        // Smooth scroll to the newly created list
        setTimeout(function () {
            var _a;
            // Find the last element in the editor (the newly created list container)
            var editorContent = editorContentRef.current;
            if (editorContent) {
                var lastChild = (_a = editorContent.querySelector("[data-editor-content]")) === null || _a === void 0 ? void 0 : _a.lastElementChild;
                if (lastChild) {
                    lastChild.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                        inline: "nearest"
                    });
                }
            }
        }, 150);
    };
}
exports.createHandleCreateList = createHandleCreateList;
/**
 * Handle create list from command menu
 */
function createHandleCreateListFromCommand(params) {
    return function (nodeId, listType) {
        var dispatch = params.dispatch, toast = params.toast, nodeRefs = params.nodeRefs;
        var timestamp = Date.now();
        var firstItemId = "li-".concat(timestamp, "-1");
        // Create a container with 1 list item (always "li", regardless of ul/ol)
        // The container's attributes will store whether it's ul or ol
        var listContainer = {
            id: "container-".concat(timestamp),
            type: "container",
            attributes: {
                listType: listType
            },
            children: [
                {
                    id: firstItemId,
                    type: "li",
                    content: "",
                    attributes: {}
                },
            ]
        };
        // Insert the list container after the current node, then delete the current node
        dispatch(actions_1.EditorActions.insertNode(listContainer, nodeId, "after"));
        dispatch(actions_1.EditorActions.deleteNode(nodeId));
        var listTypeLabel = listType === "ol" ? "numbered" : "bulleted";
        toast({
            title: "List Created",
            description: "Created a ".concat(listTypeLabel, " list with 3 items")
        });
        // Focus the first item after a longer delay to ensure nested elements are registered
        // Nested elements take longer to mount and register their refs
        setTimeout(function () {
            var element = nodeRefs.current.get(firstItemId);
            if (element) {
                element.focus();
                // Also set it as active node
                dispatch(actions_1.EditorActions.setActiveNode(firstItemId));
            }
            else {
                // Retry after another delay
                setTimeout(function () {
                    var retryElement = nodeRefs.current.get(firstItemId);
                    if (retryElement) {
                        retryElement.focus();
                        dispatch(actions_1.EditorActions.setActiveNode(firstItemId));
                    }
                }, 100);
            }
        }, 150);
    };
}
exports.createHandleCreateListFromCommand = createHandleCreateListFromCommand;
/**
 * Handle create link
 */
function createHandleCreateLink(params) {
    return function () {
        var container = params.container, dispatch = params.dispatch, toast = params.toast, editorContentRef = params.editorContentRef;
        var timestamp = Date.now();
        // Create a paragraph with a link
        var linkNode = {
            id: "p-".concat(timestamp),
            type: "p",
            children: [
                {
                    content: "www.text.com",
                    href: "https://www.text.com"
                },
            ],
            attributes: {}
        };
        // Insert the link node at the end
        var lastNode = container.children[container.children.length - 1];
        if (lastNode) {
            dispatch(actions_1.EditorActions.insertNode(linkNode, lastNode.id, "after"));
        }
        else {
            // If no nodes exist, replace the container
            dispatch(actions_1.EditorActions.replaceContainer(__assign(__assign({}, container), { children: [linkNode] })));
        }
        toast({
            title: "Link Created",
            description: "Added a new link element"
        });
        // Smooth scroll to the newly created link
        setTimeout(function () {
            var _a;
            var editorContent = editorContentRef.current;
            if (editorContent) {
                var lastChild = (_a = editorContent.querySelector("[data-editor-content]")) === null || _a === void 0 ? void 0 : _a.lastElementChild;
                if (lastChild) {
                    lastChild.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                        inline: "nearest"
                    });
                }
            }
        }, 150);
    };
}
exports.createHandleCreateLink = createHandleCreateLink;
/**
 * Handle create table
 */
function createHandleCreateTable(params) {
    return function (rows, cols) {
        var container = params.container, dispatch = params.dispatch, toast = params.toast, editorContentRef = params.editorContentRef;
        var timestamp = Date.now();
        // Create header cells
        var headerCells = Array.from({ length: cols }, function (_, i) { return ({
            id: "th-".concat(timestamp, "-").concat(i),
            type: "th",
            content: "Column ".concat(i + 1),
            attributes: {}
        }); });
        // Create header row
        var headerRow = {
            id: "tr-header-".concat(timestamp),
            type: "tr",
            children: headerCells,
            attributes: {}
        };
        // Create thead
        var thead = {
            id: "thead-".concat(timestamp),
            type: "thead",
            children: [headerRow],
            attributes: {}
        };
        // Create body rows
        var bodyRows = Array.from({ length: rows }, function (_, rowIdx) {
            var cells = Array.from({ length: cols }, function (_, colIdx) { return ({
                id: "td-".concat(timestamp, "-").concat(rowIdx, "-").concat(colIdx),
                type: "td",
                content: "",
                attributes: {}
            }); });
            return {
                id: "tr-".concat(timestamp, "-").concat(rowIdx),
                type: "tr",
                children: cells,
                attributes: {}
            };
        });
        // Create tbody
        var tbody = {
            id: "tbody-".concat(timestamp),
            type: "tbody",
            children: bodyRows,
            attributes: {}
        };
        // Create table
        var table = {
            id: "table-".concat(timestamp),
            type: "table",
            children: [thead, tbody],
            attributes: {}
        };
        // Wrap table in a container for consistent handling
        var tableWrapper = {
            id: "table-wrapper-".concat(timestamp),
            type: "container",
            children: [table],
            attributes: {}
        };
        // Insert the table at the end
        var lastNode = container.children[container.children.length - 1];
        if (lastNode) {
            dispatch(actions_1.EditorActions.insertNode(tableWrapper, lastNode.id, "after"));
        }
        else {
            // If no nodes exist, replace the container
            dispatch(actions_1.EditorActions.replaceContainer(__assign(__assign({}, container), { children: [tableWrapper] })));
        }
        toast({
            title: "Table Created",
            description: "Added a ".concat(rows, "\u00D7").concat(cols, " table")
        });
        // Smooth scroll to the newly created table
        setTimeout(function () {
            var _a;
            var editorContent = editorContentRef.current;
            if (editorContent) {
                var lastChild = (_a = editorContent.querySelector("[data-editor-content]")) === null || _a === void 0 ? void 0 : _a.lastElementChild;
                if (lastChild) {
                    lastChild.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                        inline: "nearest"
                    });
                }
            }
        }, 150);
    };
}
exports.createHandleCreateTable = createHandleCreateTable;
/**
 * Handle copy HTML
 */
function createHandleCopyHtml(params, enhanceSpaces, setCopiedHtml) {
    var _this = this;
    return function (container) { return __awaiter(_this, void 0, void 0, function () {
        var toast, serializeToHtml, html, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    toast = params.toast;
                    serializeToHtml = require("../utils/serialize-to-html").serializeToHtml;
                    html = serializeToHtml(container);
                    // Wrap with spacing classes if enhance spaces is enabled
                    if (enhanceSpaces) {
                        html = "<div class=\"[&>*]:my-3 [&_*]:my-5\">\n".concat(html, "\n</div>");
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, navigator.clipboard.writeText(html)];
                case 2:
                    _a.sent();
                    setCopiedHtml(true);
                    toast({
                        title: "HTML copied!",
                        description: "HTML code has been copied to clipboard."
                    });
                    setTimeout(function () { return setCopiedHtml(false); }, 2000);
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    toast({
                        variant: "destructive",
                        title: "Copy failed",
                        description: "Failed to copy HTML to clipboard."
                    });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
}
exports.createHandleCopyHtml = createHandleCopyHtml;
/**
 * Handle copy JSON
 */
function createHandleCopyJson(params, setCopiedJson) {
    var _this = this;
    return function (container) { return __awaiter(_this, void 0, void 0, function () {
        var toast, json, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    toast = params.toast;
                    json = JSON.stringify(container.children, null, 2);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, navigator.clipboard.writeText(json)];
                case 2:
                    _a.sent();
                    setCopiedJson(true);
                    toast({
                        title: "JSON copied!",
                        description: "JSON data has been copied to clipboard."
                    });
                    setTimeout(function () { return setCopiedJson(false); }, 2000);
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    toast({
                        variant: "destructive",
                        title: "Copy failed",
                        description: "Failed to copy JSON to clipboard."
                    });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
}
exports.createHandleCopyJson = createHandleCopyJson;

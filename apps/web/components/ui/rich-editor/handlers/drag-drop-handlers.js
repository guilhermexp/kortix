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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.createHandleDrop = exports.createHandleDragLeave = exports.createHandleDragOver = exports.createHandleDragEnter = exports.createHandleBlockDragStart = exports.createHandleImageDragStart = void 0;
var actions_1 = require("../reducer/actions");
var types_1 = require("../types");
var editor_helpers_1 = require("../utils/editor-helpers");
var image_upload_1 = require("../utils/image-upload");
/**
 * Handle image drag start
 */
function createHandleImageDragStart(setDraggingNodeId) {
    return function (nodeId) {
        setDraggingNodeId(nodeId);
    };
}
exports.createHandleImageDragStart = createHandleImageDragStart;
/**
 * Handle block drag start
 */
function createHandleBlockDragStart(setDraggingNodeId) {
    return function (nodeId) {
        setDraggingNodeId(nodeId);
    };
}
exports.createHandleBlockDragStart = createHandleBlockDragStart;
/**
 * Handle drag enter
 */
function createHandleDragEnter() {
    return function (e, nodeId) {
        e.preventDefault();
        e.stopPropagation();
    };
}
exports.createHandleDragEnter = createHandleDragEnter;
/**
 * Handle drag over
 */
function createHandleDragOver(params) {
    return function (e, nodeId) {
        var container = params.container, draggingNodeId = params.draggingNodeId, setDragOverNodeId = params.setDragOverNodeId, setDropPosition = params.setDropPosition;
        e.preventDefault();
        e.stopPropagation();
        // Check if we're dragging an existing block (image) or files from outside
        var draggedNodeId = e.dataTransfer.getData("text/plain");
        // Don't show drop indicator if we're hovering over the dragged element itself
        if (draggingNodeId === nodeId) {
            e.dataTransfer.dropEffect = "none";
            setDragOverNodeId(null);
            setDropPosition(null);
            return;
        }
        var targetResult = (0, editor_helpers_1.findNodeAnywhere)(nodeId, container);
        var draggingResult = draggingNodeId
            ? (0, editor_helpers_1.findNodeAnywhere)(draggingNodeId, container)
            : null;
        if (!targetResult)
            return;
        var targetNode = targetResult.node;
        var draggingNode = draggingResult === null || draggingResult === void 0 ? void 0 : draggingResult.node;
        var isTargetImage = (0, types_1.isTextNode)(targetNode) && targetNode.type === "img";
        var isDraggingImage = draggingNode &&
            (0, types_1.isTextNode)(draggingNode) &&
            draggingNode.type === "img";
        // Check if target and dragging nodes are in the same flex container
        var inSameFlexContainer = targetResult.parentId &&
            (draggingResult === null || draggingResult === void 0 ? void 0 : draggingResult.parentId) &&
            targetResult.parentId === draggingResult.parentId;
        var rect = e.currentTarget.getBoundingClientRect();
        // If both are images, check for horizontal (left/right) drop zones
        if (isTargetImage && isDraggingImage) {
            var edgeThreshold = rect.width * 0.3; // 30% from each edge
            // If in same flex container, allow reordering via horizontal drop
            if (inSameFlexContainer) {
                // Get the parent container to check positions
                var parent_1 = (draggingResult === null || draggingResult === void 0 ? void 0 : draggingResult.parentId)
                    ? container.children.find(function (c) { return c.id === draggingResult.parentId; })
                    : null;
                if (parent_1) {
                    var dragIndex = parent_1.children.findIndex(function (c) { return c.id === draggingNodeId; });
                    var targetIndex = parent_1.children.findIndex(function (c) { return c.id === nodeId; });
                    // Check if we're on the left edge
                    if (e.clientX < rect.left + edgeThreshold) {
                        // Prevent dropping to the left of the item immediately to our right
                        if (targetIndex === dragIndex + 1) {
                            e.dataTransfer.dropEffect = "none";
                            setDragOverNodeId(null);
                            setDropPosition(null);
                            return;
                        }
                        setDragOverNodeId(nodeId);
                        setDropPosition("left");
                        e.dataTransfer.dropEffect = "move";
                        return;
                    }
                    // Check if we're on the right edge
                    else if (e.clientX > rect.right - edgeThreshold) {
                        // Prevent dropping to the right of the item immediately to our left
                        if (targetIndex === dragIndex - 1) {
                            e.dataTransfer.dropEffect = "none";
                            setDragOverNodeId(null);
                            setDropPosition(null);
                            return;
                        }
                        setDragOverNodeId(nodeId);
                        setDropPosition("right");
                        e.dataTransfer.dropEffect = "move";
                        return;
                    }
                }
                // If we're in the middle of an item in the same flex container, no drop
                e.dataTransfer.dropEffect = "none";
                setDragOverNodeId(null);
                setDropPosition(null);
                return;
            }
            else {
                // Not in same container - allow horizontal merge
                if (e.clientX < rect.left + edgeThreshold) {
                    setDragOverNodeId(nodeId);
                    setDropPosition("left");
                    e.dataTransfer.dropEffect = "move";
                    return;
                }
                else if (e.clientX > rect.right - edgeThreshold) {
                    setDragOverNodeId(nodeId);
                    setDropPosition("right");
                    e.dataTransfer.dropEffect = "move";
                    return;
                }
            }
        }
        // Default vertical drop logic
        var midPoint = rect.top + rect.height / 2;
        var position = e.clientY < midPoint ? "before" : "after";
        // If dragging an existing block, check if this would result in no movement
        if (draggingNodeId) {
            // Find the indices of the dragged node and target node
            var draggedIndex = container.children.findIndex(function (n) { return n.id === draggingNodeId; });
            var targetIndex = container.children.findIndex(function (n) { return n.id === nodeId; });
            // Don't allow drops that would result in no movement:
            // - Dropping "after" on the previous block (would stay in same position)
            // - Dropping "before" on the next block (would stay in same position)
            if ((position === "after" && targetIndex === draggedIndex - 1) ||
                (position === "before" && targetIndex === draggedIndex + 1)) {
                e.dataTransfer.dropEffect = "none";
                setDragOverNodeId(null);
                setDropPosition(null);
                return;
            }
        }
        // Allow drop - this is required for drop to work
        // Use "move" for existing blocks, "copy" for external files
        e.dataTransfer.dropEffect =
            draggedNodeId || draggingNodeId ? "move" : "copy";
        setDragOverNodeId(nodeId);
        setDropPosition(position);
    };
}
exports.createHandleDragOver = createHandleDragOver;
/**
 * Handle drag leave
 */
function createHandleDragLeave(setDragOverNodeId, setDropPosition) {
    return function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Only clear if we're actually leaving the element (not entering a child)
        var relatedTarget = e.relatedTarget;
        var currentTarget = e.currentTarget;
        if (!currentTarget.contains(relatedTarget)) {
            setDragOverNodeId(null);
            setDropPosition(null);
        }
    };
}
exports.createHandleDragLeave = createHandleDragLeave;
/**
 * Handle drop - This is a complex function that handles multiple drop scenarios
 * Note: This function should be further broken down in the future
 */
function createHandleDrop(params, dropPosition) {
    var _this = this;
    return function (e, nodeId) { return __awaiter(_this, void 0, void 0, function () {
        var container, dispatch, toast, draggingNodeId, setDraggingNodeId, setDragOverNodeId, setDropPosition, setIsUploading, onUploadImage, draggedNodeId, draggingResult, targetResult, draggingNode, targetNode, inSameFlexContainer, parent_2, newChildren, dragIndex, targetIndex, draggedItem, adjustedTargetIndex, parent_3, targetIndex, newChildren, targetRootIndex, draggingRootIndex, referenceNodeId, insertPosition, firstIndex, refNode, i, childNode, timestamp, flexContainer, actions, parent_4, remainingChildren, insertPos, actions, parentIndex, isTargetTheFlexContainer, referenceNodeId, referencePosition, prevNode, nextNode, remainingChild, fallbackChild, targetIndex, isTargetBeforeFlex, isTargetAfterFlex, adjacentChild, standardChild, prevNode, nextNode, draggingNodeAtRoot, targetNodeAtRoot, isDraggingImage, isTargetImage, insertPos, files, items, mediaFile, isVideo, mediaUrl, result, mediaNode, insertPos, error_1;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    container = params.container, dispatch = params.dispatch, toast = params.toast, draggingNodeId = params.draggingNodeId, setDraggingNodeId = params.setDraggingNodeId, setDragOverNodeId = params.setDragOverNodeId, setDropPosition = params.setDropPosition, setIsUploading = params.setIsUploading, onUploadImage = params.onUploadImage;
                    e.preventDefault();
                    e.stopPropagation();
                    draggedNodeId = e.dataTransfer.getData("text/plain");
                    if (draggedNodeId && draggingNodeId) {
                        // Moving an existing image
                        // Don't drop on itself
                        if (draggingNodeId === nodeId) {
                            setDragOverNodeId(null);
                            setDropPosition(null);
                            setDraggingNodeId(null);
                            return [2 /*return*/];
                        }
                        draggingResult = (0, editor_helpers_1.findNodeAnywhere)(draggingNodeId, container);
                        targetResult = (0, editor_helpers_1.findNodeAnywhere)(nodeId, container);
                        if (!draggingResult || !targetResult) {
                            setDragOverNodeId(null);
                            setDropPosition(null);
                            setDraggingNodeId(null);
                            return [2 /*return*/];
                        }
                        draggingNode = draggingResult.node;
                        targetNode = targetResult.node;
                        inSameFlexContainer = draggingResult.parentId &&
                            targetResult.parentId &&
                            draggingResult.parentId === targetResult.parentId;
                        // Check if this is a horizontal drop (left/right)
                        if (dropPosition === "left" || dropPosition === "right") {
                            // Case 1: Reordering images within the same flex container
                            if (inSameFlexContainer &&
                                draggingResult.parent &&
                                targetResult.parent) {
                                parent_2 = draggingResult.parent;
                                newChildren = __spreadArray([], parent_2.children, true);
                                dragIndex = newChildren.findIndex(function (c) { return c.id === draggingNodeId; });
                                targetIndex = newChildren.findIndex(function (c) { return c.id === nodeId; });
                                draggedItem = newChildren.splice(dragIndex, 1)[0];
                                // Only proceed if draggedItem exists
                                if (!draggedItem)
                                    return [2 /*return*/];
                                adjustedTargetIndex = dragIndex < targetIndex ? targetIndex - 1 : targetIndex;
                                // Insert at the correct position based on drop side
                                if (dropPosition === "left") {
                                    newChildren.splice(adjustedTargetIndex, 0, draggedItem);
                                }
                                else {
                                    // "right"
                                    newChildren.splice(adjustedTargetIndex + 1, 0, draggedItem);
                                }
                                // Update the container with new order (single action for history)
                                dispatch(actions_1.EditorActions.updateNode(parent_2.id, {
                                    children: newChildren
                                }));
                                toast({
                                    title: "Image repositioned!",
                                    description: "Image order updated in flex layout"
                                });
                                setDragOverNodeId(null);
                                setDropPosition(null);
                                setDraggingNodeId(null);
                                return [2 /*return*/];
                            }
                            // Case 2: Merging two separate images into a flex container (or adding to existing one)
                            if ((0, types_1.isTextNode)(draggingNode) && (0, types_1.isTextNode)(targetNode)) {
                                // If one of them is already in a flex container, add the dragged one to it
                                if (draggingResult.parentId &&
                                    ((_b = (_a = draggingResult.parent) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.layoutType) === "flex") {
                                    // Dragging node is in a flex container, extract it and merge with target
                                }
                                else if (targetResult.parentId &&
                                    ((_d = (_c = targetResult.parent) === null || _c === void 0 ? void 0 : _c.attributes) === null || _d === void 0 ? void 0 : _d.layoutType) === "flex") {
                                    parent_3 = targetResult.parent;
                                    targetIndex = parent_3.children.findIndex(function (c) { return c.id === nodeId; });
                                    newChildren = __spreadArray([], parent_3.children, true);
                                    // Insert dragged node at the appropriate position
                                    if (dropPosition === "left") {
                                        newChildren.splice(targetIndex, 0, draggingNode);
                                    }
                                    else {
                                        newChildren.splice(targetIndex + 1, 0, draggingNode);
                                    }
                                    // Batch: delete from old location and update container (single history entry)
                                    dispatch(actions_1.EditorActions.batch([
                                        actions_1.EditorActions.deleteNode(draggingNodeId),
                                        actions_1.EditorActions.updateNode(parent_3.id, {
                                            children: newChildren
                                        }),
                                    ]));
                                    toast({
                                        title: "Image added!",
                                        description: "Image added to the flex layout"
                                    });
                                    setDragOverNodeId(null);
                                    setDropPosition(null);
                                    setDraggingNodeId(null);
                                    return [2 /*return*/];
                                }
                                targetRootIndex = container.children.findIndex(function (n) {
                                    return n.id === nodeId ||
                                        ((0, types_1.isContainerNode)(n) &&
                                            n.children.some(function (c) { return c.id === nodeId; }));
                                });
                                draggingRootIndex = container.children.findIndex(function (n) {
                                    return n.id === draggingNodeId ||
                                        ((0, types_1.isContainerNode)(n) &&
                                            n.children.some(function (c) { return c.id === draggingNodeId; }));
                                });
                                referenceNodeId = null;
                                insertPosition = "after";
                                firstIndex = Math.min(targetRootIndex, draggingRootIndex);
                                if (firstIndex > 0) {
                                    refNode = container.children[firstIndex - 1];
                                    if (refNode) {
                                        referenceNodeId = refNode.id;
                                        insertPosition = "after";
                                    }
                                }
                                else if (container.children.length > 2) {
                                    for (i = 0; i < container.children.length; i++) {
                                        if (i !== targetRootIndex && i !== draggingRootIndex) {
                                            childNode = container.children[i];
                                            if (childNode) {
                                                referenceNodeId = childNode.id;
                                                insertPosition = i < firstIndex ? "after" : "before";
                                                break;
                                            }
                                        }
                                    }
                                }
                                timestamp = Date.now();
                                flexContainer = {
                                    id: "flex-container-".concat(timestamp),
                                    type: "container",
                                    children: dropPosition === "left"
                                        ? [draggingNode, targetNode]
                                        : [targetNode, draggingNode],
                                    attributes: {
                                        layoutType: "flex",
                                        gap: "4"
                                    }
                                };
                                actions = [
                                    actions_1.EditorActions.deleteNode(draggingNodeId),
                                    actions_1.EditorActions.deleteNode(nodeId),
                                ];
                                if (referenceNodeId) {
                                    actions.push(actions_1.EditorActions.insertNode(flexContainer, referenceNodeId, insertPosition));
                                }
                                else {
                                    actions.push(actions_1.EditorActions.replaceContainer(__assign(__assign({}, container), { children: [flexContainer] })));
                                }
                                dispatch(actions_1.EditorActions.batch(actions));
                                toast({
                                    title: "Images merged!",
                                    description: "Images placed side by side in a flex layout"
                                });
                                setDragOverNodeId(null);
                                setDropPosition(null);
                                setDraggingNodeId(null);
                                return [2 /*return*/];
                            }
                        }
                        // Vertical drop - extract from container or move at root level
                        // If the dragging node is in a flex container, we need to extract it
                        if (draggingResult.parentId && draggingResult.parent) {
                            console.log("🔍 DEBUG: Extracting from flex container");
                            console.log("  Dragging node ID:", draggingNodeId);
                            console.log("  Target node ID:", nodeId);
                            console.log("  Drop position:", dropPosition);
                            console.log("  Parent container ID:", draggingResult.parentId);
                            parent_4 = draggingResult.parent;
                            remainingChildren = parent_4.children.filter(function (c) { return c.id !== draggingNodeId; });
                            console.log("  Parent children count:", parent_4.children.length);
                            console.log("  Remaining children count:", remainingChildren.length);
                            insertPos = dropPosition === "before" || dropPosition === "after"
                                ? dropPosition
                                : "after";
                            actions = [];
                            // If only one child remains, unwrap the container
                            if (remainingChildren.length === 1) {
                                console.log("  ⚠️ Only 1 child remaining - unwrapping container");
                                parentIndex = container.children.findIndex(function (c) { return c.id === parent_4.id; });
                                console.log("  Parent index in container:", parentIndex);
                                console.log("  Container children count:", container.children.length);
                                isTargetTheFlexContainer = nodeId === parent_4.id;
                                console.log("  Is target the flex container?", isTargetTheFlexContainer);
                                if (isTargetTheFlexContainer) {
                                    referenceNodeId = null;
                                    referencePosition = insertPos === "before" ? "before" : "after";
                                    if (parentIndex > 0) {
                                        prevNode = container.children[parentIndex - 1];
                                        if (prevNode) {
                                            referenceNodeId = prevNode.id;
                                            referencePosition = "after";
                                        }
                                    }
                                    else if (parentIndex < container.children.length - 1) {
                                        nextNode = container.children[parentIndex + 1];
                                        if (nextNode) {
                                            referenceNodeId = nextNode.id;
                                            referencePosition = "before";
                                        }
                                    }
                                    if (referenceNodeId) {
                                        console.log("  Using alternative reference:", referenceNodeId, referencePosition);
                                        remainingChild = remainingChildren[0];
                                        if (!remainingChild)
                                            return [2 /*return*/];
                                        console.log("  Action 1: Insert remaining child", referencePosition, referenceNodeId);
                                        actions.push(actions_1.EditorActions.insertNode(remainingChild, referenceNodeId, referencePosition));
                                        // Now insert the dragged node next to the remaining child
                                        console.log("  Action 2: Insert dragged node", insertPos, "remaining child");
                                        actions.push(actions_1.EditorActions.insertNode(draggingNode, remainingChild.id, insertPos));
                                        // Delete the flex container (which also removes dragging node)
                                        console.log("  Action 3: Delete flex container:", parent_4.id);
                                        actions.push(actions_1.EditorActions.deleteNode(parent_4.id));
                                    }
                                    else {
                                        fallbackChild = remainingChildren[0];
                                        if (!fallbackChild)
                                            return [2 /*return*/];
                                        console.log("  No siblings found - using container as reference");
                                        actions.push(actions_1.EditorActions.insertNode(fallbackChild, container.id, "append"));
                                        actions.push(actions_1.EditorActions.insertNode(draggingNode, fallbackChild.id, insertPos));
                                        actions.push(actions_1.EditorActions.deleteNode(parent_4.id));
                                    }
                                }
                                else {
                                    targetIndex = container.children.findIndex(function (c) { return c.id === nodeId; });
                                    isTargetBeforeFlex = targetIndex === parentIndex - 1 && insertPos === "after";
                                    isTargetAfterFlex = targetIndex === parentIndex + 1 && insertPos === "before";
                                    console.log("  Target index:", targetIndex);
                                    console.log("  Is target before flex?", isTargetBeforeFlex);
                                    console.log("  Is target after flex?", isTargetAfterFlex);
                                    if (isTargetBeforeFlex || isTargetAfterFlex) {
                                        // We're inserting right next to where the flex container is
                                        // Need to be careful about ordering
                                        console.log("  ⚠️ Inserting adjacent to flex container");
                                        // Insert dragged node at the target position
                                        console.log("  Action 1: Insert dragged node", draggingNodeId, insertPos, "target:", nodeId);
                                        actions.push(actions_1.EditorActions.insertNode(draggingNode, nodeId, insertPos));
                                        adjacentChild = remainingChildren[0];
                                        if (!adjacentChild)
                                            return [2 /*return*/];
                                        if (isTargetBeforeFlex) {
                                            // Inserting before flex, so remaining child should be after dragged node
                                            console.log("  Action 2: Insert remaining child after dragged node");
                                            actions.push(actions_1.EditorActions.insertNode(adjacentChild, draggingNodeId, "after"));
                                        }
                                        else {
                                            // Inserting after flex, so remaining child should be before dragged node
                                            console.log("  Action 2: Insert remaining child before dragged node");
                                            actions.push(actions_1.EditorActions.insertNode(adjacentChild, draggingNodeId, "before"));
                                        }
                                        // Delete the flex container (also removes old dragged node reference)
                                        console.log("  Action 3: Delete flex container:", parent_4.id);
                                        actions.push(actions_1.EditorActions.deleteNode(parent_4.id));
                                    }
                                    else {
                                        // Target is somewhere else - use standard logic
                                        console.log("  Standard extraction (target not adjacent)");
                                        // Insert dragged node at new position first
                                        console.log("  Action 1: Insert dragged node", draggingNodeId, insertPos, "target:", nodeId);
                                        actions.push(actions_1.EditorActions.insertNode(draggingNode, nodeId, insertPos));
                                        // Delete the dragging node from flex
                                        console.log("  Action 2: Delete dragged node from original position");
                                        actions.push(actions_1.EditorActions.deleteNode(draggingNodeId));
                                        standardChild = remainingChildren[0];
                                        if (!standardChild)
                                            return [2 /*return*/];
                                        if (parentIndex > 0) {
                                            prevNode = container.children[parentIndex - 1];
                                            if (prevNode) {
                                                console.log("  Action 3: Insert remaining child after prevNode:", prevNode.id);
                                                actions.push(actions_1.EditorActions.insertNode(standardChild, prevNode.id, "after"));
                                            }
                                        }
                                        else if (parentIndex === 0 && container.children.length > 1) {
                                            nextNode = container.children[1];
                                            if (nextNode) {
                                                console.log("  Action 3: Insert remaining child before nextNode:", nextNode.id);
                                                actions.push(actions_1.EditorActions.insertNode(standardChild, nextNode.id, "before"));
                                            }
                                        }
                                        else {
                                            // Only the flex container exists, just insert at root
                                            console.log("  Action 3: Append remaining child to container");
                                            actions.push(actions_1.EditorActions.insertNode(standardChild, container.id, "append"));
                                        }
                                        // Delete the flex container
                                        console.log("  Action 4: Delete flex container:", parent_4.id);
                                        actions.push(actions_1.EditorActions.deleteNode(parent_4.id));
                                    }
                                }
                            }
                            else {
                                console.log("  ✓ Multiple children remain - updating container");
                                // Multiple children remain, just update the flex container
                                actions.push(actions_1.EditorActions.updateNode(parent_4.id, {
                                    children: remainingChildren
                                }));
                                // Insert dragged node at new position
                                console.log("  Action: Insert dragged node", draggingNodeId, insertPos, "target:", nodeId);
                                actions.push(actions_1.EditorActions.insertNode(draggingNode, nodeId, insertPos));
                            }
                            console.log("  📦 Total actions:", actions.length);
                            actions.push(actions_1.EditorActions.setActiveNode(draggingNodeId));
                            dispatch(actions_1.EditorActions.batch(actions));
                            toast({
                                title: "Image moved!",
                                description: "Image extracted and repositioned"
                            });
                            setDragOverNodeId(null);
                            setDropPosition(null);
                            setDraggingNodeId(null);
                            return [2 /*return*/];
                        }
                        draggingNodeAtRoot = container.children.find(function (n) { return n.id === draggingNodeId; });
                        if (draggingNodeAtRoot) {
                            targetNodeAtRoot = container.children.find(function (n) { return n.id === nodeId; });
                            isDraggingImage = (0, types_1.isTextNode)(draggingNode) && draggingNode.type === "img";
                            isTargetImage = targetNodeAtRoot &&
                                (0, types_1.isTextNode)(targetNodeAtRoot) &&
                                targetNodeAtRoot.type === "img";
                            // Use swap for non-image blocks, use move for images
                            if (!isDraggingImage && !isTargetImage && targetNodeAtRoot) {
                                dispatch(actions_1.EditorActions.swapNodes(draggingNodeId, nodeId));
                                dispatch(actions_1.EditorActions.setActiveNode(draggingNodeId));
                                toast({
                                    title: "Blocks swapped!",
                                    description: "Block positions exchanged"
                                });
                            }
                            else {
                                insertPos = dropPosition === "before" || dropPosition === "after"
                                    ? dropPosition
                                    : "after";
                                dispatch(actions_1.EditorActions.moveNode(draggingNodeId, nodeId, insertPos));
                                dispatch(actions_1.EditorActions.setActiveNode(draggingNodeId));
                                toast({
                                    title: isDraggingImage ? "Image moved!" : "Block moved!",
                                    description: "".concat(isDraggingImage ? "Image" : "Block", " repositioned ").concat(dropPosition, " the block")
                                });
                            }
                        }
                        setDragOverNodeId(null);
                        setDropPosition(null);
                        setDraggingNodeId(null);
                        return [2 /*return*/];
                    }
                    files = [];
                    if (e.dataTransfer.items) {
                        items = Array.from(e.dataTransfer.items);
                        files = items
                            .filter(function (item) { return item.kind === "file"; })
                            .map(function (item) { return item.getAsFile(); })
                            .filter(function (file) { return file !== null; });
                    }
                    else {
                        // Use DataTransferList interface
                        files = Array.from(e.dataTransfer.files);
                    }
                    mediaFile = files.find(function (file) {
                        return file.type.startsWith("image/") || file.type.startsWith("video/");
                    });
                    if (!mediaFile) {
                        setDragOverNodeId(null);
                        setDropPosition(null);
                        setDraggingNodeId(null);
                        return [2 /*return*/];
                    }
                    isVideo = mediaFile.type.startsWith("video/");
                    setIsUploading(true);
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 8]);
                    mediaUrl = void 0;
                    if (!onUploadImage) return [3 /*break*/, 3];
                    return [4 /*yield*/, onUploadImage(mediaFile)];
                case 2:
                    mediaUrl = _e.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, (0, image_upload_1.uploadImage)(mediaFile)];
                case 4:
                    result = _e.sent();
                    if (!result.success || !result.url) {
                        throw new Error(result.error || "Upload failed");
                    }
                    mediaUrl = result.url;
                    _e.label = 5;
                case 5:
                    mediaNode = {
                        id: "".concat(isVideo ? "video" : "img", "-").concat(Date.now()),
                        type: isVideo ? "video" : "img",
                        content: "",
                        attributes: {
                            src: mediaUrl,
                            alt: mediaFile.name
                        }
                    };
                    insertPos = dropPosition === "before" || dropPosition === "after"
                        ? dropPosition
                        : "after";
                    dispatch(actions_1.EditorActions.insertNode(mediaNode, nodeId, insertPos));
                    dispatch(actions_1.EditorActions.setActiveNode(mediaNode.id));
                    toast({
                        title: "".concat(isVideo ? "Video" : "Image", " uploaded!"),
                        description: "".concat(isVideo ? "Video" : "Image", " placed ").concat(dropPosition, " the block")
                    });
                    return [3 /*break*/, 8];
                case 6:
                    error_1 = _e.sent();
                    toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: error_1 instanceof Error
                            ? error_1.message
                            : "Failed to upload file. Please try again."
                    });
                    return [3 /*break*/, 8];
                case 7:
                    setIsUploading(false);
                    setDragOverNodeId(null);
                    setDropPosition(null);
                    setDraggingNodeId(null);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); };
}
exports.createHandleDrop = createHandleDrop;

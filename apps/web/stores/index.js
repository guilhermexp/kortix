"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
exports.__esModule = true;
exports.usePersistentChatStore = exports.usePersistentChat = exports.useChatOpen = exports.useMemoryGraphPosition = exports.useProject = exports.useChatStore = exports.useMemoryGraphStore = exports.useProjectStore = void 0;
var zustand_1 = require("zustand");
var middleware_1 = require("zustand/middleware");
exports.useProjectStore = (0, zustand_1.create)()((0, middleware_1.persist)(function (set) { return ({
    selectedProject: "sm_project_default",
    setSelectedProject: function (projectId) { return set({ selectedProject: projectId }); }
}); }, {
    name: "selectedProject"
}));
exports.useMemoryGraphStore = (0, zustand_1.create)()(function (set) { return ({
    positionX: 0,
    positionY: 0,
    setPositionX: function (x) { return set({ positionX: x }); },
    setPositionY: function (y) { return set({ positionY: y }); },
    setPosition: function (x, y) { return set({ positionX: x, positionY: y }); }
}); });
exports.useChatStore = (0, zustand_1.create)()(function (set, get) { return ({
    isOpen: false,
    setIsOpen: function (isOpen) { return set({ isOpen: isOpen }); },
    toggleChat: function () { return set({ isOpen: !get().isOpen }); }
}); });
function useProject() {
    var selectedProject = (0, exports.useProjectStore)(function (state) { return state.selectedProject; });
    var setSelectedProject = (0, exports.useProjectStore)(function (state) { return state.setSelectedProject; });
    return { selectedProject: selectedProject, setSelectedProject: setSelectedProject };
}
exports.useProject = useProject;
function useMemoryGraphPosition() {
    var positionX = (0, exports.useMemoryGraphStore)(function (state) { return state.positionX; });
    var positionY = (0, exports.useMemoryGraphStore)(function (state) { return state.positionY; });
    var setPositionX = (0, exports.useMemoryGraphStore)(function (state) { return state.setPositionX; });
    var setPositionY = (0, exports.useMemoryGraphStore)(function (state) { return state.setPositionY; });
    var setPosition = (0, exports.useMemoryGraphStore)(function (state) { return state.setPosition; });
    return {
        x: positionX,
        y: positionY,
        setX: setPositionX,
        setY: setPositionY,
        setPosition: setPosition
    };
}
exports.useMemoryGraphPosition = useMemoryGraphPosition;
function useChatOpen() {
    var isOpen = (0, exports.useChatStore)(function (state) { return state.isOpen; });
    var setIsOpen = (0, exports.useChatStore)(function (state) { return state.setIsOpen; });
    var toggleChat = (0, exports.useChatStore)(function (state) { return state.toggleChat; });
    return { isOpen: isOpen, setIsOpen: setIsOpen, toggleChat: toggleChat };
}
exports.useChatOpen = useChatOpen;
var chat_1 = require("./chat");
__createBinding(exports, chat_1, "usePersistentChat");
__createBinding(exports, chat_1, "usePersistentChatStore");

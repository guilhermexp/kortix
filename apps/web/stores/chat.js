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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
exports.__esModule = true;
exports.usePersistentChat = exports.usePersistentChatStore = void 0;
var zustand_1 = require("zustand");
var middleware_1 = require("zustand/middleware");
/**
 * Deep equality check for UIMessage arrays to prevent unnecessary state updates
 */
function areUIMessageArraysEqual(a, b) {
    if (a === b)
        return true;
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++) {
        var msgA = a[i];
        var msgB = b[i];
        // Both messages should exist at this index
        if (!msgA || !msgB)
            return false;
        if (msgA === msgB)
            continue;
        if (msgA.id !== msgB.id || msgA.role !== msgB.role) {
            return false;
        }
        // Compare the entire message using JSON serialization as a fallback
        // This handles all properties including parts, toolInvocations, etc.
        if (JSON.stringify(msgA) !== JSON.stringify(msgB)) {
            return false;
        }
    }
    return true;
}
exports.usePersistentChatStore = (0, zustand_1.create)()((0, middleware_1.persist)(function (set, _get) { return ({
    byProject: {},
    setCurrentChatId: function (projectId, chatId) {
        set(function (state) {
            var _a;
            var _b;
            var project = (_b = state.byProject[projectId]) !== null && _b !== void 0 ? _b : {
                currentChatId: null,
                conversations: {}
            };
            return {
                byProject: __assign(__assign({}, state.byProject), (_a = {}, _a[projectId] = __assign(__assign({}, project), { currentChatId: chatId }), _a))
            };
        });
    },
    setConversation: function (projectId, chatId, messages) {
        var now = new Date().toISOString();
        set(function (state) {
            var _a, _b;
            var _c, _d;
            var project = (_c = state.byProject[projectId]) !== null && _c !== void 0 ? _c : {
                currentChatId: null,
                conversations: {}
            };
            var existing = project.conversations[chatId];
            // Check if messages are actually different to prevent unnecessary updates
            if (existing &&
                areUIMessageArraysEqual(existing.messages, messages)) {
                return state; // No change needed
            }
            var shouldTouchLastUpdated = (function () {
                if (!existing)
                    return messages.length > 0;
                return true;
            })();
            var record = {
                messages: messages,
                title: existing === null || existing === void 0 ? void 0 : existing.title,
                lastUpdated: shouldTouchLastUpdated
                    ? now
                    : ((_d = existing === null || existing === void 0 ? void 0 : existing.lastUpdated) !== null && _d !== void 0 ? _d : now)
            };
            return {
                byProject: __assign(__assign({}, state.byProject), (_a = {}, _a[projectId] = {
                    currentChatId: project.currentChatId,
                    conversations: __assign(__assign({}, project.conversations), (_b = {}, _b[chatId] = record, _b))
                }, _a))
            };
        });
    },
    deleteConversation: function (projectId, chatId) {
        set(function (state) {
            var _a;
            var _b;
            var project = (_b = state.byProject[projectId]) !== null && _b !== void 0 ? _b : {
                currentChatId: null,
                conversations: {}
            };
            var _c = project.conversations, _d = chatId, _ = _c[_d], rest = __rest(_c, [typeof _d === "symbol" ? _d : _d + ""]);
            var nextCurrent = project.currentChatId === chatId ? null : project.currentChatId;
            return {
                byProject: __assign(__assign({}, state.byProject), (_a = {}, _a[projectId] = { currentChatId: nextCurrent, conversations: rest }, _a))
            };
        });
    },
    setConversationTitle: function (projectId, chatId, title) {
        var now = new Date().toISOString();
        set(function (state) {
            var _a, _b;
            var _c;
            var project = (_c = state.byProject[projectId]) !== null && _c !== void 0 ? _c : {
                currentChatId: null,
                conversations: {}
            };
            var existing = project.conversations[chatId];
            if (!existing)
                return { byProject: state.byProject };
            return {
                byProject: __assign(__assign({}, state.byProject), (_a = {}, _a[projectId] = {
                    currentChatId: project.currentChatId,
                    conversations: __assign(__assign({}, project.conversations), (_b = {}, _b[chatId] = __assign(__assign({}, existing), { title: title, lastUpdated: now }), _b))
                }, _a))
            };
        });
    }
}); }, {
    name: "supermemory-chats"
}));
// Always scoped to the current project via useProject
var _1 = require(".");
function usePersistentChat() {
    var _a;
    var selectedProject = (0, _1.useProject)().selectedProject;
    var projectId = selectedProject;
    var projectState = (0, exports.usePersistentChatStore)(function (s) { return s.byProject[projectId]; });
    var setCurrentChatIdRaw = (0, exports.usePersistentChatStore)(function (s) { return s.setCurrentChatId; });
    var setConversationRaw = (0, exports.usePersistentChatStore)(function (s) { return s.setConversation; });
    var deleteConversationRaw = (0, exports.usePersistentChatStore)(function (s) { return s.deleteConversation; });
    var setConversationTitleRaw = (0, exports.usePersistentChatStore)(function (s) { return s.setConversationTitle; });
    var conversations = (function () {
        var _a;
        var convs = (_a = projectState === null || projectState === void 0 ? void 0 : projectState.conversations) !== null && _a !== void 0 ? _a : {};
        return Object.entries(convs).map(function (_a) {
            var id = _a[0], rec = _a[1];
            return ({
                id: id,
                title: rec.title,
                lastUpdated: rec.lastUpdated
            });
        });
    })();
    var currentChatId = (_a = projectState === null || projectState === void 0 ? void 0 : projectState.currentChatId) !== null && _a !== void 0 ? _a : null;
    function setCurrentChatId(chatId) {
        setCurrentChatIdRaw(projectId, chatId);
    }
    function setConversation(chatId, messages) {
        setConversationRaw(projectId, chatId, messages);
    }
    function deleteConversation(chatId) {
        deleteConversationRaw(projectId, chatId);
    }
    function setConversationTitle(chatId, title) {
        setConversationTitleRaw(projectId, chatId, title);
    }
    function getCurrentConversation() {
        var _a, _b;
        var convs = (_a = projectState === null || projectState === void 0 ? void 0 : projectState.conversations) !== null && _a !== void 0 ? _a : {};
        var id = currentChatId;
        if (!id)
            return undefined;
        return (_b = convs[id]) === null || _b === void 0 ? void 0 : _b.messages;
    }
    function getCurrentChat() {
        var _a;
        var id = currentChatId;
        if (!id)
            return undefined;
        var rec = (_a = projectState === null || projectState === void 0 ? void 0 : projectState.conversations) === null || _a === void 0 ? void 0 : _a[id];
        if (!rec)
            return undefined;
        return { id: id, title: rec.title, lastUpdated: rec.lastUpdated };
    }
    return {
        conversations: conversations,
        currentChatId: currentChatId,
        setCurrentChatId: setCurrentChatId,
        setConversation: setConversation,
        deleteConversation: deleteConversation,
        setConversationTitle: setConversationTitle,
        getCurrentConversation: getCurrentConversation,
        getCurrentChat: getCurrentChat
    };
}
exports.usePersistentChat = usePersistentChat;

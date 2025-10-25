"use strict";
exports.__esModule = true;
exports.useGraphHighlights = exports.useGraphHighlightsStore = void 0;
var zustand_1 = require("zustand");
exports.useGraphHighlightsStore = (0, zustand_1.create)()(function (set, get) { return ({
    documentIds: [],
    lastUpdated: 0,
    setDocumentIds: function (ids) {
        var next = Array.from(new Set(ids));
        var prev = get().documentIds;
        if (prev.length === next.length &&
            prev.every(function (id) { return next.includes(id); })) {
            return;
        }
        set({ documentIds: next, lastUpdated: Date.now() });
    },
    clear: function () { return set({ documentIds: [], lastUpdated: Date.now() }); }
}); });
function useGraphHighlights() {
    var documentIds = (0, exports.useGraphHighlightsStore)(function (s) { return s.documentIds; });
    var lastUpdated = (0, exports.useGraphHighlightsStore)(function (s) { return s.lastUpdated; });
    var setDocumentIds = (0, exports.useGraphHighlightsStore)(function (s) { return s.setDocumentIds; });
    var clear = (0, exports.useGraphHighlightsStore)(function (s) { return s.clear; });
    return { documentIds: documentIds, lastUpdated: lastUpdated, setDocumentIds: setDocumentIds, clear: clear };
}
exports.useGraphHighlights = useGraphHighlights;

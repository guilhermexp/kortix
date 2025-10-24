"use strict";
exports.__esModule = true;
var react_1 = require("react");
function useResizeObserver(ref) {
    var _a = (0, react_1.useState)({ width: 0, height: 0 }), size = _a[0], setSize = _a[1];
    (0, react_1.useEffect)(function () {
        if (!ref.current)
            return;
        var observer = new ResizeObserver(function (_a) {
            var _b, _c;
            var entry = _a[0];
            setSize({
                width: (_b = entry === null || entry === void 0 ? void 0 : entry.contentRect.width) !== null && _b !== void 0 ? _b : 0,
                height: (_c = entry === null || entry === void 0 ? void 0 : entry.contentRect.height) !== null && _c !== void 0 ? _c : 0
            });
        });
        observer.observe(ref.current);
        return function () { return observer.disconnect(); };
    }, [ref]);
    return size;
}
exports["default"] = useResizeObserver;

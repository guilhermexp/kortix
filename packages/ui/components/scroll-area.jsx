"use client";
"use strict";
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
exports.ScrollBar = exports.ScrollArea = void 0;
var utils_1 = require("@lib/utils");
var ScrollAreaPrimitive = require("@radix-ui/react-scroll-area");
function ScrollArea(_a) {
    var className = _a.className, children = _a.children, props = __rest(_a, ["className", "children"]);
    return (<ScrollAreaPrimitive.Root className={(0, utils_1.cn)("relative overflow-hidden", className)} data-slot="scroll-area" {...props}>
			<ScrollAreaPrimitive.Viewport className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:outline-1" data-slot="scroll-area-viewport">
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>);
}
exports.ScrollArea = ScrollArea;
function ScrollBar(_a) {
    var className = _a.className, _b = _a.orientation, orientation = _b === void 0 ? "vertical" : _b, props = __rest(_a, ["className", "orientation"]);
    return (<ScrollAreaPrimitive.ScrollAreaScrollbar className={(0, utils_1.cn)("flex touch-none p-px transition-colors select-none", orientation === "vertical" &&
            "h-full w-2.5 border-l border-l-transparent", orientation === "horizontal" &&
            "h-2.5 flex-col border-t border-t-transparent", className)} data-slot="scroll-area-scrollbar" orientation={orientation} {...props}>
			<ScrollAreaPrimitive.ScrollAreaThumb className="bg-border relative flex-1 rounded-full" data-slot="scroll-area-thumb"/>
		</ScrollAreaPrimitive.ScrollAreaScrollbar>);
}
exports.ScrollBar = ScrollBar;

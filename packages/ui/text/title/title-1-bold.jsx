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
exports.Title1Bold = void 0;
var utils_1 = require("@lib/utils");
var react_slot_1 = require("@radix-ui/react-slot");
function Title1Bold(_a) {
    var className = _a.className, asChild = _a.asChild, props = __rest(_a, ["className", "asChild"]);
    var Comp = asChild ? react_slot_1.Root : "h1";
    return (<Comp className={(0, utils_1.cn)("text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-[70px] tracking-[-0.8px]", className)} {...props}/>);
}
exports.Title1Bold = Title1Bold;

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
exports.Label1Regular = void 0;
var utils_1 = require("@lib/utils");
var react_slot_1 = require("@radix-ui/react-slot");
function Label1Regular(_a) {
    var className = _a.className, asChild = _a.asChild, props = __rest(_a, ["className", "asChild"]);
    var Comp = asChild ? react_slot_1.Root : "p";
    return (<Comp className={(0, utils_1.cn)("text-[0.875rem] md:text-[1rem] font-normal leading-[1.5rem] tracking-[-0.4px]", className)} {...props}/>);
}
exports.Label1Regular = Label1Regular;

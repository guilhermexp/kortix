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
exports.DialogTrigger = exports.DialogTitle = exports.DialogPortal = exports.DialogOverlay = exports.DialogHeader = exports.DialogFooter = exports.DialogDescription = exports.DialogContent = exports.DialogClose = exports.Dialog = void 0;
var utils_1 = require("@lib/utils");
var DialogPrimitive = require("@radix-ui/react-dialog");
var lucide_react_1 = require("lucide-react");
function Dialog(_a) {
    var props = __rest(_a, []);
    return <DialogPrimitive.Root data-slot="dialog" {...props}/>;
}
exports.Dialog = Dialog;
function DialogTrigger(_a) {
    var props = __rest(_a, []);
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props}/>;
}
exports.DialogTrigger = DialogTrigger;
function DialogPortal(_a) {
    var props = __rest(_a, []);
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props}/>;
}
exports.DialogPortal = DialogPortal;
function DialogClose(_a) {
    var props = __rest(_a, []);
    return <DialogPrimitive.Close data-slot="dialog-close" {...props}/>;
}
exports.DialogClose = DialogClose;
function DialogOverlay(_a) {
    var className = _a.className, props = __rest(_a, ["className"]);
    return (<DialogPrimitive.Overlay className={(0, utils_1.cn)("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50", className)} data-slot="dialog-overlay" {...props}/>);
}
exports.DialogOverlay = DialogOverlay;
function DialogContent(_a) {
    var className = _a.className, children = _a.children, _b = _a.showCloseButton, showCloseButton = _b === void 0 ? true : _b, props = __rest(_a, ["className", "children", "showCloseButton"]);
    return (<DialogPortal data-slot="dialog-portal">
			<DialogOverlay />
			<DialogPrimitive.Content className={(0, utils_1.cn)("bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg", className)} data-slot="dialog-content" {...props}>
				{children}
				{showCloseButton && (<DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" data-slot="dialog-close">
						<lucide_react_1.XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>)}
			</DialogPrimitive.Content>
		</DialogPortal>);
}
exports.DialogContent = DialogContent;
function DialogHeader(_a) {
    var className = _a.className, props = __rest(_a, ["className"]);
    return (<div className={(0, utils_1.cn)("flex flex-col gap-2 text-center sm:text-left", className)} data-slot="dialog-header" {...props}/>);
}
exports.DialogHeader = DialogHeader;
function DialogFooter(_a) {
    var className = _a.className, props = __rest(_a, ["className"]);
    return (<div className={(0, utils_1.cn)("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} data-slot="dialog-footer" {...props}/>);
}
exports.DialogFooter = DialogFooter;
function DialogTitle(_a) {
    var className = _a.className, props = __rest(_a, ["className"]);
    return (<DialogPrimitive.Title className={(0, utils_1.cn)("text-lg leading-none font-semibold", className)} data-slot="dialog-title" {...props}/>);
}
exports.DialogTitle = DialogTitle;
function DialogDescription(_a) {
    var className = _a.className, props = __rest(_a, ["className"]);
    return (<DialogPrimitive.Description className={(0, utils_1.cn)("text-muted-foreground text-sm", className)} data-slot="dialog-description" {...props}/>);
}
exports.DialogDescription = DialogDescription;

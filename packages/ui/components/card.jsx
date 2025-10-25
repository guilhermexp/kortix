var __rest =
	(this && this.__rest) ||
	((s, e) => {
		var t = {};
		for (var p in s) if (Object.hasOwn(s, p) && e.indexOf(p) < 0) t[p] = s[p];
		if (s != null && typeof Object.getOwnPropertySymbols === "function")
			for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
				if (
					e.indexOf(p[i]) < 0 &&
					Object.prototype.propertyIsEnumerable.call(s, p[i])
				)
					t[p[i]] = s[p[i]];
			}
		return t;
	});
exports.__esModule = true;
exports.CardContent =
	exports.CardDescription =
	exports.CardAction =
	exports.CardTitle =
	exports.CardFooter =
	exports.CardHeader =
	exports.Card =
		void 0;
var utils_1 = require("@lib/utils");
function Card(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)(
				"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
				className,
			)}
			data-slot="card"
			{...props}
		/>
	);
}
exports.Card = Card;
function CardHeader(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				className,
			)}
			data-slot="card-header"
			{...props}
		/>
	);
}
exports.CardHeader = CardHeader;
function CardTitle(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)("leading-none font-semibold", className)}
			data-slot="card-title"
			{...props}
		/>
	);
}
exports.CardTitle = CardTitle;
function CardDescription(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)("text-muted-foreground text-sm", className)}
			data-slot="card-description"
			{...props}
		/>
	);
}
exports.CardDescription = CardDescription;
function CardAction(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)(
				"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
				className,
			)}
			data-slot="card-action"
			{...props}
		/>
	);
}
exports.CardAction = CardAction;
function CardContent(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)("px-6", className)}
			data-slot="card-content"
			{...props}
		/>
	);
}
exports.CardContent = CardContent;
function CardFooter(_a) {
	var className = _a.className,
		props = __rest(_a, ["className"]);
	return (
		<div
			className={(0, utils_1.cn)(
				"flex items-center px-6 [.border-t]:pt-6",
				className,
			)}
			data-slot="card-footer"
			{...props}
		/>
	);
}
exports.CardFooter = CardFooter;

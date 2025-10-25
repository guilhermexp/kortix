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
exports.HeadingH3Bold = void 0;
var utils_1 = require("@lib/utils");
var react_slot_1 = require("@radix-ui/react-slot");
function HeadingH3Bold(_a) {
	var className = _a.className,
		asChild = _a.asChild,
		props = __rest(_a, ["className", "asChild"]);
	var Comp = asChild ? react_slot_1.Root : "h3";
	return (
		<Comp
			className={(0, utils_1.cn)(
				"text-[0.625rem] sm:text-xs md:text-sm lg:text-base font-bold leading-[28px] tracking-[-0.4px]",
				className,
			)}
			{...props}
		/>
	);
}
exports.HeadingH3Bold = HeadingH3Bold;

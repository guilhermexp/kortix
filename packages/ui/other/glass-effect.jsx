exports.__esModule = true;
exports.GlassMenuEffect = void 0;
function GlassMenuEffect(_a) {
	var _b = _a.rounded,
		rounded = _b === void 0 ? "rounded-3xl" : _b,
		_c = _a.className,
		className = _c === void 0 ? "" : _c;
	return (
		<div className={"absolute inset-0 ".concat(className)}>
			{/* Frosted glass effect with translucent border */}
			<div
				className={"absolute inset-0 backdrop-blur-md bg-white/5 border border-white/10 ".concat(
					rounded,
				)}
			/>
		</div>
	);
}
exports.GlassMenuEffect = GlassMenuEffect;

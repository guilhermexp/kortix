"use client";

var __assign =
	(this && this.__assign) ||
	function () {
		__assign =
			Object.assign ||
			((t) => {
				for (var s, i = 1, n = arguments.length; i < n; i++) {
					s = arguments[i];
					for (var p in s) if (Object.hasOwn(s, p)) t[p] = s[p];
				}
				return t;
			});
		return __assign.apply(this, arguments);
	};
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
exports.DropzoneEmptyState =
	exports.DropzoneContent =
	exports.Dropzone =
		void 0;
var utils_1 = require("@lib/utils");
var button_1 = require("@ui/components/button");
var lucide_react_1 = require("lucide-react");
var react_1 = require("react");
var react_dropzone_1 = require("react-dropzone");
var renderBytes = (bytes) => {
	var units = ["B", "KB", "MB", "GB", "TB", "PB"];
	var size = bytes;
	var unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return "".concat(size.toFixed(2)).concat(units[unitIndex]);
};
var DropzoneContext = (0, react_1.createContext)(undefined);
var Dropzone = (_a) => {
	var accept = _a.accept,
		_b = _a.maxFiles,
		maxFiles = _b === void 0 ? 1 : _b,
		maxSize = _a.maxSize,
		minSize = _a.minSize,
		onDrop = _a.onDrop,
		onError = _a.onError,
		disabled = _a.disabled,
		src = _a.src,
		className = _a.className,
		children = _a.children,
		props = __rest(_a, [
			"accept",
			"maxFiles",
			"maxSize",
			"minSize",
			"onDrop",
			"onError",
			"disabled",
			"src",
			"className",
			"children",
		]);
	var _c = (0, react_dropzone_1.useDropzone)(
			__assign(
				{
					accept: accept,
					maxFiles: maxFiles,
					maxSize: maxSize,
					minSize: minSize,
					onError: onError,
					disabled: disabled,
					onDrop: (acceptedFiles, fileRejections, event) => {
						var _a, _b;
						if (fileRejections.length > 0) {
							var message =
								(_b =
									(_a = fileRejections.at(0)) === null || _a === void 0
										? void 0
										: _a.errors.at(0)) === null || _b === void 0
									? void 0
									: _b.message;
							onError === null || onError === void 0
								? void 0
								: onError(new Error(message));
							return;
						}
						onDrop === null || onDrop === void 0
							? void 0
							: onDrop(acceptedFiles, fileRejections, event);
					},
				},
				props,
			),
		),
		getRootProps = _c.getRootProps,
		getInputProps = _c.getInputProps,
		isDragActive = _c.isDragActive;
	return (
		<DropzoneContext.Provider
			key={JSON.stringify(src)}
			value={{
				src: src,
				accept: accept,
				maxSize: maxSize,
				minSize: minSize,
				maxFiles: maxFiles,
			}}
		>
			<button_1.Button
				className={(0, utils_1.cn)(
					"relative h-auto w-full flex-col overflow-hidden p-8",
					isDragActive && "outline-none ring-1 ring-ring",
					className,
				)}
				disabled={disabled}
				type="button"
				variant="outline"
				{...getRootProps()}
			>
				<input {...getInputProps()} disabled={disabled} />
				{children}
			</button_1.Button>
		</DropzoneContext.Provider>
	);
};
exports.Dropzone = Dropzone;
var useDropzoneContext = () => {
	var context = (0, react_1.useContext)(DropzoneContext);
	if (!context) {
		throw new Error("useDropzoneContext must be used within a Dropzone");
	}
	return context;
};
var maxLabelItems = 1;
var DropzoneContent = (_a) => {
	var children = _a.children,
		className = _a.className;
	var src = useDropzoneContext().src;
	if (!src) {
		return null;
	}
	if (children) {
		return children;
	}
	return (
		<div
			className={(0, utils_1.cn)(
				"flex flex-col items-center justify-center",
				className,
			)}
		>
			<div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<lucide_react_1.UploadIcon size={16} />
			</div>
			<p className="my-2 w-full truncate font-medium text-sm">
				{src.length > maxLabelItems
					? ""
							.concat(
								new Intl.ListFormat("en").format(
									src.slice(0, maxLabelItems).map((file) => file.name),
								),
								" and ",
							)
							.concat(src.length - maxLabelItems, " more")
					: new Intl.ListFormat("en").format(src.map((file) => file.name))}
			</p>
			<p className="w-full text-wrap text-muted-foreground text-xs">
				Drag and drop or click to replace
			</p>
		</div>
	);
};
exports.DropzoneContent = DropzoneContent;
var DropzoneEmptyState = (_a) => {
	var children = _a.children,
		className = _a.className;
	var _b = useDropzoneContext(),
		src = _b.src,
		accept = _b.accept,
		maxSize = _b.maxSize,
		minSize = _b.minSize,
		maxFiles = _b.maxFiles;
	if (src) {
		return null;
	}
	if (children) {
		return children;
	}
	var caption = "";
	if (accept) {
		caption += "Accepts ";
		caption += new Intl.ListFormat("en").format(Object.keys(accept));
	}
	if (minSize && maxSize) {
		caption += " between "
			.concat(renderBytes(minSize), " and ")
			.concat(renderBytes(maxSize));
	} else if (minSize) {
		caption += " at least ".concat(renderBytes(minSize));
	} else if (maxSize) {
		caption += " less than ".concat(renderBytes(maxSize));
	}
	return (
		<div
			className={(0, utils_1.cn)(
				"flex flex-col items-center justify-center",
				className,
			)}
		>
			<div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<lucide_react_1.UploadIcon size={16} />
			</div>
			<p className="my-2 w-full truncate text-wrap font-medium text-sm">
				Upload {maxFiles === 1 ? "a file" : "files"}
			</p>
			<p className="w-full truncate text-wrap text-muted-foreground text-xs">
				Drag and drop or click to upload
			</p>
			{caption && (
				<p className="text-wrap text-muted-foreground text-xs">{caption}.</p>
			)}
		</div>
	);
};
exports.DropzoneEmptyState = DropzoneEmptyState;

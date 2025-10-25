var __awaiter =
	(this && this.__awaiter) ||
	((thisArg, _arguments, P, generator) => {
		function adopt(value) {
			return value instanceof P
				? value
				: new P((resolve) => {
						resolve(value)
					})
		}
		return new (P || (P = Promise))((resolve, reject) => {
			function fulfilled(value) {
				try {
					step(generator.next(value))
				} catch (e) {
					reject(e)
				}
			}
			function rejected(value) {
				try {
					step(generator["throw"](value))
				} catch (e) {
					reject(e)
				}
			}
			function step(result) {
				result.done
					? resolve(result.value)
					: adopt(result.value).then(fulfilled, rejected)
			}
			step((generator = generator.apply(thisArg, _arguments || [])).next())
		})
	})
var __generator =
	(this && this.__generator) ||
	((thisArg, body) => {
		var _ = {
				label: 0,
				sent: () => {
					if (t[0] & 1) throw t[1]
					return t[1]
				},
				trys: [],
				ops: [],
			},
			f,
			y,
			t,
			g
		return (
			(g = { next: verb(0), throw: verb(1), return: verb(2) }),
			typeof Symbol === "function" &&
				(g[Symbol.iterator] = function () {
					return this
				}),
			g
		)
		function verb(n) {
			return (v) => step([n, v])
		}
		function step(op) {
			if (f) throw new TypeError("Generator is already executing.")
			while ((g && ((g = 0), op[0] && (_ = 0)), _))
				try {
					if (
						((f = 1),
						y &&
							(t =
								op[0] & 2
									? y["return"]
									: op[0]
										? y["throw"] || ((t = y["return"]) && t.call(y), 0)
										: y.next) &&
							!(t = t.call(y, op[1])).done)
					)
						return t
					if (((y = 0), t)) op = [op[0] & 2, t.value]
					switch (op[0]) {
						case 0:
						case 1:
							t = op
							break
						case 4:
							_.label++
							return { value: op[1], done: false }
						case 5:
							_.label++
							y = op[1]
							op = [0]
							continue
						case 7:
							op = _.ops.pop()
							_.trys.pop()
							continue
						default:
							if (
								!((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
								(op[0] === 6 || op[0] === 2)
							) {
								_ = 0
								continue
							}
							if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
								_.label = op[1]
								break
							}
							if (op[0] === 6 && _.label < t[1]) {
								_.label = t[1]
								t = op
								break
							}
							if (t && _.label < t[2]) {
								_.label = t[2]
								_.ops.push(op)
								break
							}
							if (t[2]) _.ops.pop()
							_.trys.pop()
							continue
					}
					op = body.call(thisArg, _)
				} catch (e) {
					op = [6, e]
					y = 0
				} finally {
					f = t = 0
				}
			if (op[0] & 5) throw op[1]
			return { value: op[0] ? op[1] : void 0, done: true }
		}
	})
exports.__esModule = true
exports.createHandleMultipleImagesUploadClick =
	exports.createHandleImageUploadClick =
	exports.createHandleMultipleFilesChange =
	exports.createHandleFileChange =
		void 0
var actions_1 = require("../reducer/actions")
var image_upload_1 = require("../utils/image-upload")
/**
 * Handle single file change (supports both images and videos)
 */
function createHandleFileChange(params) {
	return (e) =>
		__awaiter(this, void 0, void 0, function () {
			var container,
				dispatch,
				state,
				toast,
				setIsUploading,
				fileInputRef,
				onUploadImage,
				file,
				isVideo,
				isImage,
				fileUrl,
				result,
				mediaNode,
				targetId,
				error_1
			var _a, _b
			return __generator(this, (_c) => {
				switch (_c.label) {
					case 0:
						;(container = params.container),
							(dispatch = params.dispatch),
							(state = params.state),
							(toast = params.toast),
							(setIsUploading = params.setIsUploading),
							(fileInputRef = params.fileInputRef),
							(onUploadImage = params.onUploadImage)
						file =
							(_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0]
						if (!file) return [2 /*return*/]
						setIsUploading(true)
						isVideo = file.type.startsWith("video/")
						isImage = file.type.startsWith("image/")
						if (!isImage && !isVideo) {
							toast({
								variant: "destructive",
								title: "Invalid file type",
								description: "Please upload an image or video file.",
							})
							setIsUploading(false)
							return [2 /*return*/]
						}
						_c.label = 1
					case 1:
						_c.trys.push([1, 6, 7, 8])
						fileUrl = void 0
						if (!onUploadImage) return [3 /*break*/, 3]
						return [4 /*yield*/, onUploadImage(file)]
					case 2:
						fileUrl = _c.sent()
						return [3 /*break*/, 5]
					case 3:
						return [4 /*yield*/, (0, image_upload_1.uploadImage)(file)]
					case 4:
						result = _c.sent()
						if (!result.success || !result.url) {
							throw new Error(result.error || "Upload failed")
						}
						fileUrl = result.url
						_c.label = 5
					case 5:
						mediaNode = {
							id: "".concat(isVideo ? "video" : "img", "-").concat(Date.now()),
							type: isVideo ? "video" : "img",
							content: "",
							attributes: {
								src: fileUrl,
								alt: file.name,
							},
						}
						targetId =
							state.activeNodeId ||
							((_b = container.children[container.children.length - 1]) ===
								null || _b === void 0
								? void 0
								: _b.id)
						if (targetId) {
							dispatch(
								actions_1.EditorActions.insertNode(
									mediaNode,
									targetId,
									"after",
								),
							)
						} else {
							dispatch(
								actions_1.EditorActions.insertNode(
									mediaNode,
									container.id,
									"append",
								),
							)
						}
						toast({
							title: "".concat(isVideo ? "Video" : "Image", " uploaded"),
							description: "Your ".concat(
								isVideo ? "video" : "image",
								" has been added to the editor.",
							),
						})
						return [3 /*break*/, 8]
					case 6:
						error_1 = _c.sent()
						toast({
							variant: "destructive",
							title: "Upload failed",
							description:
								error_1 instanceof Error
									? error_1.message
									: "An unexpected error occurred",
						})
						return [3 /*break*/, 8]
					case 7:
						setIsUploading(false)
						// Reset file input
						if (fileInputRef.current) {
							fileInputRef.current.value = ""
						}
						return [7 /*endfinally*/]
					case 8:
						return [2 /*return*/]
				}
			})
		})
}
exports.createHandleFileChange = createHandleFileChange
/**
 * Handle multiple files change (supports both images and videos)
 */
function createHandleMultipleFilesChange(params) {
	return (e) =>
		__awaiter(this, void 0, void 0, function () {
			var container,
				dispatch,
				state,
				toast,
				setIsUploading,
				multipleFileInputRef,
				onUploadImage,
				files,
				validFiles_1,
				uploadPromises,
				mediaUrls,
				timestamp_1,
				mediaNodes,
				flexContainer,
				targetId,
				videoCount,
				imageCount,
				description,
				error_2
			var _a
			return __generator(this, (_b) => {
				switch (_b.label) {
					case 0:
						;(container = params.container),
							(dispatch = params.dispatch),
							(state = params.state),
							(toast = params.toast),
							(setIsUploading = params.setIsUploading),
							(multipleFileInputRef = params.multipleFileInputRef),
							(onUploadImage = params.onUploadImage)
						files = Array.from(e.target.files || [])
						if (files.length === 0) return [2 /*return*/]
						setIsUploading(true)
						_b.label = 1
					case 1:
						_b.trys.push([1, 3, 4, 5])
						validFiles_1 = files.filter(
							(file) =>
								file.type.startsWith("image/") ||
								file.type.startsWith("video/"),
						)
						if (validFiles_1.length === 0) {
							toast({
								variant: "destructive",
								title: "Invalid file types",
								description: "Please upload only image or video files.",
							})
							setIsUploading(false)
							return [2 /*return*/]
						}
						uploadPromises = validFiles_1.map((file) =>
							__awaiter(this, void 0, void 0, function () {
								var result
								return __generator(this, (_a) => {
									switch (_a.label) {
										case 0:
											if (!onUploadImage) return [3 /*break*/, 2]
											return [4 /*yield*/, onUploadImage(file)]
										case 1:
											return [2 /*return*/, _a.sent()]
										case 2:
											return [
												4 /*yield*/,
												(0, image_upload_1.uploadImage)(file),
											]
										case 3:
											result = _a.sent()
											if (!result.success || !result.url) {
												throw new Error(result.error || "Upload failed")
											}
											return [2 /*return*/, result.url]
									}
								})
							}),
						)
						return [4 /*yield*/, Promise.all(uploadPromises)]
					case 2:
						mediaUrls = _b.sent()
						timestamp_1 = Date.now()
						mediaNodes = mediaUrls.map((url, index) => {
							var file = validFiles_1[index]
							if (!file) throw new Error("File not found at index")
							var isVideo = file.type.startsWith("video/")
							return {
								id: ""
									.concat(isVideo ? "video" : "img", "-")
									.concat(timestamp_1, "-")
									.concat(index),
								type: isVideo ? "video" : "img",
								content: "",
								attributes: {
									src: url,
									alt: file.name,
								},
							}
						})
						flexContainer = {
							id: "flex-container-".concat(timestamp_1),
							type: "container",
							children: mediaNodes,
							attributes: {
								layoutType: "flex",
								gap: "4",
								flexWrap: "wrap",
							},
						}
						targetId =
							state.activeNodeId ||
							((_a = container.children[container.children.length - 1]) ===
								null || _a === void 0
								? void 0
								: _a.id)
						if (targetId) {
							dispatch(
								actions_1.EditorActions.insertNode(
									flexContainer,
									targetId,
									"after",
								),
							)
						} else {
							dispatch(
								actions_1.EditorActions.insertNode(
									flexContainer,
									container.id,
									"append",
								),
							)
						}
						videoCount = validFiles_1.filter((f) =>
							f.type.startsWith("video/"),
						).length
						imageCount = validFiles_1.filter((f) =>
							f.type.startsWith("image/"),
						).length
						description = ""
						if (videoCount > 0 && imageCount > 0) {
							description = ""
								.concat(imageCount, " image(s) and ")
								.concat(videoCount, " video(s) added in a flex layout.")
						} else if (videoCount > 0) {
							description = "".concat(
								videoCount,
								" video(s) added in a flex layout.",
							)
						} else {
							description = "".concat(
								imageCount,
								" image(s) added in a flex layout.",
							)
						}
						toast({
							title: "Media uploaded",
							description: description,
						})
						return [3 /*break*/, 5]
					case 3:
						error_2 = _b.sent()
						toast({
							variant: "destructive",
							title: "Upload failed",
							description:
								error_2 instanceof Error
									? error_2.message
									: "An unexpected error occurred",
						})
						return [3 /*break*/, 5]
					case 4:
						setIsUploading(false)
						// Reset file input
						if (multipleFileInputRef.current) {
							multipleFileInputRef.current.value = ""
						}
						return [7 /*endfinally*/]
					case 5:
						return [2 /*return*/]
				}
			})
		})
}
exports.createHandleMultipleFilesChange = createHandleMultipleFilesChange
/**
 * Handle image upload click
 */
function createHandleImageUploadClick(fileInputRef) {
	return () => {
		var _a
		;(_a = fileInputRef.current) === null || _a === void 0 ? void 0 : _a.click()
	}
}
exports.createHandleImageUploadClick = createHandleImageUploadClick
/**
 * Handle multiple images upload click
 */
function createHandleMultipleImagesUploadClick(multipleFileInputRef) {
	return () => {
		var _a
		;(_a = multipleFileInputRef.current) === null || _a === void 0
			? void 0
			: _a.click()
	}
}
exports.createHandleMultipleImagesUploadClick =
	createHandleMultipleImagesUploadClick

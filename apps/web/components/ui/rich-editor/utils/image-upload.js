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
exports.uploadImage = void 0
var MOCK_IMAGES = [
	"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
	"https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80",
	"https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
	"https://images.unsplash.com/photo-1511884642898-4c92249e20b6?w=800&q=80",
	"https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=800&q=80",
	"https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&q=80",
]
/**
 * Mock function to simulate image upload to server
 *
 * @param file - The image file to upload
 * @returns Promise with upload result containing the image URL
 *
 * @example
 * ```typescript
 * const result = await uploadImage(file);
 * if (result.success) {
 *
 * }
 * ```
 */
function uploadImage(file) {
	return __awaiter(this, void 0, void 0, function () {
		var delay, maxSize, randomIndex, url
		return __generator(this, (_a) => {
			switch (_a.label) {
				case 0:
					delay = Math.random() * 1000 + 500
					return [
						4 /*yield*/,
						new Promise((resolve) => setTimeout(resolve, delay)),
						// Validate file type
					]
				case 1:
					_a.sent()
					// Validate file type
					if (!file.type.startsWith("image/")) {
						return [
							2 /*return*/,
							{
								success: false,
								error: "File must be an image",
							},
						]
					}
					maxSize = 10 * 1024 * 1024 // 10MB
					if (file.size > maxSize) {
						return [
							2 /*return*/,
							{
								success: false,
								error: "Image must be smaller than 10MB",
							},
						]
					}
					// Simulate 5% chance of upload failure for testing
					if (Math.random() < 0.05) {
						return [
							2 /*return*/,
							{
								success: false,
								error: "Upload failed. Please try again.",
							},
						]
					}
					randomIndex = Math.floor(Math.random() * MOCK_IMAGES.length)
					url = MOCK_IMAGES[randomIndex]
					return [
						2 /*return*/,
						{
							success: true,
							url: url,
						},
					]
			}
		})
	})
}
exports.uploadImage = uploadImage
/**
 * In production, replace the above mock function with actual API call:
 *
 * export async function uploadImage(file: File): Promise<UploadResult> {
 *   const formData = new FormData();
 *   formData.append('image', file);
 *
 *   try {
 *     const response = await fetch('/api/upload', {
 *       method: 'POST',
 *       body: formData,
 *     });
 *
 *     if (!response.ok) {
 *       throw new Error('Upload failed');
 *     }
 *
 *     const data = await response.json();
 *     return {
 *       success: true,
 *       url: data.url,
 *     };
 *   } catch (error) {
 *     return {
 *       success: false,
 *       error: error instanceof Error ? error.message : 'Upload failed',
 *     };
 *   }
 * }
 */

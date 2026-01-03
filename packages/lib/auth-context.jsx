"use client"

var __assign =
	(this && this.__assign) ||
	function () {
		__assign =
			Object.assign ||
			((t) => {
				for (var s, i = 1, n = arguments.length; i < n; i++) {
					s = arguments[i]
					for (var p in s) if (Object.hasOwn(s, p)) t[p] = s[p]
				}
				return t
			})
		return __assign.apply(this, arguments)
	}
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
					step(generator.throw(value))
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
		}
		var f
		var y
		var t
		var g
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
									? y.return
									: op[0]
										? y.throw || ((t = y.return) && t.call(y), 0)
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
exports.useAuth = exports.AuthProvider = void 0
var react_1 = require("react")
var auth_1 = require("./auth")
var AuthContext = (0, react_1.createContext)(undefined)
function AuthProvider(_a) {
	var _b
	var _c
	var children = _a.children
	var data = (0, auth_1.useSession)().data
	function setActiveOrg() {
		return __awaiter(this, void 0, void 0, function () {
			return __generator(this, (_a) => {
				// Single-organization setup, nothing to switch.
				return [2 /*return*/, Promise.resolve()]
			})
		})
	}
	var user = (data === null || data === void 0 ? void 0 : data.user)
		? __assign(__assign({}, data.user), { isAnonymous: false })
		: null
	return (
		<AuthContext.Provider
			value={{
				session:
					(_b = data === null || data === void 0 ? void 0 : data.session) !==
						null && _b !== void 0
						? _b
						: null,
				user: user,
				org:
					(_c =
						data === null || data === void 0 ? void 0 : data.organization) !==
						null && _c !== void 0
						? _c
						: null,
				setActiveOrg: setActiveOrg,
			}}
		>
			{children}
		</AuthContext.Provider>
	)
}
exports.AuthProvider = AuthProvider
function useAuth() {
	var context = (0, react_1.useContext)(AuthContext)
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider")
	}
	return context
}
exports.useAuth = useAuth

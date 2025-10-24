"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.config = void 0;
var env_1 = require("@lib/env");
var server_1 = require("next/server");
function middleware(request) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var url, sessionCookie, publicPaths, loginUrl, redirectPath, response;
        return __generator(this, function (_c) {
            console.debug("[MIDDLEWARE] === MIDDLEWARE START ===");
            url = new URL(request.url);
            console.debug("[MIDDLEWARE] Path:", url.pathname);
            console.debug("[MIDDLEWARE] Method:", request.method);
            sessionCookie = (_b = (_a = request.cookies.get("sm_session")) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null;
            console.debug("[MIDDLEWARE] Session cookie exists:", !!sessionCookie);
            publicPaths = ["/login", "/manifest.webmanifest"];
            if (publicPaths.includes(url.pathname)) {
                console.debug("[MIDDLEWARE] Public path, allowing access");
                return [2 /*return*/, server_1.NextResponse.next()];
            }
            // If no session cookie and not on a public path, redirect to login
            if (!sessionCookie) {
                console.debug("[MIDDLEWARE] No session cookie and not on public path, redirecting to /login");
                loginUrl = new URL("/login", request.url);
                redirectPath = "".concat(url.pathname).concat(url.search);
                loginUrl.searchParams.set("redirect", redirectPath);
                return [2 /*return*/, server_1.NextResponse.redirect(loginUrl)];
            }
            // TEMPORARILY DISABLED: Waitlist check
            // if (url.pathname !== "/waitlist") {
            // 	const response = await $fetch("@get/waitlist/status", {
            // 		headers: {
            // 			Authorization: `Bearer ${sessionCookie}`,
            // 		},
            // 	});
            // 	console.debug("[MIDDLEWARE] Waitlist status:", response.data);
            // 	if (response.data && !response.data.accessGranted) {
            // 		return NextResponse.redirect(new URL("/waitlist", request.url));
            // 	}
            // }
            console.debug("[MIDDLEWARE] Passing through to next handler");
            console.debug("[MIDDLEWARE] === MIDDLEWARE END ===");
            response = server_1.NextResponse.next();
            response.cookies.set({
                name: "last-site-visited",
                value: env_1.APP_URL,
                domain: env_1.APP_HOSTNAME
            });
            return [2 /*return*/, response];
        });
    });
}
exports["default"] = middleware;
exports.config = {
    matcher: [
        "/((?!_next/static|_next/image|images|icon.png|monitoring|opengraph-image.png|ingest|api|v3|login|api/emails).*)",
    ]
};

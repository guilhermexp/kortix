"use strict";
exports.__esModule = true;
exports.useUnsavedChanges = void 0;
var react_1 = require("react");
var navigation_1 = require("next/navigation");
/**
 * Hook to detect and warn about unsaved changes
 * - Warns on browser refresh/close
 * - Warns on navigation away from page
 */
function useUnsavedChanges(_a) {
    var hasUnsavedChanges = _a.hasUnsavedChanges, _b = _a.message, message = _b === void 0 ? "You have unsaved changes. Are you sure you want to leave?" : _b;
    var router = (0, navigation_1.useRouter)();
    // Warn on browser refresh/close
    (0, react_1.useEffect)(function () {
        var handleBeforeUnload = function (e) {
            if (hasUnsavedChanges) {
                e.preventDefault();
                // Chrome requires returnValue to be set
                e.returnValue = message;
                return message;
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return function () {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [hasUnsavedChanges, message]);
    // Warn on navigation (for client-side routing)
    var confirmNavigation = (0, react_1.useCallback)(function () {
        if (hasUnsavedChanges) {
            return window.confirm(message);
        }
        return true;
    }, [hasUnsavedChanges, message]);
    return {
        confirmNavigation: confirmNavigation
    };
}
exports.useUnsavedChanges = useUnsavedChanges;

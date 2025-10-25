"use strict";
exports.__esModule = true;
exports.useIsMobile = void 0;
var React = require("react");
var MOBILE_BREAKPOINT = 768;
function useIsMobile() {
    var _a = React.useState(undefined), isMobile = _a[0], setIsMobile = _a[1];
    React.useEffect(function () {
        var mql = window.matchMedia("(max-width: ".concat(MOBILE_BREAKPOINT - 1, "px)"));
        var onChange = function () {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        };
        mql.addEventListener("change", onChange);
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        return function () { return mql.removeEventListener("change", onChange); };
    }, []);
    return !!isMobile;
}
exports.useIsMobile = useIsMobile;

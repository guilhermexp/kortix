"use client"

exports.__esModule = true
exports.useMobilePanel = exports.MobilePanelProvider = void 0
var react_1 = require("react")
var MobilePanelContext = (0, react_1.createContext)(undefined)
function MobilePanelProvider(_a) {
	var children = _a.children
	var _b = (0, react_1.useState)(null)
	var activePanel = _b[0]
	var setActivePanel = _b[1]
	return (
		<MobilePanelContext.Provider
			value={{ activePanel: activePanel, setActivePanel: setActivePanel }}
		>
			{children}
		</MobilePanelContext.Provider>
	)
}
exports.MobilePanelProvider = MobilePanelProvider
function useMobilePanel() {
	var context = (0, react_1.useContext)(MobilePanelContext)
	if (!context) {
		throw new Error("useMobilePanel must be used within a MobilePanelProvider")
	}
	return context
}
exports.useMobilePanel = useMobilePanel

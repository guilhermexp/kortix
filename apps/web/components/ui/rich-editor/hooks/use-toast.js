exports.__esModule = true
exports.useToast = void 0
var sonner_1 = require("sonner")
function useToast() {
	var toast = (_a) => {
		var title = _a.title
		var description = _a.description
		var variant = _a.variant
		if (variant === "destructive") {
			sonner_1.toast.error(title, {
				description: description,
			})
		} else {
			sonner_1.toast.success(title, {
				description: description,
			})
		}
	}
	return { toast: toast }
}
exports.useToast = useToast

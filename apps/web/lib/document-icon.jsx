exports.__esModule = true
exports.getDocumentIcon = void 0
var constants_1 = require("@repo/ui/memory-graph/constants")
var icons_1 = require("@ui/assets/icons")
var lucide_react_1 = require("lucide-react")
var getDocumentIcon = (type, className) => {
	var iconProps = {
		className: className,
		style: { color: constants_1.colors.text.muted },
	}
	switch (type) {
		case "google_doc":
			return <icons_1.GoogleDocs {...iconProps} />
		case "google_sheet":
			return <icons_1.GoogleSheets {...iconProps} />
		case "google_slide":
			return <icons_1.GoogleSlides {...iconProps} />
		case "google_drive":
			return <icons_1.GoogleDrive {...iconProps} />
		case "notion":
		case "notion_doc":
			return <icons_1.NotionDoc {...iconProps} />
		case "word":
		case "microsoft_word":
			return <icons_1.MicrosoftWord {...iconProps} />
		case "excel":
		case "microsoft_excel":
			return <icons_1.MicrosoftExcel {...iconProps} />
		case "powerpoint":
		case "microsoft_powerpoint":
			return <icons_1.MicrosoftPowerpoint {...iconProps} />
		case "onenote":
		case "microsoft_onenote":
			return <icons_1.MicrosoftOneNote {...iconProps} />
		case "onedrive":
			return <icons_1.OneDrive {...iconProps} />
		case "pdf":
			return <icons_1.PDF {...iconProps} />
		default:
			return <lucide_react_1.FileText {...iconProps} />
	}
}
exports.getDocumentIcon = getDocumentIcon

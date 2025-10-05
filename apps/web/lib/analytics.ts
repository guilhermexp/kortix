export const analytics = {
	userSignedOut: () => {},
	tourStarted: () => {},
	tourCompleted: () => {},
	tourSkipped: () => {},

	memoryAdded: (_props: {
		type: "note" | "link" | "file"
		project_id?: string
		content_length?: number
		file_size?: number
		file_type?: string
	}) => {},

	memoryDetailOpened: () => {},

	projectCreated: () => {},

	newChatStarted: () => {},
	chatHistoryViewed: () => {},
	chatDeleted: () => {},

	viewModeChanged: (_mode: "graph" | "list") => {},

	documentCardClicked: () => {},

	billingViewed: () => {},
	upgradeInitiated: () => {},
	upgradeCompleted: () => {},
	billingPortalOpened: () => {},

	connectionAdded: (_provider: string) => {},
	connectionDeleted: () => {},
	connectionAuthStarted: () => {},
	connectionAuthCompleted: () => {},
	connectionAuthFailed: () => {},

	mcpViewOpened: () => {},
	mcpInstallCmdCopied: () => {},

	extensionInstallClicked: () => {},
}

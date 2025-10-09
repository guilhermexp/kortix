// Enhanced glass-morphism color palette
export const colors = {
	background: {
		primary: "#0f1419", // Deep dark blue-gray
		secondary: "#1a1f29", // Slightly lighter
		accent: "#252a35", // Card backgrounds
	},
	document: {
		primary: "rgba(255, 255, 255, 0.04)", // Subtle glass white
		secondary: "rgba(255, 255, 255, 0.08)", // More visible
		accent: "rgba(255, 255, 255, 0.12)", // Hover state
		border: "rgba(255, 255, 255, 0.15)", // Sharp borders
		glow: "rgba(147, 197, 253, 0.25)", // Blue glow for interaction
	},
	memory: {
		primary: "rgba(147, 197, 253, 0.05)", // Subtle glass blue
		secondary: "rgba(147, 197, 253, 0.10)", // More visible
		accent: "rgba(147, 197, 253, 0.15)", // Hover state
		border: "rgba(147, 197, 253, 0.20)", // Sharp borders
		glow: "rgba(147, 197, 253, 0.30)", // Blue glow for interaction
	},
	connection: {
		weak: "rgba(148, 163, 184, 0)", // Very subtle
		memory: "rgba(148, 163, 184, 0.15)", // Very subtle
		medium: "rgba(148, 163, 184, 0.08)", // Medium visibility
		strong: "rgba(148, 163, 184, 0.20)", // Strong connection
	},
	text: {
		primary: "#ffffff", // Pure white
		secondary: "#e2e8f0", // Light gray
		muted: "#94a3b8", // Medium gray
	},
	accent: {
		primary: "rgba(59, 130, 246, 0.7)", // Clean blue
		secondary: "rgba(99, 102, 241, 0.6)", // Clean purple
		glow: "rgba(147, 197, 253, 0.6)", // Subtle glow
		amber: "rgba(251, 165, 36, 0.8)", // Amber for expiring
		emerald: "rgba(16, 185, 129, 0.4)", // Emerald for new
	},
	status: {
		forgotten: "rgba(220, 38, 38, 0.15)", // Red for forgotten
		expiring: "rgba(251, 165, 36, 0.8)", // Amber for expiring soon
		new: "rgba(16, 185, 129, 0.4)", // Emerald for new memories
	},
	relations: {
		updates: "rgba(147, 77, 253, 0.5)", // purple
		extends: "rgba(16, 185, 129, 0.5)", // green
		derives: "rgba(147, 197, 253, 0.5)", // blue
	},
};

export const LAYOUT_CONSTANTS = {
	centerX: 400,
	centerY: 300,
	clusterRadius: 150, // Memory "bubble" size around a doc - smaller bubble
	spaceSpacing: 400, // How far apart the *spaces* (groups of docs) sit - reduced for better visualization
	documentSpacing: 250, // How far the first doc in a space sits from its space-centre - reduced for better visualization
	minDocDist: 200, // Minimum distance two documents in the **same space** are allowed to be - reduced for better visualization
	memoryClusterRadius: 150,
};

// Graph view settings
export const GRAPH_SETTINGS = {
	console: {
		initialZoom: 0.8, // Higher zoom for console - better overview
		initialPanX: 0,
		initialPanY: 0,
	},
	consumer: {
		initialZoom: 0.5, // Changed from 0.1 to 0.5 for better initial visibility
		initialPanX: 400, // Pan towards center to compensate for larger layout
		initialPanY: 300, // Pan towards center to compensate for larger layout
	},
};

// Responsive positioning for different app variants
export const POSITIONING = {
	console: {
		legend: {
			desktop: "bottom-4 right-4",
			mobile: "bottom-4 right-4",
		},
		loadingIndicator: "top-20 right-4",

		spacesSelector: "top-4 left-4",
		viewToggle: "", // Not used in console
		nodeDetail: "top-4 right-4",
	},
	consumer: {
		legend: {
			desktop: "top-18 right-4",
			mobile: "bottom-[180px] left-4",
		},
		loadingIndicator: "top-20 right-4",

		spacesSelector: "", // Hidden in consumer
		viewToggle: "top-4 right-4", // Consumer has view toggle
		nodeDetail: "top-4 right-4",
	},
};

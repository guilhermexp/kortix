"use client"

exports.__esModule = true
exports.useProjectName = void 0
var react_query_1 = require("@tanstack/react-query")
var react_1 = require("react")
var stores_1 = require("@/stores")
/**
 * Returns the display name of the currently selected project.
 * Falls back to the containerTag / id if a matching project record
 * hasn’t been fetched yet.
 */
function useProjectName() {
	var selectedProject = (0, stores_1.useProject)().selectedProject
	var queryClient = (0, react_query_1.useQueryClient)()
	// This query is populated by ProjectsView – we just read from the cache.
	var projects = queryClient.getQueryData(["projects"])
	return (0, react_1.useMemo)(() => {
		var _a
		if (selectedProject === "sm_project_default") return "All Projects"
		var found =
			projects === null || projects === void 0
				? void 0
				: projects.find((p) => p.containerTag === selectedProject)
		return (_a = found === null || found === void 0 ? void 0 : found.name) !==
			null && _a !== void 0
			? _a
			: selectedProject
	}, [projects, selectedProject])
}
exports.useProjectName = useProjectName

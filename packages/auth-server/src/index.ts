export function authHandler() {
	throw new Error(
		"better-auth has been removed in favor of custom auth implementation.",
	)
}

export async function createAuthContext() {
	return null
}

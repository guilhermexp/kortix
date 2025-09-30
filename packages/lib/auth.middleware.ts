import { createAuthClient } from "better-auth/client"
import {
	adminClient,
	anonymousClient,
	apiKeyClient,
	emailOTPClient,
	magicLinkClient,
	organizationClient,
	usernameClient,
} from "better-auth/client/plugins"
import { BACKEND_URL } from "./env"

export const middlewareAuthClient = createAuthClient({
	baseURL: BACKEND_URL,
	fetchOptions: {
		throw: true,
	},
	plugins: [
		usernameClient(),
		magicLinkClient(),
		emailOTPClient(),
		apiKeyClient(),
		adminClient(),
		organizationClient(),
		anonymousClient(),
	],
})

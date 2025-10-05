export function getWaitlistStatus() {
	return {
		inWaitlist: false,
		accessGranted: true,
		createdAt: new Date().toISOString(),
	}
}

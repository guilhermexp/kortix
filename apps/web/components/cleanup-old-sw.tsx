"use client"

import { useEffect } from "react"

/**
 * Component that cleans up old Service Workers and caches from the legacy Vite PWA.
 * This is needed because the app was migrated from Vite to Next.js, but browsers
 * may still have the old Vite Service Worker registered, causing 404 errors for
 * @vite/client, src/index.tsx, etc.
 */
export function CleanupOldServiceWorker() {
	useEffect(() => {
		async function cleanup() {
			if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
				return
			}

			try {
				// Unregister all service workers
				const registrations = await navigator.serviceWorker.getRegistrations()
				for (const registration of registrations) {
					console.log("[Cleanup] Unregistering old service worker:", registration.scope)
					await registration.unregister()
				}

				// Clear all caches (including Vite/Workbox caches)
				if ("caches" in window) {
					const cacheNames = await caches.keys()
					for (const cacheName of cacheNames) {
						console.log("[Cleanup] Deleting cache:", cacheName)
						await caches.delete(cacheName)
					}
				}

				// If we cleaned up anything, reload to get fresh content
				if (registrations.length > 0) {
					console.log("[Cleanup] Service workers cleaned up, reloading...")
					// Small delay to ensure unregistration completes
					setTimeout(() => {
						window.location.reload()
					}, 100)
				}
			} catch (error) {
				console.error("[Cleanup] Error cleaning up old service worker:", error)
			}
		}

		cleanup()
	}, [])

	return null
}

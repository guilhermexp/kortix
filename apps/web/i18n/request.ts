import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

export const locales = ["en", "pt"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "pt"

export default getRequestConfig(async () => {
	// Get locale from cookie or use default
	const cookieStore = await cookies()
	const localeCookie = cookieStore.get("NEXT_LOCALE")?.value as
		| Locale
		| undefined

	const locale = localeCookie && locales.includes(localeCookie as Locale)
		? localeCookie
		: defaultLocale

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	}
})

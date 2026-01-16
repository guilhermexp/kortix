"use client"

import { useLocale } from "next-intl"
import { useTransition } from "react"
import { setLocale } from "@/i18n/actions"
import { locales, type Locale } from "@/i18n/request"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select"
import { Languages } from "lucide-react"

const languageNames: Record<Locale, string> = {
	en: "English",
	pt: "Português",
}

export function LanguageSwitcher() {
	const locale = useLocale() as Locale
	const [isPending, startTransition] = useTransition()

	const handleChange = (newLocale: Locale) => {
		startTransition(async () => {
			await setLocale(newLocale)
			// Force a hard reload to apply the new locale
			window.location.reload()
		})
	}

	return (
		<div className="flex items-center gap-2">
			<Languages className="h-4 w-4 text-muted-foreground" />
			<Select
				value={locale}
				onValueChange={(value) => handleChange(value as Locale)}
				disabled={isPending}
			>
				<SelectTrigger className="w-[140px]">
					<SelectValue>{languageNames[locale]}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{locales.map((loc) => (
						<SelectItem key={loc} value={loc}>
							{languageNames[loc]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

"use client"

import Menu from "@/components/menu"
import { SkillsSettingsView } from "@/components/views/skills-settings"

export default function SkillsSettingsPage() {
	return (
		<div className="relative h-screen bg-background overflow-hidden touch-none">
			<div className="h-full overflow-y-auto md:ml-18">
				<SkillsSettingsView embedded />
			</div>
			<Menu />
		</div>
	)
}

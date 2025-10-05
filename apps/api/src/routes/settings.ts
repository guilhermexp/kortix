import { SettingsRequestSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"

type SettingsRow = {
	should_llm_filter: boolean | null
	filter_prompt: string | null
	include_items: string[] | null
	exclude_items: string[] | null
	google_drive_custom_key_enabled: boolean | null
	google_drive_client_id: string | null
	google_drive_client_secret: string | null
	notion_custom_key_enabled: boolean | null
	notion_client_id: string | null
	notion_client_secret: string | null
	onedrive_custom_key_enabled: boolean | null
	onedrive_client_id: string | null
	onedrive_client_secret: string | null
}

function mapSettings(row: Partial<SettingsRow> | null | undefined) {
	return {
		shouldLLMFilter: row?.should_llm_filter ?? false,
		filterPrompt: row?.filter_prompt ?? undefined,
		includeItems: row?.include_items ?? [],
		excludeItems: row?.exclude_items ?? [],
		googleDriveCustomKeyEnabled: row?.google_drive_custom_key_enabled ?? false,
		googleDriveClientId: row?.google_drive_client_id ?? undefined,
		googleDriveClientSecret: row?.google_drive_client_secret ?? undefined,
		notionCustomKeyEnabled: row?.notion_custom_key_enabled ?? false,
		notionClientId: row?.notion_client_id ?? undefined,
		notionClientSecret: row?.notion_client_secret ?? undefined,
		onedriveCustomKeyEnabled: row?.onedrive_custom_key_enabled ?? false,
		onedriveClientId: row?.onedrive_client_id ?? undefined,
		onedriveClientSecret: row?.onedrive_client_secret ?? undefined,
	}
}

export async function getSettings(
	client: SupabaseClient,
	organizationId: string,
) {
	const { data, error } = await client
		.from("organization_settings")
		.select("*")
		.eq("org_id", organizationId)
		.maybeSingle()

	if (error) throw error

	return {
		settings: mapSettings(data ?? {}),
	}
}

export async function updateSettings(
	client: SupabaseClient,
	organizationId: string,
	body: unknown,
) {
	const payload = SettingsRequestSchema.parse(body ?? {})

	const updatePayload = {
		should_llm_filter: payload.shouldLLMFilter ?? false,
		filter_prompt: payload.filterPrompt ?? null,
		include_items: payload.includeItems ?? [],
		exclude_items: payload.excludeItems ?? [],
		google_drive_custom_key_enabled:
			payload.googleDriveCustomKeyEnabled ?? false,
		google_drive_client_id: payload.googleDriveClientId ?? null,
		google_drive_client_secret: payload.googleDriveClientSecret ?? null,
		notion_custom_key_enabled: payload.notionCustomKeyEnabled ?? false,
		notion_client_id: payload.notionClientId ?? null,
		notion_client_secret: payload.notionClientSecret ?? null,
		onedrive_custom_key_enabled: payload.onedriveCustomKeyEnabled ?? false,
		onedrive_client_id: payload.onedriveClientId ?? null,
		onedrive_client_secret: payload.onedriveClientSecret ?? null,
	}

	const { error } = await client.from("organization_settings").upsert(
		{
			org_id: organizationId,
			...updatePayload,
		},
		{
			onConflict: "org_id",
		},
	)

	if (error) throw error

	return {
		message: "Settings updated",
		settings: mapSettings(updatePayload),
	}
}

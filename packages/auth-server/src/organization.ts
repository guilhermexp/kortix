import { and, eq } from "drizzle-orm"
import { db } from "./db"
import { organizationMembers, organizations } from "./schema"

export async function ensureDefaultOrganization() {
	const existing = await db.query.organizations.findFirst({
		where: eq(organizations.slug, "default"),
		columns: { id: true },
	})

	if (existing?.id) {
		return existing.id
	}

	try {
		const inserted = await db
			.insert(organizations)
			.values({
				slug: "default",
				name: "Default Organization",
				metadata: {},
			})
			.returning({ id: organizations.id })

		return inserted[0]?.id
	} catch (error) {
		const existing = await db.query.organizations.findFirst({
			where: eq(organizations.slug, "default"),
			columns: { id: true },
		})
		if (existing?.id) {
			return existing.id
		}
		throw error
	}
}

export async function ensureDefaultMembership(userId: string) {
	const orgId = await ensureDefaultOrganization()
	if (!orgId) {
		throw new Error("Failed to resolve default organization")
	}

	const membership = await db.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.organizationId, orgId),
			eq(organizationMembers.userId, userId),
		),
		columns: { id: true },
	})

	if (!membership) {
		try {
			await db.insert(organizationMembers).values({
				organizationId: orgId,
				userId,
				role: "owner",
				isOwner: true,
			})
		} catch (_error) {
			// Ignore duplicate key violations
		}
	}

	return orgId
}

import { relations, sql } from "drizzle-orm"
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"

export const organizations = pgTable(
	"organizations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
	}),
)

export const users = pgTable(
	"users",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		email: text("email").notNull(),
		hashedPassword: text("hashed_password"),
		name: text("name"),
		imageUrl: text("image_url"),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		emailIdx: uniqueIndex("users_email_idx").on(table.email),
	}),
)

export const organizationMembers = pgTable(
	"organization_members",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("member"),
		isOwner: boolean("is_owner").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		orgMemberUnique: uniqueIndex("organization_members_unique").on(
			table.organizationId,
			table.userId,
		),
	}),
)

export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		sessionToken: text("session_token").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		sessionTokenIdx: uniqueIndex("sessions_session_token_idx").on(
			table.sessionToken,
		),
	}),
)

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(organizationMembers),
	sessions: many(sessions),
}))

export const usersRelations = relations(users, ({ many }) => ({
	memberships: many(organizationMembers),
	sessions: many(sessions),
}))

export const organizationMembersRelations = relations(
	organizationMembers,
	({ one }) => ({
		organization: one(organizations, {
			fields: [organizationMembers.organizationId],
			references: [organizations.id],
		}),
		user: one(users, {
			fields: [organizationMembers.userId],
			references: [users.id],
		}),
	}),
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [sessions.organizationId],
		references: [organizations.id],
	}),
}))

export const verification = pgTable(
	"auth_verifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		identifierIdx: index("auth_verifications_identifier_idx").on(
			table.identifier,
		),
		expiresIdx: index("auth_verifications_expires_at_idx").on(table.expiresAt),
	}),
)

export const schema = {
	organizations,
	users,
	organizationMembers,
	sessions,
	verification,
}

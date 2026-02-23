import { existsSync, promises as fs } from "node:fs"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { z } from "zod"

const scopeSchema = z.enum(["project", "user"]).default("project")
const PUBLIC_SCOPE = "project" as const

const createSkillSchema = z.object({
	scope: scopeSchema.optional(),
	name: z.string().min(1).max(120),
	content: z.string().min(1).max(200_000),
})

const updateSkillSchema = z.object({
	scope: scopeSchema.optional(),
	content: z.string().min(1).max(200_000),
})

function resolveProjectRootFromCwd(cwd: string): string {
	// If cwd is monorepo root
	const rootCandidate = resolve(cwd)
	const apiFromRoot = join(rootCandidate, "apps", "api")
	// If cwd is apps/api
	const rootFromApi = resolve(cwd, "..", "..")
	const apiFromNested = join(rootFromApi, "apps", "api")
	if (existsSync(apiFromRoot)) return rootCandidate
	if (existsSync(apiFromNested)) return rootFromApi
	return rootCandidate
}

function resolveScopeBaseDir(): string {
	const projectRoot = resolveProjectRootFromCwd(process.cwd())
	return resolve(projectRoot, ".claude", "skills")
}

function assertInside(baseDir: string, target: string) {
	const rel = relative(baseDir, target)
	if (rel.startsWith("..") || rel.includes(`..${sep}`) || rel === "..") {
		throw new Error("Invalid path traversal")
	}
}

function slugifyName(name: string): string {
	return (
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-_ ]+/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.slice(0, 80) || "skill"
	)
}

function parseSkillDescription(content: string): string | undefined {
	const lines = content.split(/\r?\n/)
	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue
		if (trimmed.startsWith("#")) continue
		return trimmed.slice(0, 240)
	}
	return undefined
}

async function listMarkdownFiles(baseDir: string): Promise<string[]> {
	const files: string[] = []
	async function walk(dir: string) {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = join(dir, entry.name)
			if (entry.isDirectory()) {
				await walk(fullPath)
				continue
			}
			if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
				files.push(fullPath)
			}
		}
	}
	try {
		await walk(baseDir)
	} catch {
		return []
	}
	return files
}

export async function listSkills(query: URLSearchParams) {
	scopeSchema.parse(query.get("scope") ?? "project")
	const baseDir = resolveScopeBaseDir()
	await fs.mkdir(baseDir, { recursive: true })
	const files = await listMarkdownFiles(baseDir)
	const skills = await Promise.all(
		files.map(async (path) => {
			const raw = await fs.readFile(path, "utf8")
			const stat = await fs.stat(path)
			const rel = relative(baseDir, path).replaceAll("\\", "/")
			const name = basename(path, ".md")
			return {
				id: rel,
				name,
				scope: PUBLIC_SCOPE,
				path: rel,
				description: parseSkillDescription(raw),
				updatedAt: stat.mtime.toISOString(),
			}
		}),
	)
	return {
		skills: skills.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
	}
}

export async function getSkill(id: string, query: URLSearchParams) {
	scopeSchema.parse(query.get("scope") ?? "project")
	const baseDir = resolveScopeBaseDir()
	const resolved = resolve(baseDir, id)
	assertInside(baseDir, resolved)
	const content = await fs.readFile(resolved, "utf8")
	const stat = await fs.stat(resolved)
	return {
		skill: {
			id,
			scope: PUBLIC_SCOPE,
			name: basename(resolved, ".md"),
			content,
			updatedAt: stat.mtime.toISOString(),
		},
	}
}

export async function createSkill(body: unknown) {
	const payload = createSkillSchema.parse(body ?? {})
	const baseDir = resolveScopeBaseDir()
	await fs.mkdir(baseDir, { recursive: true })
	const fileName = `${slugifyName(payload.name)}.md`
	const fullPath = resolve(baseDir, fileName)
	assertInside(baseDir, fullPath)
	let alreadyExists = false
	try {
		await fs.access(fullPath)
		alreadyExists = true
	} catch {
		alreadyExists = false
	}
	if (alreadyExists) {
		throw new Error("Skill already exists")
	}
	await fs.writeFile(fullPath, payload.content, "utf8")
	return {
		skill: {
			id: fileName,
			scope: PUBLIC_SCOPE,
			name: basename(fileName, ".md"),
		},
	}
}

export async function updateSkill(id: string, body: unknown) {
	const payload = updateSkillSchema.parse(body ?? {})
	const baseDir = resolveScopeBaseDir()
	const fullPath = resolve(baseDir, id)
	assertInside(baseDir, fullPath)
	await fs.mkdir(baseDir, { recursive: true })
	await fs.writeFile(fullPath, payload.content, "utf8")
	return {
		skill: {
			id,
			scope: PUBLIC_SCOPE,
			name: basename(id, ".md"),
		},
	}
}

export async function deleteSkill(id: string, query: URLSearchParams) {
	scopeSchema.parse(query.get("scope") ?? "project")
	const baseDir = resolveScopeBaseDir()
	const fullPath = resolve(baseDir, id)
	assertInside(baseDir, fullPath)
	await fs.unlink(fullPath)
	return { message: "Skill deleted" }
}

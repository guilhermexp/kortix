/**
 * Daytona Sandbox Service
 *
 * HTTP client for the Daytona self-hosted sandbox API.
 * Provides isolated code execution environments for the AI agent.
 */

type SandboxEnv = {
	DAYTONA_API_KEY: string
	DAYTONA_SERVER_URL: string
	DAYTONA_TARGET?: string
}

type SandboxInfo = {
	id: string
	state: string
	[key: string]: unknown
}

type ExecuteResult = {
	exitCode: number
	result: string
}

type FileInfo = {
	name: string
	isDir: boolean
	size: number
	modTime: string
	mode: string
}

async function request(
	env: SandboxEnv,
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const url = `${env.DAYTONA_SERVER_URL}${path}`
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${env.DAYTONA_API_KEY}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	})
	if (!res.ok) {
		const body = await res.text().catch(() => "")
		throw new Error(
			`Daytona API ${res.status} ${res.statusText}: ${body}`.slice(0, 500),
		)
	}
	return res
}

export async function createSandbox(
	env: SandboxEnv,
	options?: {
		cpu?: number
		memory?: number
		disk?: number
		image?: string
		envVars?: Record<string, string>
		autoStopMinutes?: number
	},
): Promise<SandboxInfo> {
	const body: Record<string, unknown> = {}
	if (options?.cpu) body.cpu = options.cpu
	if (options?.memory) body.memory = options.memory
	if (options?.disk) body.disk = options.disk
	if (options?.image) body.snapshot = options.image
	if (options?.envVars) body.env = options.envVars
	if (env.DAYTONA_TARGET) body.target = env.DAYTONA_TARGET

	const res = await request(env, "/sandbox", {
		method: "POST",
		body: JSON.stringify(body),
	})
	const sandbox = (await res.json()) as SandboxInfo

	// Wait for sandbox to be ready (poll up to 30s)
	const maxWait = 30_000
	const interval = 1_000
	const start = Date.now()
	let state = sandbox.state

	while (state !== "started" && Date.now() - start < maxWait) {
		await new Promise((r) => setTimeout(r, interval))
		const info = await getSandbox(env, sandbox.id)
		state = info.state
		if (state === "error") {
			throw new Error(`Sandbox ${sandbox.id} failed to start`)
		}
	}

	if (state !== "started") {
		throw new Error(
			`Sandbox ${sandbox.id} did not start within ${maxWait / 1000}s (state: ${state})`,
		)
	}

	// Set auto-stop if requested
	if (options?.autoStopMinutes) {
		await request(
			env,
			`/sandbox/${sandbox.id}/autostop/${options.autoStopMinutes}`,
			{ method: "POST" },
		)
	}

	return { ...sandbox, state }
}

export async function getSandbox(
	env: SandboxEnv,
	sandboxId: string,
): Promise<SandboxInfo> {
	const res = await request(env, `/sandbox/${sandboxId}`)
	return (await res.json()) as SandboxInfo
}

export async function destroySandbox(
	env: SandboxEnv,
	sandboxId: string,
): Promise<void> {
	await request(env, `/sandbox/${sandboxId}`, { method: "DELETE" })
}

export async function executeCommand(
	env: SandboxEnv,
	sandboxId: string,
	command: string,
	options?: { workingDir?: string; timeout?: number },
): Promise<ExecuteResult> {
	const body: Record<string, unknown> = { command }
	if (options?.workingDir) body.cwd = options.workingDir
	if (options?.timeout) body.timeout = options.timeout

	const res = await request(
		env,
		`/toolbox/${sandboxId}/toolbox/process/execute`,
		{
			method: "POST",
			body: JSON.stringify(body),
		},
	)
	return (await res.json()) as ExecuteResult
}

export async function uploadFile(
	env: SandboxEnv,
	sandboxId: string,
	filePath: string,
	content: string,
): Promise<void> {
	// Write content to sandbox via execute (simpler than multipart upload)
	const escaped = content.replace(/'/g, "'\\''")
	await executeCommand(
		env,
		sandboxId,
		`mkdir -p "$(dirname '${filePath}')" && cat > '${filePath}' << 'KORTIX_EOF'\n${escaped}\nKORTIX_EOF`,
	)
}

export async function downloadFile(
	env: SandboxEnv,
	sandboxId: string,
	filePath: string,
): Promise<string> {
	const res = await request(
		env,
		`/toolbox/${sandboxId}/toolbox/files/download?path=${encodeURIComponent(filePath)}`,
	)
	return await res.text()
}

export async function listFiles(
	env: SandboxEnv,
	sandboxId: string,
	path = "/home/daytona",
): Promise<FileInfo[]> {
	const res = await request(
		env,
		`/toolbox/${sandboxId}/toolbox/files?path=${encodeURIComponent(path)}`,
	)
	return (await res.json()) as FileInfo[]
}

export async function gitClone(
	env: SandboxEnv,
	sandboxId: string,
	url: string,
	options?: { path?: string; branch?: string },
): Promise<void> {
	const body: Record<string, unknown> = {
		url,
		path: options?.path ?? "/home/daytona/repo",
	}
	if (options?.branch) body.branch = options.branch

	await request(env, `/toolbox/${sandboxId}/toolbox/git/clone`, {
		method: "POST",
		body: JSON.stringify(body),
	})
}

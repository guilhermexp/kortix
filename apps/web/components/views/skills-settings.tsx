"use client"

import { Button } from "@repo/ui/components/button"
import { useEffect, useMemo, useState } from "react"

type SkillItem = {
	id: string
	name: string
	scope: "project"
	path: string
	description?: string
	updatedAt: string
}

type SkillDetail = {
	id: string
	scope: "project"
	name: string
	content: string
	updatedAt: string
}

export function SkillsSettingsView({ embedded = false }: { embedded?: boolean }) {
	const scope = "project" as const
	const [skills, setSkills] = useState<SkillItem[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [content, setContent] = useState("")
	const [name, setName] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const selectedSkill = useMemo(
		() => skills.find((item) => item.id === selectedId) ?? null,
		[selectedId, skills],
	)

	const loadSkills = async (nextScope: "project") => {
		setIsLoading(true)
		setError(null)
		try {
			const res = await fetch(`/v3/skills?scope=${nextScope}`, {
				credentials: "include",
			})
			if (!res.ok) {
				throw new Error("Falha ao carregar skills")
			}
			const payload = (await res.json()) as { skills?: SkillItem[] }
			const list = Array.isArray(payload.skills) ? payload.skills : []
			setSkills(list)
			if (!list.some((item) => item.id === selectedId)) {
				setSelectedId(list[0]?.id ?? null)
			}
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "Erro")
		} finally {
			setIsLoading(false)
		}
	}

	const loadSkillDetail = async (id: string, nextScope: "project") => {
		try {
			const res = await fetch(
				`/v3/skills/${encodeURIComponent(id)}?scope=${nextScope}`,
				{
					credentials: "include",
				},
			)
			if (!res.ok) throw new Error("Falha ao abrir skill")
			const payload = (await res.json()) as { skill?: SkillDetail }
			const detail = payload.skill
			if (!detail) throw new Error("Skill inválida")
			setContent(detail.content)
			setName(detail.name)
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "Erro")
		}
	}

	useEffect(() => {
		void loadSkills(scope)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scope])

	useEffect(() => {
		if (!selectedId) {
			setContent("")
			setName("")
			return
		}
		void loadSkillDetail(selectedId, scope)
	}, [selectedId, scope])

	const handleCreate = async () => {
		const trimmedName = name.trim()
		if (!trimmedName) return
		setIsSaving(true)
		setError(null)
		try {
			const res = await fetch("/v3/skills", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					scope,
					name: trimmedName,
					content:
						content.trim() ||
						`# ${trimmedName}\n\nDescreva aqui as instruções da skill.`,
				}),
			})
			if (!res.ok) throw new Error("Falha ao criar skill")
			await loadSkills(scope)
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "Erro")
		} finally {
			setIsSaving(false)
		}
	}

	const handleSave = async () => {
		if (!selectedId) return
		setIsSaving(true)
		setError(null)
		try {
			const res = await fetch(`/v3/skills/${encodeURIComponent(selectedId)}`, {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ scope, content }),
			})
			if (!res.ok) throw new Error("Falha ao salvar skill")
			await loadSkills(scope)
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "Erro")
		} finally {
			setIsSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!selectedId) return
		setIsSaving(true)
		setError(null)
		try {
			const res = await fetch(
				`/v3/skills/${encodeURIComponent(selectedId)}?scope=${scope}`,
				{
					method: "DELETE",
					credentials: "include",
				},
			)
			if (!res.ok) throw new Error("Falha ao remover skill")
			setSelectedId(null)
			await loadSkills(scope)
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "Erro")
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div
			className={`bg-background ${embedded ? "min-h-full p-6 md:p-8" : "min-h-screen p-6 md:p-10"}`}
		>
			<div className="mx-auto max-w-6xl">
				<div className="mb-6 flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold text-foreground">Skills</h1>
						<p className="text-sm text-muted-foreground">
							Gerencie skills do projeto para comandos de agente.
						</p>
					</div>
				</div>

				{error ? (
					<div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						{error}
					</div>
				) : null}

				<div className="grid gap-4 md:grid-cols-[320px_1fr]">
					<div className="rounded-xl border border-border bg-card p-3">
						<div className="mb-2 flex items-center gap-2">
							<input
								className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
								onChange={(e) => setName(e.target.value)}
								placeholder="Nome da nova skill"
								value={name}
							/>
							<Button
								disabled={isSaving || !name.trim()}
								onClick={handleCreate}
								size="sm"
							>
								Criar
							</Button>
						</div>

						<div className="max-h-[65vh] space-y-1 overflow-auto">
							{isLoading ? (
								<div className="px-2 py-3 text-sm text-muted-foreground">
									Carregando...
								</div>
							) : skills.length === 0 ? (
								<div className="px-2 py-3 text-sm text-muted-foreground">
									Nenhuma skill encontrada.
								</div>
							) : (
								skills.map((item) => (
									<button
										className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
											item.id === selectedId
												? "bg-primary/15 text-foreground"
												: "hover:bg-muted text-muted-foreground"
										}`}
										key={item.id}
										onClick={() => setSelectedId(item.id)}
										type="button"
									>
										<div className="font-medium">{item.name}</div>
										<div className="truncate text-xs opacity-70">{item.path}</div>
									</button>
								))
							)}
						</div>
					</div>

					<div className="rounded-xl border border-border bg-card p-3">
						{selectedSkill ? (
							<>
								<div className="mb-2 flex items-center justify-between">
									<div>
										<div className="font-medium text-foreground">
											{selectedSkill.name}
										</div>
										<div className="text-xs text-muted-foreground">
											{selectedSkill.path}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											disabled={isSaving}
											onClick={handleDelete}
											size="sm"
											variant="outline"
										>
											Excluir
										</Button>
										<Button disabled={isSaving} onClick={handleSave} size="sm">
											Salvar
										</Button>
									</div>
								</div>
								<textarea
									className="h-[68vh] w-full resize-none rounded-md border border-border bg-background p-3 text-sm text-foreground"
									onChange={(e) => setContent(e.target.value)}
									value={content}
								/>
							</>
						) : (
							<div className="px-2 py-3 text-sm text-muted-foreground">
								Selecione uma skill para editar.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

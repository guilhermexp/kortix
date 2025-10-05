"use client"

import { completePasswordReset, requestPasswordReset } from "@lib/auth"
import { LogoFull } from "@repo/ui/assets/Logo"
import { Button } from "@ui/components/button"
import { Input } from "@ui/components/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

function classNames(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ")
}

export default function ResetPasswordPage() {
	const searchParams = useSearchParams()
	const router = useRouter()
	const initialToken = searchParams.get("token") ?? ""

	const [mode, setMode] = useState<"request" | "complete">(
		initialToken ? "complete" : "request",
	)
	const [email, setEmail] = useState("")
	const [token, setToken] = useState(initialToken)
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const [message, setMessage] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (initialToken) {
			setMode("complete")
			setToken(initialToken)
		}
	}, [initialToken])

	async function handleRequestSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setMessage(null)

		if (!email) {
			setError("Informe um email válido")
			return
		}

		setIsLoading(true)
		try {
			await requestPasswordReset(email)
			setMessage(
				"Se o email existir, enviamos instruções para redefinir a senha.",
			)
			setEmail("")
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Não foi possível enviar o email",
			)
		} finally {
			setIsLoading(false)
		}
	}

	async function handleResetSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setMessage(null)

		if (!token) {
			setError("Token inválido")
			return
		}

		if (!password || password.length < 6) {
			setError("A nova senha deve ter pelo menos 6 caracteres")
			return
		}

		if (password !== confirmPassword) {
			setError("As senhas informadas não coincidem")
			return
		}

		setIsLoading(true)
		try {
			await completePasswordReset({ token, password })
			setMessage("Senha atualizada! Faça login novamente.")
			setPassword("")
			setConfirmPassword("")
			setToken("")
			router.push("/login")
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Não foi possível redefinir a senha",
			)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<section className="min-h-screen flex flex-col lg:grid lg:grid-cols-12 items-center justify-center p-6 md:p-10 lg:px-[5rem] lg:py-[3rem] gap-6 lg:gap-[5rem] bg-[#0f1419] text-white">
			<div className="hidden lg:flex lg:col-span-6 flex-col gap-6">
				<LogoFull className="w-48 text-white" />
				<h1 className="text-4xl font-semibold">
					Recuperar acesso ao supermemory
				</h1>
				<p className="text-white/70 max-w-lg">
					Gere um link de redefinição por email ou informe o token recebido para
					criar uma nova senha.
				</p>
			</div>

			<div className="w-full max-w-md lg:col-span-5 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-xl font-semibold">
						{mode === "request"
							? "Enviar link de recuperação"
							: "Definir nova senha"}
					</h2>
					<button
						className="text-sm text-white/70 hover:text-white"
						onClick={() => {
							setError(null)
							setMessage(null)
							setMode(mode === "request" ? "complete" : "request")
						}}
						type="button"
					>
						{mode === "request" ? "Já tenho um token" : "Preciso de um email"}
					</button>
				</div>

				{mode === "request" ? (
					<form className="space-y-4" onSubmit={handleRequestSubmit}>
						<div className="space-y-2">
							<label className="text-sm text-white/70" htmlFor="reset-email">
								Email
							</label>
							<Input
								className="bg-white/10 border-white/20 text-white"
								id="reset-email"
								onChange={(event) => setEmail(event.target.value)}
								placeholder="seu@email.com"
								required
								type="email"
								value={email}
							/>
						</div>

						{error && <p className="text-sm text-red-400">{error}</p>}
						{message && <p className="text-sm text-emerald-400">{message}</p>}

						<Button
							className="w-full bg-white text-black hover:bg-white/90"
							disabled={isLoading}
							type="submit"
						>
							{isLoading ? "Enviando..." : "Enviar instruções"}
						</Button>
					</form>
				) : (
					<form className="space-y-4" onSubmit={handleResetSubmit}>
						<div className="space-y-2">
							<label className="text-sm text-white/70" htmlFor="reset-token">
								Token
							</label>
							<Input
								className="bg-white/10 border-white/20 text-white"
								id="reset-token"
								onChange={(event) => setToken(event.target.value)}
								placeholder="Cole o token recebido por email"
								required
								value={token}
							/>
						</div>

						<div className="space-y-2">
							<label className="text-sm text-white/70" htmlFor="reset-password">
								Nova senha
							</label>
							<Input
								className="bg-white/10 border-white/20 text-white"
								id="reset-password"
								minLength={6}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="Mínimo de 6 caracteres"
								required
								type="password"
								value={password}
							/>
						</div>

						<div className="space-y-2">
							<label
								className="text-sm text-white/70"
								htmlFor="reset-confirm-password"
							>
								Confirmar nova senha
							</label>
							<Input
								className="bg-white/10 border-white/20 text-white"
								id="reset-confirm-password"
								minLength={6}
								onChange={(event) => setConfirmPassword(event.target.value)}
								placeholder="Repita a nova senha"
								required
								type="password"
								value={confirmPassword}
							/>
						</div>

						{error && <p className="text-sm text-red-400">{error}</p>}
						{message && <p className="text-sm text-emerald-400">{message}</p>}

						<Button
							className={classNames(
								"w-full bg-white text-black hover:bg-white/90",
								isLoading && "opacity-80",
							)}
							disabled={isLoading}
							type="submit"
						>
							{isLoading ? "Atualizando..." : "Atualizar senha"}
						</Button>
					</form>
				)}

				<div className="mt-6 text-xs text-white/50">
					<p>
						<Link className="underline" href="/login">
							Voltar para o login
						</Link>
					</p>
				</div>
			</div>
		</section>
	)
}

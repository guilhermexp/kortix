"use client";

import { signIn, signUp } from "@lib/auth";
import { LogoFull } from "@repo/ui/assets/Logo";
import { Button } from "@repo/ui/components/button";
import { HeadingH1Medium } from "@repo/ui/text/heading/heading-h1-medium";
import { HeadingH3Medium } from "@repo/ui/text/heading/heading-h3-medium";
import { Input } from "@ui/components/input";
import Link from "next/link";
import { useState } from "react";

export function LoginPage() {
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);

		if (!email || !password) {
			setError("Email and password are required");
			return;
		}

		setIsLoading(true);

		try {
			if (mode === "sign-up") {
				await signUp({ email, password, name: name.trim() || undefined });
			} else {
				await signIn({ email, password });
			}
			window.location.href = "/";
		} catch (err) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError("Failed to authenticate");
			}
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<section className="min-h-screen flex flex-col lg:grid lg:grid-cols-12 items-center justify-center p-6 md:p-10 lg:px-[5rem] lg:py-[3rem] gap-6 lg:gap-[5rem] bg-[#0f1419] text-white">
			<div className="hidden lg:flex lg:col-span-6 flex-col gap-6">
				<LogoFull className="w-48 text-white" />
				<HeadingH1Medium>Sua memória, acessível e privada.</HeadingH1Medium>
				<p className="text-white/70 max-w-lg">
					Crie uma conta ou entre com seu email e senha para começar a usar o
					supermemory self-hosted.
				</p>
			</div>

			<div className="w-full max-w-md lg:col-span-5 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-xl font-semibold">
						{mode === "sign-in" ? "Entrar" : "Criar conta"}
					</h2>
					<button
						type="button"
						className="text-sm text-white/70 hover:text-white"
						onClick={() => {
							setMode(mode === "sign-in" ? "sign-up" : "sign-in");
							setError(null);
						}}
					>
						{mode === "sign-in" ? "Criar uma conta" : "Já tenho conta"}
					</button>
				</div>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<label className="text-sm text-white/70" htmlFor="email">
							Email
						</label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
							placeholder="seu@email.com"
							autoComplete="email"
							className="bg-white/10 border-white/20 text-white"
						/>
					</div>

					{mode === "sign-up" && (
						<div className="space-y-2">
							<label className="text-sm text-white/70" htmlFor="name">
								Nome
							</label>
							<Input
								id="name"
								type="text"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Seu nome"
								className="bg-white/10 border-white/20 text-white"
							/>
						</div>
					)}

					<div className="space-y-2">
						<label className="text-sm text-white/70" htmlFor="password">
							Senha
						</label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							required
							placeholder="Sua senha"
							autoComplete={
								mode === "sign-in" ? "current-password" : "new-password"
							}
							className="bg-white/10 border-white/20 text-white"
						/>
						{mode === "sign-in" && (
							<div className="text-xs text-right">
								<Link
									className="text-white/60 hover:text-white"
									href="/reset-password"
								>
									Esqueceu a senha?
								</Link>
							</div>
						)}
					</div>

					{error && <p className="text-sm text-red-400">{error}</p>}

					<Button
						type="submit"
						className="w-full bg-white text-black hover:bg-white/90"
						disabled={isLoading}
					>
						{isLoading
							? "Processando..."
							: mode === "sign-in"
								? "Entrar"
								: "Criar conta"}
					</Button>
				</form>

				<div className="mt-6 text-xs text-white/50">
					<HeadingH3Medium className="text-sm mb-2 text-white">
						Self-host login simples
					</HeadingH3Medium>
					<p>
						Esqueceu a senha?{" "}
						<Link className="underline" href="/reset-password">
							Recupere o acesso por aqui
						</Link>
						.
					</p>
					<p className="mt-2">
						Precisa de ajuda?{" "}
						<Link className="underline" href="mailto:support@your-domain.com">
							support@your-domain.com
						</Link>
					</p>
				</div>
			</div>
		</section>
	);
}

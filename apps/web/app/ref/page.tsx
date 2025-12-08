"use client"

import { APP_URL } from "@lib/env"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card"
import { ShareIcon } from "lucide-react"
import Link from "next/link"

export default function ReferralHomePage() {
	return (
		<div className="min-h-screen flex items-center justify-center p-4 bg-background">
			<Card className="max-w-md w-full bg-[#1a1f2a] border-white/10">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
						<ShareIcon className="w-8 h-8 text-orange-500" />
					</div>
					<CardTitle className="text-2xl font-bold text-white">
						Missing Referral Code
					</CardTitle>
					<CardDescription className="text-white/60 mt-2">
						It looks like you're missing a referral code. Get one from a friend
						or join directly!
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="bg-background rounded-lg p-4 border border-white/10">
							<h3 className="text-white font-semibold mb-2">
								What is Kortix?
							</h3>
							<p className="text-white/70 text-sm leading-relaxed">
								Kortix is an AI-powered personal knowledge base that helps
								you store, organize, and interact with all your digital
								memories.
							</p>
						</div>

						<div className="text-center">
							<Link
								className="text-orange-500 hover:text-orange-400 text-sm underline"
								href={APP_URL}
							>
								Learn more about Kortix
							</Link>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

"use client"

import { APP_URL } from "@lib/env"
import { Button } from "@ui/components/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card"
import { CheckIcon, CopyIcon, LoaderIcon, ShareIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export default function ReferralPage() {
	const params = useParams()
	const referralCode = params.code as string

	const [isLoading, setIsLoading] = useState(true)
	const [referralData, setReferralData] = useState<{
		referrerName?: string
		valid: boolean
	} | null>(null)
	const [copiedLink, setCopiedLink] = useState(false)

	const appOrigin = APP_URL.replace(/\/$/, "")
	const referralLink = `${appOrigin}/ref/${referralCode}`

	// Verify referral code and get referrer info
	useEffect(() => {
		async function checkReferral() {
			if (!referralCode) {
				setIsLoading(false)
				return
			}

			try {
				// Check if referral code is valid
				// For now, we'll assume it's valid - in the future this should call an API
				setReferralData({
					valid: true,
					referrerName: "A Kortix user", // Placeholder - should come from API
				})
			} catch (error) {
				console.error("Error checking referral:", error)
				setReferralData({ valid: false })
			} finally {
				setIsLoading(false)
			}
		}

		checkReferral()
	}, [referralCode])

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(referralLink)
			setCopiedLink(true)
			toast.success("Referral link copied!")
			setTimeout(() => setCopiedLink(false), 2000)
		} catch (_error) {
			toast.error("Failed to copy link")
		}
	}

	const handleShare = () => {
		if (navigator.share) {
			navigator.share({
				title: "Join Kortix",
				text: "I'm excited about Kortix - it's going to change how we store and interact with our memories!",
				url: referralLink,
			})
		} else {
			handleCopyLink()
		}
	}

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4 bg-background">
				<div className="flex flex-col items-center gap-4">
					<LoaderIcon className="w-8 h-8 text-orange-500 animate-spin" />
					<p className="text-white/60">Checking invitation...</p>
				</div>
			</div>
		)
	}

	if (!referralData?.valid) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4 bg-background">
				<Card className="max-w-md w-full bg-[#1a1f2a] border-white/10">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl font-bold text-white">
							Invalid Referral
						</CardTitle>
						<CardDescription className="text-white/60 mt-2">
							This referral link is not valid or has expired.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="text-center">
							<Button asChild className="w-full">
								<Link href={APP_URL}>Go to Kortix</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="min-h-screen flex items-center justify-center p-4 bg-background">
			<div className="max-w-lg w-full space-y-6">
				{/* Welcome Card */}
				<Card className="bg-[#1a1f2a] border-white/10">
					<CardHeader className="text-center">
						<div className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
							<ShareIcon className="w-8 h-8 text-orange-500" />
						</div>
						<CardTitle className="text-2xl font-bold text-white">
							You're invited to Kortix!
						</CardTitle>
						<CardDescription className="text-white/60 mt-2">
							{referralData.referrerName} invited you to join the future of
							memory management.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="bg-background rounded-lg p-4 border border-white/10">
								<h3 className="text-white font-semibold mb-2">
									What is Kortix?
								</h3>
								<p className="text-white/70 text-sm leading-relaxed">
									Kortix is an AI-powered personal knowledge base that helps you
									store, organize, and interact with all your digital memories -
									from documents and links to conversations and ideas.
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

				{/* Share Card */}
				<Card className="bg-[#1a1f2a] border-white/10">
					<CardHeader>
						<CardTitle className="text-lg text-white">
							Share with friends
						</CardTitle>
						<CardDescription className="text-white/60">
							Help others discover Kortix and earn priority access.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							<div className="flex gap-2">
								<div className="flex-1 px-3 py-2 bg-background border border-white/10 rounded-md">
									<p className="text-white/80 text-sm font-mono truncate">
										{referralLink}
									</p>
								</div>
								<Button
									className="shrink-0 border-white/10 hover:bg-white/5"
									onClick={handleCopyLink}
									size="sm"
									variant="outline"
								>
									{copiedLink ? (
										<CheckIcon className="w-4 h-4" />
									) : (
										<CopyIcon className="w-4 h-4" />
									)}
								</Button>
							</div>

							<Button
								className="w-full border-white/10 text-white hover:bg-white/5"
								onClick={handleShare}
								variant="outline"
							>
								<ShareIcon className="w-4 h-4" />
								Share this link
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

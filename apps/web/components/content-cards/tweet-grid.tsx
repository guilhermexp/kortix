"use client"

import { cn } from "@lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Suspense } from "react"
import { Tweet, TweetSkeleton } from "react-tweet"

const tweetGridVariants = cva("max-w-4xl md:max-w-6xl px-2 mx-auto w-full", {
	variants: {
		columns: {
			1: "columns-1",
			2: "sm:columns-2",
			3: "md:columns-3",
			4: "lg:columns-4",
		},
	},
	defaultVariants: {
		columns: 3,
	},
})

const tweetItemVariants = cva("break-inside-avoid w-full", {
	variants: {
		spacing: {
			sm: "mb-2",
			md: "mb-4",
			lg: "mb-6",
		},
	},
	defaultVariants: {
		spacing: "md",
	},
})

export interface TweetGridProps
	extends VariantProps<typeof tweetGridVariants>,
		VariantProps<typeof tweetItemVariants> {
	tweets: string[]
	className?: string
}

function TweetGrid({ tweets, columns, spacing, className }: TweetGridProps) {
	return (
		<div className={cn(tweetGridVariants({ columns }), className)}>
			{tweets.map((tweetId, i) => (
				<div
					key={`${tweetId}-${i}`}
					className={cn(tweetItemVariants({ spacing }), "overflow-hidden")}
				>
					<Suspense fallback={<TweetSkeleton />}>
						<Tweet id={tweetId} />
					</Suspense>
				</div>
			))}
		</div>
	)
}

export { TweetGrid }

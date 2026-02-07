"use client"

import { useFeatureFlags } from "@/hooks/use-feature-flag"
import { Button } from "@ui/components/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table"
import { Switch } from "@ui/components/switch"
import { Plus } from "lucide-react"

export default function FeatureFlagsPage() {
	const { data: flags, isLoading, error } = useFeatureFlags()

	return (
		<div className="container mx-auto py-8 px-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Feature Flags</CardTitle>
							<CardDescription>
								Manage feature flags for controlled rollouts and A/B testing
							</CardDescription>
						</div>
						<Button>
							<Plus className="size-4" />
							Create Flag
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<p className="text-muted-foreground">Loading feature flags...</p>
						</div>
					)}

					{error && (
						<div className="flex items-center justify-center py-8">
							<p className="text-destructive">
								Error loading flags: {error.message}
							</p>
						</div>
					)}

					{!isLoading && !error && flags && flags.length === 0 && (
						<div className="flex items-center justify-center py-8">
							<p className="text-muted-foreground">
								No feature flags yet. Create your first flag to get started.
							</p>
						</div>
					)}

					{!isLoading && !error && flags && flags.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Key</TableHead>
									<TableHead>Description</TableHead>
									<TableHead>Enabled</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{flags.map((flag) => (
									<TableRow key={flag.id}>
										<TableCell className="font-medium">{flag.name}</TableCell>
										<TableCell>
											<code className="text-xs bg-muted px-2 py-1 rounded">
												{flag.key}
											</code>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{flag.description || "—"}
										</TableCell>
										<TableCell>
											<Switch checked={flag.enabled} disabled />
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-2">
												<Button variant="ghost" size="sm">
													Edit
												</Button>
												<Button variant="ghost" size="sm">
													Delete
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

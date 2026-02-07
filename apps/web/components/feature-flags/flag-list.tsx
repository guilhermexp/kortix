"use client"

import { deleteFlag } from "@/lib/feature-flags"
import { Button } from "@ui/components/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FeatureFlag } from "@repo/validation/feature-flags"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FlagToggle } from "./flag-toggle"

interface FlagListProps {
	flags: FeatureFlag[]
	onEdit: (flag: FeatureFlag) => void
}

/**
 * Table component for displaying and managing feature flags
 * Includes edit and delete actions for each flag
 */
export function FlagList({ flags, onEdit }: FlagListProps) {
	const queryClient = useQueryClient()

	const deleteMutation = useMutation({
		mutationFn: async (flagId: string) => {
			return deleteFlag(flagId)
		},
		onSuccess: () => {
			toast.success("Flag deleted successfully")
			queryClient.invalidateQueries({ queryKey: ["feature-flags"] })
		},
		onError: (error) => {
			toast.error("Failed to delete flag", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const handleDelete = (flag: FeatureFlag) => {
		if (window.confirm(`Are you sure you want to delete "${flag.name}"?`)) {
			deleteMutation.mutate(flag.id)
		}
	}

	if (flags.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<p className="text-muted-foreground">
					No feature flags yet. Create your first flag to get started.
				</p>
			</div>
		)
	}

	return (
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
							<FlagToggle flag={flag} />
						</TableCell>
						<TableCell className="text-right">
							<div className="flex items-center justify-end gap-2">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onEdit(flag)}
								>
									<Pencil className="size-4" />
									Edit
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleDelete(flag)}
									disabled={deleteMutation.isPending}
								>
									<Trash2 className="size-4" />
									Delete
								</Button>
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

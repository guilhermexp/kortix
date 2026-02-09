"use client"

import { useState, useEffect, useCallback } from "react"
import type { AvailableModel } from "./council-types"

// In-memory cache
let modelsCache: AvailableModel[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useAvailableModels() {
	const [models, setModels] = useState<AvailableModel[]>(modelsCache || [])
	const [isLoading, setIsLoading] = useState(!modelsCache)
	const [error, setError] = useState<string | null>(null)

	const fetchModels = useCallback(async () => {
		const now = Date.now()

		// Use cache if valid
		if (modelsCache && now - cacheTimestamp < CACHE_TTL) {
			setModels(modelsCache)
			setIsLoading(false)
			return
		}

		setIsLoading(true)
		setError(null)

		try {
			const response = await fetch("/v3/council/models")
			if (!response.ok) {
				throw new Error("Failed to fetch models")
			}

			const data = await response.json()
			const fetchedModels = data.models || []

			// Update cache
			modelsCache = fetchedModels
			cacheTimestamp = now

			setModels(fetchedModels)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error")
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchModels()
	}, [fetchModels])

	return { models, isLoading, error, refetch: fetchModels }
}

"use client"

import { createContext, type ReactNode, useContext } from "react"

type FeatureState = {
	allowed: boolean
	usage: number
	included_usage: number
	balance: number
}

type CheckParams = {
	featureId?: string
	productId?: string
}

type CheckResponse = {
	data: FeatureState
}

type AttachParams = Record<string, unknown>

type AttachResponse = {
	statusCode: number
	data: {
		code: string
		[key: string]: unknown
	}
}

type AutumnContextValue = {
	isLoading: boolean
	customer: {
		features: Record<string, FeatureState>
		products: Array<{ id: string; allowed: boolean }>
		connections: unknown[]
	}
	check: (params: CheckParams) => Promise<CheckResponse>
	attach: (params: AttachParams) => Promise<AttachResponse>
	openBillingPortal: (params?: Record<string, unknown>) => Promise<{ ok: true }>
	track: (event: Record<string, unknown>) => void
}

const unlimitedFeature: FeatureState = {
	allowed: true,
	usage: 0,
	included_usage: 1_000_000,
	balance: 1_000_000,
}

const stubValue: AutumnContextValue = {
	isLoading: false,
	customer: {
		features: {
			memories: { ...unlimitedFeature },
			connections: { ...unlimitedFeature },
		},
		products: [{ id: "consumer_pro", allowed: true }],
		connections: [],
	},
	check: async ({ featureId }) => {
		if (featureId) {
			const match = stubValue.customer.features[featureId]
			if (match) {
				return { data: match }
			}
		}
		return { data: { ...unlimitedFeature } }
	},
	attach: async () => ({
		statusCode: 200,
		data: { code: "product_attached" },
	}),
	openBillingPortal: async () => ({ ok: true }),
	track: () => {},
}

const AutumnContext = createContext<AutumnContextValue>(stubValue)

type ProviderProps = {
	backendUrl?: string
	includeCredentials?: boolean
	children: ReactNode
}

export function AutumnProvider({ children }: ProviderProps) {
	return (
		<AutumnContext.Provider value={stubValue}>
			{children}
		</AutumnContext.Provider>
	)
}

export function useCustomer(): AutumnContextValue {
	return useContext(AutumnContext)
}

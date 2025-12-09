import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export const isSelfHosted = process.env.NEXT_PUBLIC_HOST_ID !== "kortix"

// Re-export web component utilities from centralized module
export * from "./src/utils/web-component-utils"

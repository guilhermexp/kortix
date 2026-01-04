// Force dynamic rendering - disable ISR cache
export const dynamic = "force-dynamic"
export const revalidate = 0

// Import the client component
import HomePage from "./home-client"

// Render the client component properly from the server component
export default function Page() {
	return <HomePage />
}

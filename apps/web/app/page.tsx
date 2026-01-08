// Page can be statically rendered - client component handles data fetching
// Removed force-dynamic to enable Next.js Router Cache and reduce RSC calls

// Import the client component
import HomePage from "./home-client"

// Render the client component properly from the server component
export default function Page() {
	return <HomePage />
}

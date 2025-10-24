/**
 * Lazy Loading Components
 *
 * Provides lazy-loaded versions of heavy editor components
 * for improved initial load performance.
 */

"use client";

import dynamic from "next/dynamic";
import { Suspense, lazy } from "react";
import {
	EditorSkeleton,
	MemoryEntriesSkeleton,
	InlineLoader,
} from "./loading-states";

/**
 * Lazy load the rich editor with loading fallback
 */
export const LazyRichEditor = dynamic(
	() =>
		import("@/components/ui/rich-editor/editor").then((mod) => ({
			default: mod.Editor,
		})),
	{
		loading: () => <EditorSkeleton />,
		ssr: false, // Editor should only render on client
	}
);

/**
 * Lazy load memory entries sidebar
 */
export const LazyMemoryEntriesSidebar = dynamic(
	() =>
		import("./memory-entries-sidebar").then((mod) => ({
			default: mod.MemoryEntriesSidebar,
		})),
	{
		loading: () => <MemoryEntriesSkeleton />,
		ssr: false,
	}
);

/**
 * Lazy load image gallery component
 */
export const LazyImageGallery = dynamic(
	() =>
		import("../memories/image-gallery").then((mod) => ({
			default: mod.default,
		})),
	{
		loading: () => (
			<div className="flex items-center justify-center p-8">
				<InlineLoader />
			</div>
		),
		ssr: false,
	}
);

/**
 * Lazy load markdown content renderer
 */
export const LazyMarkdownContent = dynamic(
	() =>
		import("../markdown-content").then((mod) => ({
			default: mod.default,
		})),
	{
		loading: () => (
			<div className="animate-pulse space-y-2">
				<div className="h-4 bg-white/10 rounded w-3/4" />
				<div className="h-4 bg-white/10 rounded w-full" />
				<div className="h-4 bg-white/10 rounded w-5/6" />
			</div>
		),
	}
);

/**
 * Lazy load chart components (for analytics)
 */
export const LazyChartComponent = dynamic(
	() => import("recharts").then((mod) => mod),
	{
		loading: () => (
			<div className="flex items-center justify-center h-64">
				<InlineLoader />
			</div>
		),
		ssr: false,
	}
);

/**
 * Generic lazy wrapper component
 * Use for any component that needs lazy loading
 */
export function LazyWrapper({
	children,
	fallback,
}: {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}) {
	return (
		<Suspense fallback={fallback || <InlineLoader />}>{children}</Suspense>
	);
}

/**
 * Intersection-based lazy loader
 * Only loads component when it enters viewport
 */
export function IntersectionLazyLoader({
	component: Component,
	fallback,
	threshold = 0.1,
	...props
}: {
	component: React.ComponentType<any>;
	fallback?: React.ReactNode;
	threshold?: number;
	[key: string]: any;
}) {
	const [isVisible, setIsVisible] = React.useState(false);
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ threshold }
		);

		if (ref.current) {
			observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, [threshold]);

	return (
		<div ref={ref}>
			{isVisible ? (
				<Component {...props} />
			) : (
				fallback || (
					<div className="flex items-center justify-center p-4">
						<InlineLoader />
					</div>
				)
			)}
		</div>
	);
}

// Fix: Import React
import React from "react";

/**
 * Code splitting helper
 * Splits code by route or feature
 */
export function createLazyComponent<T extends React.ComponentType<any>>(
	importFunc: () => Promise<{ default: T }>,
	fallback?: React.ReactNode
) {
	const LazyComponent = lazy(importFunc);

	return function LazyComponentWrapper(props: React.ComponentProps<T>) {
		return (
			<Suspense fallback={fallback || <InlineLoader />}>
				<LazyComponent {...props} />
			</Suspense>
		);
	};
}

/**
 * Preload function for lazy components
 * Allows manual preloading of components before they're needed
 */
export function preloadComponent(
	importFunc: () => Promise<any>
): Promise<void> {
	return importFunc().then(() => {});
}

/**
 * Route-based code splitting
 * Automatically splits by route
 */
export const RouteComponents = {
	// Memory routes
	MemoryList: dynamic(() => import("../memory-list-view"), {
		loading: () => <InlineLoader />,
	}),

	// Settings routes
	SettingsProfile: dynamic(() => import("../views/profile"), {
		loading: () => <InlineLoader />,
	}),

	SettingsBilling: dynamic(() => import("../views/billing"), {
		loading: () => <InlineLoader />,
	}),

	SettingsIntegrations: dynamic(() => import("../views/integrations"), {
		loading: () => <InlineLoader />,
	}),

	// Chat route
	ChatView: dynamic(() => import("../views/chat"), {
		loading: () => <InlineLoader />,
	}),
};

/**
 * Bundle analyzer helper
 * Logs bundle sizes in development
 */
export function logBundleInfo(componentName: string, size?: number) {
	if (process.env.NODE_ENV === "development") {
		console.log(
			`[Bundle] ${componentName}${size ? ` - ${(size / 1024).toFixed(2)}KB` : ""}`
		);
	}
}

/**
 * Progressive hydration wrapper
 * Hydrates component progressively for better initial performance
 */
export function ProgressiveHydration({
	children,
	delay = 0,
}: {
	children: React.ReactNode;
	delay?: number;
}) {
	const [shouldHydrate, setShouldHydrate] = React.useState(delay === 0);

	React.useEffect(() => {
		if (delay > 0) {
			const timer = setTimeout(() => setShouldHydrate(true), delay);
			return () => clearTimeout(timer);
		}
	}, [delay]);

	if (!shouldHydrate) {
		return null;
	}

	return <>{children}</>;
}

/**
 * Idle hydration wrapper
 * Hydrates component when browser is idle
 */
export function IdleHydration({ children }: { children: React.ReactNode }) {
	const [shouldHydrate, setShouldHydrate] = React.useState(false);

	React.useEffect(() => {
		if (typeof window === "undefined") return;

		if ("requestIdleCallback" in window) {
			const idleId = requestIdleCallback(() => setShouldHydrate(true));
			return () => cancelIdleCallback(idleId);
		} else {
			// Fallback for browsers without requestIdleCallback
			const timer = setTimeout(() => setShouldHydrate(true), 1);
			return () => clearTimeout(timer);
		}
	}, []);

	if (!shouldHydrate) {
		return null;
	}

	return <>{children}</>;
}

/**
 * Viewport hydration wrapper
 * Only hydrates when component enters viewport
 */
export function ViewportHydration({
	children,
	threshold = 0.1,
}: {
	children: React.ReactNode;
	threshold?: number;
}) {
	const [shouldHydrate, setShouldHydrate] = React.useState(false);
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setShouldHydrate(true);
					observer.disconnect();
				}
			},
			{ threshold }
		);

		if (ref.current) {
			observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, [threshold]);

	return <div ref={ref}>{shouldHydrate ? children : null}</div>;
}

/**
 * Loading States and Skeleton Components for Editor
 *
 * Provides consistent loading states and skeleton screens
 * for better user experience during data fetching.
 */

import { cn } from "@lib/utils";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Editor skeleton loader
 * Shows while the editor is initializing
 */
export function EditorSkeleton() {
  return (
    <div className="h-full w-full flex flex-col bg-background animate-pulse">
      {/* Navigation header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-md bg-muted" />
          <div className="space-y-2">
            <Skeleton className="w-48 h-5 bg-muted" />
            <Skeleton className="w-24 h-3 bg-muted" />
          </div>
        </div>
        <Skeleton className="w-24 h-8 rounded-md bg-muted" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Skeleton className="w-3/4 h-8 bg-muted" />
        <Skeleton className="w-full h-4 bg-muted" />
        <Skeleton className="w-full h-4 bg-muted" />
        <Skeleton className="w-5/6 h-4 bg-muted" />
        <div className="pt-4">
          <Skeleton className="w-2/3 h-4 bg-muted" />
        </div>
        <Skeleton className="w-full h-4 bg-muted" />
        <Skeleton className="w-4/5 h-4 bg-muted" />
      </div>
    </div>
  );
}

/**
 * Document list skeleton
 * Shows while documents are loading
 */
export function DocumentListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border backdrop-blur-sm bg-muted/20 p-4 animate-pulse"
        >
          {/* Preview block (same place/size as real card preview) */}
          <div className="w-full h-28 rounded-md border border-border bg-muted/50 mb-3" />

          {/* Title + description lines */}
          <Skeleton className="h-4 w-3/4 bg-muted" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-3 w-full bg-muted" />
            <Skeleton className="h-3 w-4/5 bg-muted" />
          </div>

          {/* Footer badges row */}
          <div className="flex items-center gap-2 mt-3">
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-5 w-20 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Memory entries sidebar skeleton
 * Shows while memory entries are loading
 */
export function MemoryEntriesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border">
        <Skeleton className="w-32 h-6 bg-muted" />
      </div>

      {/* Entries skeleton */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            className="p-3 rounded-lg border border-border bg-muted/50 animate-pulse"
            key={i}
          >
            <Skeleton className="w-full h-4 bg-muted mb-2" />
            <Skeleton className="w-5/6 h-3 bg-muted mb-2" />
            <Skeleton className="w-4/6 h-3 bg-muted" />
            <div className="flex items-center gap-2 mt-3">
              <Skeleton className="w-12 h-4 bg-muted" />
              <Skeleton className="w-16 h-4 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Inline loading spinner
 * Small spinner for inline loading states
 */
export function InlineLoader({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("w-4 h-4 animate-spin text-blue-500", className)} />
  );
}

/**
 * Full page loader
 * Centered loader for full page loading states
 */
export function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
        {message && <p className="text-sm text-gray-400">{message}</p>}
      </div>
    </div>
  );
}

/**
 * Button loading state
 * Shows loading spinner inside button
 */
export function ButtonLoader({ className }: { className?: string }) {
  return <Loader2 className={cn("w-4 h-4 animate-spin mr-2", className)} />;
}

/**
 * Card skeleton
 * Generic card skeleton for various content types
 */
export function CardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-border bg-muted/50 animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="w-32 h-6 bg-muted" />
        <Skeleton className="w-20 h-8 rounded bg-muted" />
      </div>
      <Skeleton className="w-full h-4 bg-muted" />
      <Skeleton className="w-5/6 h-4 bg-muted" />
      <Skeleton className="w-4/6 h-4 bg-muted" />
    </div>
  );
}

/**
 * Table skeleton
 * Skeleton for table layouts
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-border bg-muted/50">
        <Skeleton className="h-5 bg-muted" />
        <Skeleton className="h-5 bg-muted" />
        <Skeleton className="h-5 bg-muted" />
        <Skeleton className="h-5 bg-muted" />
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          className="grid grid-cols-4 gap-4 p-4 border-b border-border last:border-0 animate-pulse"
          key={i}
        >
          <Skeleton className="h-4 bg-muted" />
          <Skeleton className="h-4 bg-muted" />
          <Skeleton className="h-4 bg-muted" />
          <Skeleton className="h-4 bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * Image placeholder
 * Shows while images are loading
 */
export function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-white/5 animate-pulse",
        className,
      )}
    >
      <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
    </div>
  );
}

/**
 * Empty state component
 * Shows when there's no data to display
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Progress bar component
 * Shows progress for uploads or long operations
 */
export function ProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full h-2 bg-muted rounded-full overflow-hidden",
        className,
      )}
    >
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

/**
 * Pulsing dot indicator
 * Shows active/live state
 */
export function PulsingDot({ className }: { className?: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75",
          className,
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-full h-3 w-3 bg-blue-500",
          className,
        )}
      />
    </span>
  );
}

"use client";

import { memo } from "react";
import type { GraphNode } from "./types";

interface NavigationControlsProps {
	onCenter: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onAutoFit: () => void;
	nodes: GraphNode[];
	className?: string;
}

export const NavigationControls = memo<NavigationControlsProps>(
	({ onCenter, onZoomIn, onZoomOut, onAutoFit, nodes, className = "" }) => {
		// Always show zoom controls, but disable Fit/Center if no nodes
		const hasNodes = nodes.length > 0;

		return (
			<div className={`flex flex-col gap-1 ${className}`}>
				<button
					type="button"
					onClick={onAutoFit}
					disabled={!hasNodes}
					className="bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/10 hover:border-white/20 rounded-lg p-2 text-white/70 hover:text-white transition-colors text-xs font-medium min-w-16 disabled:opacity-50 disabled:cursor-not-allowed"
					title="Auto-fit graph to viewport"
				>
					Fit
				</button>
				<button
					type="button"
					onClick={onCenter}
					disabled={!hasNodes}
					className="bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/10 hover:border-white/20 rounded-lg p-2 text-white/70 hover:text-white transition-colors text-xs font-medium min-w-16 disabled:opacity-50 disabled:cursor-not-allowed"
					title="Center view on graph"
				>
					Center
				</button>
				<div className="flex flex-col">
					<button
						type="button"
						onClick={onZoomIn}
						className="bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/10 hover:border-white/20 rounded-t-lg p-2 text-white/70 hover:text-white transition-colors text-xs font-medium min-w-16 border-b-0"
						title="Zoom in"
					>
						+
					</button>
					<button
						type="button"
						onClick={onZoomOut}
						className="bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/10 hover:border-white/20 rounded-b-lg p-2 text-white/70 hover:text-white transition-colors text-xs font-medium min-w-16"
						title="Zoom out"
					>
						−
					</button>
				</div>
			</div>
		);
	},
);

NavigationControls.displayName = "NavigationControls";

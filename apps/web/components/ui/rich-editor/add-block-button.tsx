"use client"

import React, { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "../button"

interface AddBlockButtonProps {
  onAdd: () => void
  position?: "before" | "after"
}

export function AddBlockButton({
  onAdd,
  position = "after",
}: AddBlockButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="group relative flex h-3 items-center justify-center transition-all"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover area - full width */}
      <div className="absolute inset-0 w-full" />

      {/* Divider line - shows on hover */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity ${isHovered ? "opacity-100" : "opacity-0"} `}
      >
        <div className="bg-border h-px w-full" />
      </div>

      {/* Add button - shows on hover */}
      <Button
        variant="outline"
        size="sm"
        className={`relative z-10 h-6 gap-1 px-2 shadow-sm transition-all ${isHovered ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"} `}
        onClick={(e) => {
          e.stopPropagation()
          onAdd()
        }}
      >
        <Plus className="h-3 w-3" />
        <span className="text-xs">Add block</span>
      </Button>
    </div>
  )
}

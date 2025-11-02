# Supermemory Design System: Dark Mode Color Philosophy

![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-New_York-black?style=flat-square&logo=shadcnui)
![Radix UI](https://img.shields.io/badge/Radix_UI-Primitives-black?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v3-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![OKLCH](https://img.shields.io/badge/Color_Space-OKLCH-purple?style=flat-square)

## Introduction

This document defines the **Supermemory Dark Mode Design System** - a pure, neutral dark theme that emphasizes content over chrome. This guide will help you replicate our visual language and understand our design philosophy.

**Core Philosophy**: Pure black backgrounds with neutral grays. No color tints. Content is king.

### Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Supermemory UI Stack                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  shadcn/ui (New York Style)                             │
│  ├─ Clean, defined borders                              │
│  ├─ Compact spacing                                     │
│  └─ Professional aesthetic                              │
│                        ↓                                 │
│  Radix UI Primitives                                    │
│  ├─ Unstyled, accessible components                     │
│  ├─ ARIA compliant                                      │
│  └─ Keyboard navigation                                 │
│                        ↓                                 │
│  Tailwind CSS + CVA                                     │
│  ├─ Utility-first styling                               │
│  ├─ Type-safe variants                                  │
│  └─ Responsive design                                   │
│                        ↓                                 │
│  CSS Variables (Dynamic Theming)                        │
│  ├─ Light/Dark mode switching                           │
│  └─ Runtime customization                               │
│                        ↓                                 │
│  OKLCH Color Space                                      │
│  ├─ Pure black (#000000)                                │
│  ├─ Neutral grays (HUE = 0°)                            │
│  └─ Perceptually uniform                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Design Philosophy](#design-philosophy)
3. [Color Palette](#color-palette)
4. [Color Usage Guidelines](#color-usage-guidelines)
5. [Component Patterns](#component-patterns)
6. [Implementation Guide](#implementation-guide)
7. [Historical Context](#historical-context)
8. [References](#references)

---

## Technology Stack

### Component Library: shadcn/ui (New York Style)

Supermemory uses **shadcn/ui** with the **"New York"** style variant - the cleaner, more modern aesthetic.

```json
{
  "style": "new-york",        // New York style (clean, defined borders)
  "baseColor": "zinc",        // Zinc color palette (neutral grays)
  "cssVariables": true,       // CSS custom properties for theming
  "iconLibrary": "lucide"     // Lucide React for icons
}
```

### The Stack

```
shadcn/ui (New York style)
    ↓
Radix UI Primitives (unstyled, accessible components)
    ↓
Tailwind CSS (utility-first styling)
    ↓
CSS Variables (dynamic theming)
    ↓
OKLCH Color Space (perceptually uniform colors)
```

### shadcn/ui Style Comparison

| Style | Characteristics | When to Use |
|-------|----------------|-------------|
| **Default** | Softer borders, larger spacing, rounded corners | Traditional, friendly interfaces |
| **New York** ✅ | **Clean lines, defined borders, compact spacing, sharper corners** | **Modern, professional, content-dense apps** |

**Why New York?**
- Cleaner, more professional aesthetic
- Better content density
- Sharper, more defined visual hierarchy
- Aligns with our pure black philosophy

### Core Dependencies

```json
{
  "@radix-ui/react-dialog": "Dialog/Modal primitives",
  "@radix-ui/react-dropdown-menu": "Dropdown menus",
  "@radix-ui/react-select": "Select components",
  "@radix-ui/react-popover": "Popover primitives",
  "@radix-ui/react-tooltip": "Tooltips",
  "@radix-ui/react-accordion": "Accordions",
  "class-variance-authority": "Component variants",
  "lucide-react": "Icon library",
  "tailwindcss": "Styling framework"
}
```

### Component Architecture

```typescript
// Example: shadcn/ui New York Button
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // ... more variants
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
  }
)
```

**Key Features:**
- Type-safe variant system (CVA)
- Composable with Radix primitives
- Fully customizable via CSS variables
- Accessible by default (ARIA, keyboard nav)
- Tailwind utility classes for rapid styling

---

## Design Philosophy

### The Supermemory Aesthetic

**Pure Black Foundation**
- We use `#000000` (pure black) as our foundation, not dark gray
- No color tints - everything is neutral (HUE = 0°)
- Surfaces are differentiated by subtle luminosity changes, not color

**Why Pure Black?**
1. **Content Focus**: Black backgrounds make content pop without distraction
2. **OLED Optimization**: True black saves battery on OLED displays
3. **Modern Aesthetic**: Clean, minimalist, professional
4. **Accessibility**: Maximum contrast for text readability

**Neutral Grays Philosophy**
- All grays are **achromatic** (no blue, purple, or green tint)
- We use the OKLCH color space for perceptually uniform brightness
- Elevation is shown through luminosity, not shadows

### Comparison: Before vs After

**BEFORE (2024 - Blue-Tinted Era)**
```
Color System: Blue-tinted dark theme
Background: #1a1d29 (blue-gray)
Philosophy: Soft, atmospheric, muted
HUE: 285-286° (Blue/Violet region)
Problem: Looked different from our flagship MCP modal
```

**AFTER (Current - Pure Black Era)**
```
Color System: Pure neutral dark theme
Background: #000000 (true black)
Philosophy: Bold, clean, content-first
HUE: 0° (Neutral - no tint)
Achievement: Perfect visual consistency across the app
```

---

## Color Palette

### Foundation Colors

Our color system is built on the OKLCH color space for perceptually uniform lightness.

#### Background & Surfaces

| Name | OKLCH | Hex | RGB | Usage |
|------|-------|-----|-----|-------|
| **Pure Black** | `oklch(0 0 0)` | `#000000` | `rgb(0, 0, 0)` | Main background |
| **Elevated Black** | `oklch(0.05 0 0)` | `#0d0d0d` | `rgb(13, 13, 13)` | Popovers, tooltips |
| **Card Surface** | `oklch(0.1 0 0)` | `#1a1a1a` | `rgb(26, 26, 26)` | Cards, panels |
| **Secondary Surface** | `oklch(0.15 0 0)` | `#262626` | `rgb(38, 38, 38)` | Secondary elements |
| **Accent Surface** | `oklch(0.2 0 0)` | `#333333` | `rgb(51, 51, 51)` | Hover states, accents |

#### Text & Foreground

| Name | OKLCH | Hex/RGBA | Opacity | Usage |
|------|-------|----------|---------|-------|
| **Pure White** | `oklch(1 0 0)` | `#ffffff` | 100% | Primary text |
| **High Emphasis** | `oklch(1 0 0)` | `rgba(255,255,255,0.9)` | 90% | Headings, important text |
| **Medium Emphasis** | `oklch(1 0 0)` | `rgba(255,255,255,0.8)` | 80% | Body text |
| **Low Emphasis** | `oklch(1 0 0)` | `rgba(255,255,255,0.6)` | 60% | Secondary text |
| **Disabled** | `oklch(1 0 0)` | `rgba(255,255,255,0.5)` | 50% | Disabled text |
| **Subtle** | `oklch(1 0 0)` | `rgba(255,255,255,0.3)` | 30% | Placeholders, hints |

#### Borders & Dividers

| Name | OKLCH/RGBA | Opacity | Usage |
|------|------------|---------|-------|
| **Subtle Border** | `rgba(255,255,255,0.05)` | 5% | Very subtle dividers |
| **Default Border** | `rgba(255,255,255,0.1)` | 10% | Standard borders |
| **Emphasis Border** | `rgba(255,255,255,0.15)` | 15% | Input fields |
| **Strong Border** | `rgba(255,255,255,0.2)` | 20% | Active/focused states |

#### Interactive States

| State | Background | Border | Text |
|-------|------------|--------|------|
| **Default** | `oklch(0.1 0 0)` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.8)` |
| **Hover** | `oklch(0.15 0 0)` | `rgba(255,255,255,0.15)` | `rgba(255,255,255,0.9)` |
| **Active/Pressed** | `oklch(0.2 0 0)` | `rgba(255,255,255,0.2)` | `rgba(255,255,255,1)` |
| **Focus** | `oklch(0.1 0 0)` | `rgba(59,130,246,0.5)` | `rgba(255,255,255,0.9)` |
| **Disabled** | `oklch(0.08 0 0)` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.3)` |

### Accent & Semantic Colors

While we keep surfaces neutral, we use color for meaning and emphasis:

| Purpose | Color | OKLCH | Hex | When to Use |
|---------|-------|-------|-----|-------------|
| **Primary (Blue)** | Brand blue | `oklch(0.5 0.15 250)` | `#3b82f6` | Links, primary actions |
| **Success (Green)** | Success | `oklch(0.6 0.15 145)` | `#10b981` | Success states, confirmations |
| **Warning (Yellow)** | Warning | `oklch(0.75 0.15 85)` | `#f59e0b` | Warnings, cautions |
| **Error (Red)** | Destructive | `oklch(0.55 0.22 25)` | `#ef4444` | Errors, destructive actions |
| **Info (Cyan)** | Information | `oklch(0.65 0.12 200)` | `#06b6d4` | Info messages |

---

## Color Usage Guidelines

### Layering System

We create depth through subtle luminosity changes, not shadows or color tints.

```
Layer 0 (Base):           oklch(0 0 0)      #000000  [Main app background]
Layer 1 (Elevated):       oklch(0.05 0 0)   #0d0d0d  [Popovers, menus]
Layer 2 (Card):           oklch(0.1 0 0)    #1a1a1a  [Cards, panels]
Layer 3 (Section):        oklch(0.15 0 0)   #262626  [Sections within cards]
Layer 4 (Interactive):    oklch(0.2 0 0)    #333333  [Hover/active states]
```

**Rule**: Each layer is only 0.05 OKLCH lightness units brighter than the previous.

### Text Hierarchy

```
H1 (Hero):        rgba(255,255,255,0.95)  font-size: 2rem    weight: 700
H2 (Section):     rgba(255,255,255,0.9)   font-size: 1.5rem  weight: 600
H3 (Subsection):  rgba(255,255,255,0.85)  font-size: 1.25rem weight: 600
Body (Primary):   rgba(255,255,255,0.8)   font-size: 1rem    weight: 400
Body (Secondary): rgba(255,255,255,0.6)   font-size: 0.875rem weight: 400
Caption:          rgba(255,255,255,0.5)   font-size: 0.75rem  weight: 400
```

### Border Usage

| Element Type | Border Style |
|-------------|--------------|
| **Cards** | `1px solid rgba(255,255,255,0.1)` |
| **Inputs** | `1px solid rgba(255,255,255,0.15)` |
| **Dividers** | `1px solid rgba(255,255,255,0.1)` |
| **Focused** | `2px solid rgba(59,130,246,0.5)` (blue) |
| **Error** | `1px solid rgba(239,68,68,0.8)` (red) |

### Button Patterns

#### Ghost Button (Default)
```css
background: transparent
border: 1px solid rgba(255,255,255,0.1)
text: rgba(255,255,255,0.8)

hover:
  background: rgba(255,255,255,0.05)
  border: rgba(255,255,255,0.15)
  text: rgba(255,255,255,0.9)
```

#### Primary Button
```css
background: #3b82f6
border: none
text: #ffffff

hover:
  background: #2563eb
  text: #ffffff
```

#### Destructive Button
```css
background: transparent
border: 1px solid rgba(239,68,68,0.5)
text: rgba(239,68,68,1)

hover:
  background: rgba(239,68,68,0.1)
  border: rgba(239,68,68,0.8)
```

---

## Component Patterns

### The MCP Modal Pattern

Our flagship design - the basis for the entire system.

```css
/* Modal Container */
background: oklch(0 0 0);  /* Pure black */
border: 1px solid rgba(255,255,255,0.1);
border-radius: 0.75rem;
padding: 1.5rem;

/* Modal Header */
title-color: rgba(255,255,255,0.95);
title-size: 1.125rem;
description-color: rgba(255,255,255,0.6);
description-size: 0.875rem;

/* Numbered Steps */
step-background: rgba(255,255,255,0.1);
step-text: rgba(255,255,255,0.6);
step-size: 2rem × 2rem;
step-border-radius: 9999px;

/* Interactive Buttons */
button-background: transparent;
button-border: 1px solid rgba(255,255,255,0.1);
button-text: rgba(255,255,255,0.8);
button-padding: 0.5rem 0.75rem;
button-border-radius: 9999px;

button-hover-background: rgba(255,255,255,0.05);
button-hover-border: rgba(255,255,255,0.2);
button-hover-text: rgba(255,255,255,0.9);

/* Selected State */
button-selected-background: rgba(59,130,246,0.1);
button-selected-border: rgba(59,130,246,0.5);
button-selected-text: #3b82f6;

/* Input Fields */
input-background: rgba(255,255,255,0.05);
input-border: 1px solid rgba(255,255,255,0.1);
input-text: rgba(255,255,255,0.8);
input-placeholder: rgba(255,255,255,0.3);
```

### Card Component

```css
/* Standard Card */
background: oklch(0.1 0 0);
border: 1px solid rgba(255,255,255,0.1);
border-radius: 0.5rem;
padding: 1rem;

/* Card Hover */
hover-background: oklch(0.12 0 0);
hover-border: rgba(255,255,255,0.15);

/* Card Title */
title-color: rgba(255,255,255,0.9);
title-size: 1rem;
title-weight: 600;

/* Card Content */
content-color: rgba(255,255,255,0.7);
content-size: 0.875rem;
```

### Menu/Sidebar

```css
/* Sidebar Container */
background: oklch(0 0 0);
border-right: 1px solid rgba(255,255,255,0.1);
width: 16rem;

/* Menu Item */
item-background: transparent;
item-text: rgba(255,255,255,0.7);
item-padding: 0.5rem 1rem;
item-border-radius: 0.375rem;

/* Menu Item Hover */
hover-background: rgba(255,255,255,0.05);
hover-text: rgba(255,255,255,0.9);

/* Menu Item Active */
active-background: rgba(255,255,255,0.1);
active-text: rgba(255,255,255,1);
active-border-left: 2px solid #3b82f6;
```

### Input Fields

```css
/* Text Input */
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.15);
border-radius: 0.375rem;
padding: 0.5rem 0.75rem;
text-color: rgba(255,255,255,0.9);
placeholder-color: rgba(255,255,255,0.3);

/* Input Focus */
focus-background: rgba(255,255,255,0.08);
focus-border: 2px solid rgba(59,130,246,0.5);
focus-ring: 0 0 0 3px rgba(59,130,246,0.1);

/* Input Error */
error-border: 1px solid rgba(239,68,68,0.8);
error-text: rgba(239,68,68,1);
```

---

## Implementation Guide

### Setting Up shadcn/ui (New York Style)

#### Installation

```bash
# Install shadcn/ui CLI
npx shadcn-ui@latest init

# Select options:
# - Style: New York
# - Base color: Zinc
# - CSS variables: Yes
# - Icon library: Lucide
```

#### Configuration File

```json
// components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "./globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@ui/components",
    "utils": "@lib/utils"
  }
}
```

#### Adding Components

```bash
# Add individual components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add card

# Or add multiple at once
npx shadcn-ui@latest add button dialog card select
```

### CSS Variables (Tailwind/Design Tokens)

```css
:root {
  /* Light mode (default) */
  --background: oklch(1 0 0);
  --foreground: oklch(0.15 0 0);
}

.dark {
  /* Pure black background matching MCP modal */
  --background: oklch(0 0 0);
  --foreground: oklch(1 0 0);

  /* Cards and elevated surfaces - very dark gray */
  --card: oklch(0.1 0 0);
  --card-foreground: oklch(1 0 0);

  /* Popovers - pure black with slight elevation */
  --popover: oklch(0.05 0 0);
  --popover-foreground: oklch(1 0 0);

  /* Primary colors - light gray for primary elements */
  --primary: oklch(0.9 0 0);
  --primary-foreground: oklch(0.1 0 0);

  /* Secondary - dark gray surfaces */
  --secondary: oklch(0.15 0 0);
  --secondary-foreground: oklch(1 0 0);

  /* Muted - neutral gray tones */
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.6 0 0);

  /* Accent - slightly lighter gray */
  --accent: oklch(0.2 0 0);
  --accent-foreground: oklch(1 0 0);

  /* Destructive - red for errors */
  --destructive: oklch(0.55 0.22 25);

  /* Borders - white with 10% opacity matching MCP modal */
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);

  /* Ring - neutral gray for focus states */
  --ring: oklch(0.5 0 0);
}
```

### Tailwind CSS Configuration

```javascript
// tailwind.config.js
module.exports = {
  darkMode: ['class'], // Enable class-based dark mode
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
```

### shadcn/ui Component Examples

#### Using shadcn/ui Components

```tsx
// Import from shadcn/ui
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// MCP-style Modal using shadcn Dialog
export function MCPModal({ children, open, onOpenChange }: MCPModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl bg-background border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white/95">
            Connect Supermemory to Your AI
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

// Custom Button with MCP styling
export function MCPButton({ children, selected = false }: MCPButtonProps) {
  return (
    <Button
      variant="ghost"
      className={`
        rounded-full border transition-all
        ${selected 
          ? 'border-blue-500 bg-blue-500/10 text-blue-500' 
          : 'border-white/10 bg-transparent text-white/80 hover:bg-white/5 hover:border-white/20'
        }
      `}
    >
      {children}
    </Button>
  )
}

// Custom Card with MCP styling
export function MCPCard({ children, title }: MCPCardProps) {
  return (
    <Card className="bg-card border-white/10 hover:bg-white/[0.02]">
      <CardHeader>
        <CardTitle className="text-white/90">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-white/70">
        {children}
      </CardContent>
    </Card>
  )
}
```

#### Theme Toggle Component (shadcn/ui style)

```tsx
"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
```

---

## Historical Context

### The Journey to Pure Black

#### Phase 1: Blue-Tinted Era (Pre-2024)
```
Background: oklch(0.141 0.005 285.823) = #1a1d29 (blue-gray)
Philosophy: Soft, atmospheric dark mode
Problem: Inconsistent with MCP modal flagship component
User Feedback: "Why does the modal look different from the app?"
```

#### Phase 2: Discovery (October 2024)
```
Realization: MCP modal uses pure black (#000000)
Analysis: All app colors had HUE ~285-286° (blue/violet)
Decision: Align entire app to MCP modal aesthetic
Goal: Visual consistency and modern clean look
```

#### Phase 3: Pure Black Era (November 2024 - Present)
```
Background: oklch(0 0 0) = #000000 (pure black)
Philosophy: Content-first, neutral, bold
Achievement: Perfect consistency across all surfaces
User Response: "Now THAT'S dark mode!"
```

### Key Lessons Learned

1. **Consistency is King**: All components should share the same visual language
2. **Neutrality Creates Focus**: Removing color tints puts emphasis on content
3. **OKLCH is Superior**: Perceptually uniform color space ensures consistent brightness
4. **Pure Black Works**: True black on OLED displays looks amazing and saves battery
5. **Subtle is Powerful**: Small luminosity changes (0.05 OKLCH) create sufficient depth

---

## Quick Reference

### Color Cheat Sheet

```
BACKGROUNDS:
#000000  Pure Black (main)
#0d0d0d  Elevated
#1a1a1a  Cards
#262626  Sections
#333333  Interactive

TEXT:
rgba(255,255,255,0.95)  Headings
rgba(255,255,255,0.8)   Body
rgba(255,255,255,0.6)   Secondary
rgba(255,255,255,0.5)   Disabled
rgba(255,255,255,0.3)   Placeholders

BORDERS:
rgba(255,255,255,0.05)  Very subtle
rgba(255,255,255,0.1)   Default
rgba(255,255,255,0.15)  Inputs
rgba(255,255,255,0.2)   Emphasis

HOVER STATES:
background: +0.05 OKLCH lightness
border: +0.05 opacity
text: +0.1 opacity
```

### Do's and Don'ts

✅ **DO**
- Use pure black (#000000) for main backgrounds
- Keep all grays neutral (HUE = 0°)
- Use subtle opacity for borders (10-15%)
- Differentiate layers with luminosity, not color
- Use OKLCH for perceptually uniform colors
- Test on OLED displays

❌ **DON'T**
- Add blue/purple tints to grays
- Use shadows for depth (use luminosity)
- Make borders too thick (1px is enough)
- Overuse color (keep it semantic only)
- Forget hover states
- Use RGB/HSL (use OKLCH instead)

---

## shadcn/ui Project Structure

### File Organization

```
your-project/
├── components/
│   ├── ui/                    # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── card.tsx
│   │   ├── select.tsx
│   │   └── ...
│   └── theme-toggle.tsx       # Custom components
├── lib/
│   └── utils.ts              # cn() utility and helpers
├── styles/
│   └── globals.css           # CSS variables and Tailwind
├── components.json           # shadcn/ui configuration
└── tailwind.config.js        # Tailwind configuration
```

### Key Files

#### `lib/utils.ts`
```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

#### `components/ui/button.tsx` (shadcn New York)
```typescript
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

### Customization Strategy

**1. Use shadcn/ui as Base**
```tsx
// Start with shadcn component
import { Button } from "@/components/ui/button"

// Extend with custom props
<Button className="border-white/10 text-white/80">
  Click me
</Button>
```

**2. Create Custom Wrappers**
```tsx
// Custom MCP-style wrapper
export function MCPButton({ children, ...props }: MCPButtonProps) {
  return (
    <Button
      variant="ghost"
      className="rounded-full border border-white/10 hover:bg-white/5"
      {...props}
    >
      {children}
    </Button>
  )
}
```

**3. Override CSS Variables**
```css
/* globals.css */
.dark {
  --background: oklch(0 0 0);      /* Pure black */
  --foreground: oklch(1 0 0);      /* Pure white */
  --card: oklch(0.1 0 0);          /* Dark gray */
  --border: oklch(1 0 0 / 10%);   /* White 10% */
}
```

---

## Inspiration & Further Reading

### Design Systems That Influenced Us

- **shadcn/ui (New York)**: Our component foundation and styling approach
- **Apple Design Resources**: Pure black philosophy for OLED
- **Vercel Design System**: Neutral grays and subtle borders
- **Linear**: Clean, minimal dark mode
- **Raycast**: Content-first dark aesthetic
- **Radix UI**: Accessible, unstyled primitives

### Recommended Tools

- **shadcn/ui**: https://ui.shadcn.com (Component library)
- **Radix UI**: https://www.radix-ui.com (Primitives)
- **OKLCH Color Picker**: https://oklch.com
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Figma OKLCH Plugin**: For design handoff
- **Chrome DevTools**: Test on OLED simulation
- **Tailwind CSS**: https://tailwindcss.com (Utility framework)

### Technical Resources

- **shadcn/ui Documentation**: Complete guide to New York style components
- **Radix UI Primitives**: Deep dive into accessible component architecture
- **Class Variance Authority (CVA)**: Type-safe component variants
- **Tailwind Merge**: Conflict-free className composition
- **OKLCH vs RGB**: Why OKLCH provides perceptually uniform lightness
- **Neutral Grays**: How removing HUE creates pure achromatic colors
- **OLED True Black**: Battery savings and visual benefits

---

## Conclusion

The Supermemory dark mode is built on a foundation of **pure black**, **neutral grays**, and **subtle transparency**. By removing all color tints and using the OKLCH color space, we achieve a modern, content-first aesthetic that looks incredible on any display.

**Core Principles:**
1. Pure black foundation (`#000000`)
2. Neutral grays (HUE = 0°)
3. Subtle opacity for depth
4. OKLCH for uniformity
5. Consistency across all components

Use this guide to replicate our visual language in your own projects. The Supermemory aesthetic is all about **clarity, focus, and boldness through simplicity**.

---

**Version**: 1.0  
**Last Updated**: November 1, 2024  
**Maintained By**: Supermemory Design Team  
**License**: MIT (Free to use and adapt)

---

## Appendix: Complete Color Token Reference

```css
/* SUPERMEMORY DARK MODE - COMPLETE TOKEN SET */

:root.dark {
  /* === SURFACES === */
  --color-bg-base: oklch(0 0 0);           /* #000000 */
  --color-bg-elevated: oklch(0.05 0 0);    /* #0d0d0d */
  --color-bg-card: oklch(0.1 0 0);         /* #1a1a1a */
  --color-bg-section: oklch(0.15 0 0);     /* #262626 */
  --color-bg-interactive: oklch(0.2 0 0);  /* #333333 */
  
  /* === TEXT === */
  --color-text-primary: rgba(255,255,255,0.95);
  --color-text-secondary: rgba(255,255,255,0.8);
  --color-text-tertiary: rgba(255,255,255,0.6);
  --color-text-disabled: rgba(255,255,255,0.5);
  --color-text-placeholder: rgba(255,255,255,0.3);
  
  /* === BORDERS === */
  --color-border-subtle: rgba(255,255,255,0.05);
  --color-border-default: rgba(255,255,255,0.1);
  --color-border-emphasis: rgba(255,255,255,0.15);
  --color-border-strong: rgba(255,255,255,0.2);
  
  /* === INTERACTIVE === */
  --color-hover-bg: rgba(255,255,255,0.05);
  --color-hover-border: rgba(255,255,255,0.15);
  --color-active-bg: rgba(255,255,255,0.1);
  --color-active-border: rgba(255,255,255,0.2);
  
  /* === SEMANTIC === */
  --color-primary: #3b82f6;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #06b6d4;
}
```

**End of Design System Guide**
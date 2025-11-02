# Requirements: Dark Mode Toggle

## 1. Overview

**Goal**: Implement a dark mode toggle button that allows users to switch between light and dark themes in the Supermemory application.

**User Problem**: The application currently defaults to dark mode but users have no way to switch to light mode. The dark mode styling should match the aesthetic of the Connect AI Modal (MCP modal), which uses a sophisticated dark theme with specific color combinations.

## 2. Functional Requirements

### 2.1 Core Features

- **FR-1**: Add a theme toggle button accessible to users
- **FR-2**: Toggle between light mode and dark mode on button click
- **FR-3**: Persist user's theme preference across sessions
- **FR-4**: Dark mode colors must match the Connect AI Modal styling
- **FR-5**: Theme transition should be smooth without jarring flashes

### 2.2 User Stories

**Story 1**: As a user, I want to toggle between light and dark modes so that I can choose my preferred viewing experience.

**Story 2**: As a user, I want my theme preference to be remembered when I return to the application so that I don't have to change it every time.

**Story 3**: As a user, I want the dark mode to look consistent with the existing MCP modal so that the interface feels cohesive.

## 3. Technical Requirements

### 3.1 Theme System

- Use existing next-themes library already installed in the project
- Use existing ThemeProvider already configured in apps/web/app/layout.tsx
- Leverage existing CSS variables in packages/ui/globals.css for .dark class
- Apply theme via class attribute on HTML element

### 3.2 Color Specifications

Dark mode should use colors matching the Connect AI Modal:

- Background: black/very dark gray tones
- Borders: white/10 opacity (rgba(255, 255, 255, 0.1))
- Hover states: white/5 to white/20 opacity
- Text primary: white/80 opacity
- Text secondary: white/60 opacity
- Accent colors: blue-500 with 10% opacity backgrounds

Light mode should use the existing light theme variables defined in packages/ui/globals.css.

### 3.3 Toggle Button Placement

WHEN user accesses the application THEN the theme toggle SHALL be visible and accessible

IF user is on mobile THEN the toggle SHALL be accessible in the menu panel

IF user is on desktop THEN the toggle SHALL be visible in a consistent location

WHERE the toggle button is placed WHILE maintaining existing UI layout

### 3.4 Performance

- Theme change SHALL complete within 200ms
- No flash of unstyled content on page load
- CSS variables SHALL be used for instant theme switching

## 4. Acceptance Criteria

- [ ] WHEN I click the theme toggle button THEN the application SHALL switch between light and dark modes
- [ ] WHEN I refresh the page THEN my theme preference SHALL be preserved
- [ ] WHEN in dark mode THEN the colors SHALL match the Connect AI Modal aesthetic
- [ ] WHEN the theme changes THEN there SHALL be no jarring visual flash or delay
- [ ] WHEN I navigate between pages THEN the theme SHALL remain consistent
- [ ] IF the toggle button is clicked multiple times rapidly THEN it SHALL handle all clicks correctly without breaking

## 5. Out of Scope

- System theme detection (enableSystem is already false in ThemeProvider)
- Multiple theme variations beyond light and dark
- Per-component theme customization
- Animated theme transitions beyond CSS transitions
- User-customizable color schemes
- Accessibility contrast ratio adjustments

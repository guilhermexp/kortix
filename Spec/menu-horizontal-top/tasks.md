# Tasks: menu-horizontal-top

- [x] Move vertical menu to horizontal top-center position (completed) — id: `T1`
  
  Transform the vertical left-side menu into a horizontal top-center menu.

Changes needed in apps/web/components/menu.tsx:
1. Container: Change from left-aligned full-height to top-center positioned
2. Nav element: Change flex-col to flex-row for horizontal layout
3. Menu items: Adjust spacing and layout for horizontal display
4. Animations: Maintain width animations but adjust positioning
5. Responsive: Ensure mobile version continues to work

Files: apps/web/components/menu.tsx

Acceptance:
- Menu appears at top-center of screen
- Menu items display horizontally
- Hover and expand animations work correctly
- Mobile menu continues to function properly
- All menu items (Plus, Chat, Puzzle, MCP, User) are accessible
- [x] Fix menu width to show all 5 icons (completed) — id: `T2`
  
  Fix menu width to display all 5 icons horizontally.

Current width (280px) is too small to show all menu items.

Changes needed in apps/web/components/menu.tsx:
- Increase collapsed width from 280px to ~400px to accommodate all 5 icons
- Adjust calculation comment to reflect accurate spacing
- Ensure overflow is visible or container wraps properly

Files: apps/web/components/menu.tsx (around line 236)

Acceptance:
- All 5 menu icons visible: Plus, Chat, Puzzle, MCP, User
- Menu remains centered at top
- No overflow/clipping of icons
- Proper spacing between icons
- [x] Fix overflow-hidden cutting 5th icon (completed) — id: `T3`
  
  Remove overflow-hidden and increase collapsed width to show all 5 icons without clipping.

Problems:
1. overflow-hidden is cutting off the 5th icon (Profile)
2. Width might need slight increase (400px → 420px for safety margin)
3. Initial width is still 280px, should match collapsed width

Changes in apps/web/components/menu.tsx:

Line ~236: Increase collapsed width from 400 to 420
const menuWidth = expandedView || isCollapsing ? 600 : isHovered ? 600 : 420

Line ~252: Change overflow-hidden to overflow-visible
className="... overflow-visible ..." (or remove overflow-hidden)

Line ~255: Update initial width to match collapsed width
initial={{ width: 420, scale: 0.95 }}

Files: apps/web/components/menu.tsx

Acceptance:
- All 5 icons visible in collapsed state (no hover)
- No clipping or cutting of Profile icon
- Menu stays centered
- Hover still works properly
- [x] Fix container width and center all 5 icons properly (completed) — id: `T4`
  
  Fix menu to show all 5 icons INSIDE the container in collapsed state, properly centered.

Current issue: Profile icon is outside the rounded border container.

Solution:
1. Increase collapsed width: 420px → 480px (to fit all 5 icons inside)
2. Keep overflow-hidden (not visible) to prevent icons from going outside
3. Ensure proper centering
4. Collapsed state = icons only, no text
5. Hover state = expand to show text labels

Changes in apps/web/components/menu.tsx:

Line ~236: Increase collapsed width to 480px
const menuWidth = expandedView || isCollapsing ? 600 : isHovered ? 600 : 480

Update comment:
// Collapsed: 5 icons only (~480px to fit all inside)
// Hovered: expand with labels (~600px)

Line ~252: Change back to overflow-hidden
className="... overflow-hidden ..."

Line ~255: Update initial width
initial={{ width: 480, scale: 0.95 }}

Files: apps/web/components/menu.tsx

Acceptance:
- All 5 icons visible and INSIDE container border
- Menu centered horizontally at top
- Collapsed state shows icons only
- Hover shows text labels
- No icons outside the rounded border

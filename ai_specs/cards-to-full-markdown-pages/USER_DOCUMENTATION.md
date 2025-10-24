# User Guide: Creating and Editing Memories

## Overview

Supermemory now features a powerful markdown editor that lets you create rich, formatted notes with ease. This guide will help you make the most of the new editing experience.

## Getting Started

### Creating a New Memory

1. Click the **"Add Memory"** button or press `Cmd/Ctrl + N`
2. Start typing your content
3. Use the formatting toolbar or keyboard shortcuts
4. Click **"Save"** or press `Cmd/Ctrl + S`

### Opening an Existing Memory

1. Navigate to your memories list
2. Click on any memory card to open it in full-page view
3. Click **"Edit"** to make changes

## Using the Rich Text Editor

### Basic Formatting

#### Bold Text
- **Toolbar**: Click the **B** button
- **Keyboard**: `Cmd/Ctrl + B`
- **Markdown**: Wrap text in `**double asterisks**`

#### Italic Text
- **Toolbar**: Click the *I* button
- **Keyboard**: `Cmd/Ctrl + I`
- **Markdown**: Wrap text in `*single asterisks*` or `_underscores_`

#### Underline Text
- **Toolbar**: Click the <u>U</u> button
- **Keyboard**: `Cmd/Ctrl + U`

### Headings

Create headings to organize your content:

#### Heading 1 (Main Title)
- **Toolbar**: Select "Heading 1" from dropdown
- **Keyboard**: `Cmd/Ctrl + Alt + 1`
- **Markdown**: Start line with `# `

#### Heading 2 (Section)
- **Toolbar**: Select "Heading 2" from dropdown
- **Keyboard**: `Cmd/Ctrl + Alt + 2`
- **Markdown**: Start line with `## `

#### Heading 3 (Subsection)
- **Toolbar**: Select "Heading 3" from dropdown
- **Keyboard**: `Cmd/Ctrl + Alt + 3`
- **Markdown**: Start line with `### `

### Lists

#### Bullet Lists
- **Toolbar**: Click the bullet list button
- **Keyboard**: Start line with `- ` or `* `
- **Continue**: Press `Enter` to add next item
- **Indent**: Press `Tab` to nest items
- **Outdent**: Press `Shift + Tab` to move items out

Example:
```
- First item
- Second item
  - Nested item
  - Another nested item
- Third item
```

#### Numbered Lists
- **Toolbar**: Click the numbered list button
- **Keyboard**: Start line with `1. `
- **Auto-numbering**: Numbers update automatically

Example:
```
1. First step
2. Second step
3. Third step
```

### Links

#### Adding Links
1. Select the text you want to link
2. Click the link button or press `Cmd/Ctrl + K`
3. Enter the URL
4. Press Enter

**Markdown syntax**:
```markdown
[Link text](https://example.com)
```

### Images

#### Inserting Images

1. Click the image button in toolbar
2. **Option A**: Paste image URL
3. **Option B**: Upload from computer
4. **Option C**: Drag and drop image into editor

**Markdown syntax**:
```markdown
![Alt text](https://example.com/image.jpg)
```

### Code

#### Inline Code
- **Keyboard**: Wrap text in `` `backticks` ``
- **Example**: `const x = 10;`

#### Code Blocks
- **Toolbar**: Click code block button
- **Markdown**: Wrap in triple backticks
- **Syntax highlighting**: Specify language

Example:
````markdown
```javascript
function hello() {
  console.log("Hello, World!");
}
```
````

### Quotes

Create block quotes to highlight important text:

- **Toolbar**: Click quote button
- **Markdown**: Start line with `> `

Example:
```markdown
> This is a quote.
> It can span multiple lines.
```

## Advanced Features

### Tables

Create tables to organize data:

```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

### Task Lists

Create interactive checklists:

```markdown
- [ ] Incomplete task
- [x] Completed task
- [ ] Another task
```

### Horizontal Rules

Separate sections with lines:

```markdown
---
or
***
```

## Keyboard Shortcuts

### Editing
- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + U` - Underline
- `Cmd/Ctrl + K` - Insert link
- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo

### Navigation
- `Cmd/Ctrl + S` - Save
- `Cmd/Ctrl + N` - New memory
- `Cmd/Ctrl + F` - Find in memory
- `Esc` - Exit edit mode

### Headings
- `Cmd/Ctrl + Alt + 1` - Heading 1
- `Cmd/Ctrl + Alt + 2` - Heading 2
- `Cmd/Ctrl + Alt + 3` - Heading 3

## Tips & Best Practices

### Organization

1. **Use headings** to structure long notes
2. **Add tags** to categorize memories
3. **Create links** between related memories
4. **Use lists** for actionable items

### Writing

1. **Start with a clear title** (Heading 1)
2. **Use formatting sparingly** - don't overdo it
3. **Break long paragraphs** into shorter ones
4. **Add images** to make content more engaging

### Productivity

1. **Learn keyboard shortcuts** - they save time
2. **Use markdown syntax** - it's faster than toolbar
3. **Save frequently** - or enable auto-save
4. **Use templates** for recurring note types

## Mobile Experience

### Touch Gestures
- **Double tap** to edit
- **Swipe** to navigate between memories
- **Long press** for context menu
- **Pinch** to zoom in/out

### Mobile Toolbar
The toolbar adapts for smaller screens with collapsible menus.

## Markdown Quick Reference

```markdown
# Heading 1
## Heading 2
### Heading 3

**bold text**
*italic text*
***bold and italic***

[Link text](URL)
![Image alt text](image-url)

- Bullet list item
1. Numbered list item

> Blockquote

`inline code`

```code block```

| Table | Header |
|-------|--------|
| Cell  | Cell   |

- [ ] Task list item
```

## Troubleshooting

### Content Not Saving
- **Check internet connection**
- **Look for error messages**
- **Try refreshing the page**
- **Copy content before closing**

### Formatting Not Applied
- **Ensure you're in edit mode**
- **Check if selection is correct**
- **Try using markdown syntax**
- **Clear cache and reload**

### Images Not Loading
- **Verify image URL is valid**
- **Check image file size** (max 10MB)
- **Ensure image format is supported** (JPG, PNG, GIF, WebP)
- **Check internet connection**

## FAQ

### Can I export my memories?
Yes! Use the export feature in Settings > Data > Export.

### Is my data synced across devices?
Yes, all memories are automatically synced to the cloud.

### Can I work offline?
Yes, changes are saved locally and synced when you're back online.

### Can I share memories with others?
Yes, use the share button to generate a shareable link.

### What happens to my old memories?
They're automatically migrated to the new format without data loss.

## Getting Help

- **Documentation**: [https://docs.supermemory.ai](link)
- **Community**: [Discord Community](link)
- **Support**: support@supermemory.ai
- **Bug Reports**: [GitHub Issues](https://github.com/Dhravya/supermemory/issues)

---

*Last updated: January 2025*
*Version: 2.0.0*

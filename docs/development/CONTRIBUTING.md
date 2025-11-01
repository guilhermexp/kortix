# Contributing to Supermemory

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to Supermemory.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Documentation](#documentation)

## Code of Conduct

We expect all contributors to:
- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community

## Getting Started

### 1. Fork and Clone

```bash
# Fork repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/supermemory.git
cd supermemory
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Setup Development Environment

```bash
# Copy environment files
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local

# Edit with your credentials
# See docs/setup/QUICK_START.md
```

### 4. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

## Development Workflow

### Running the Development Server

```bash
# Start all services
bun run dev

# Or individually:
bun run --cwd apps/api dev
bun run --cwd apps/web dev
```

### Project Structure

```
apps/
├── api/          # Backend API
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   └── middleware/   # Middleware
│   └── migrations/       # Database migrations
├── web/          # Frontend
│   ├── app/              # Next.js pages
│   ├── components/       # React components
│   ├── stores/           # State management
│   └── lib/              # Utilities
└── docs/         # Documentation

packages/
├── lib/          # Shared utilities
├── ui/           # Shared components
├── validation/   # Zod schemas
└── hooks/        # Shared hooks
```

### Making Changes

1. **API Changes**
   - Add routes in `apps/api/src/routes/`
   - Implement logic in `apps/api/src/services/`
   - Add validation in `packages/validation/`
   - Write tests in `*.test.ts` files

2. **Frontend Changes**
   - Add components in `apps/web/components/`
   - Update pages in `apps/web/app/`
   - Add state in `apps/web/stores/`
   - Follow existing component patterns

3. **Database Changes**
   - Create migration in `apps/api/migrations/`
   - Follow naming: `XXXX_description.sql`
   - Include both `up` and `down` migrations
   - Test locally before committing

## Code Standards

### TypeScript

```typescript
// Use TypeScript for type safety
interface User {
  id: string;
  email: string;
  name: string;
}

// Export types from modules
export type { User };

// Use proper types, avoid 'any'
function getUser(id: string): Promise<User> {
  // ...
}
```

### React Components

```tsx
// Use functional components with hooks
export function MyComponent({ prop }: Props) {
  const [state, setState] = useState<string>('');

  return (
    <div className="my-component">
      {/* JSX here */}
    </div>
  );
}

// Prefer named exports
export { MyComponent };
```

### Code Formatting

We use Biome for formatting and linting:

```bash
# Format code
bun run format-lint

# Check types
bun run check-types
```

**Rules:**
- Indent: 2 spaces (no tabs)
- Line length: 100 characters
- Semicolons: Required
- Quotes: Single quotes for JS/TS, double for JSX
- Trailing commas: Required

### File Naming

- **Components**: `PascalCase.tsx` (e.g., `DocumentCard.tsx`)
- **Utilities**: `kebab-case.ts` (e.g., `format-date.ts`)
- **Hooks**: `use-hook-name.ts` (e.g., `use-documents.ts`)
- **Types**: `types.ts` or colocated with component
- **Tests**: `*.test.ts` or `*.test.tsx`

### Import Order

```typescript
// 1. External imports
import React from 'react';
import { useState } from 'react';

// 2. Internal imports
import { Button } from '@/components/ui/button';
import { useDocuments } from '@/hooks/use-documents';

// 3. Relative imports
import { helper } from './utils';
import type { Props } from './types';

// 4. Styles (if any)
import './styles.css';
```

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test path/to/test.test.ts

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Writing Tests

```typescript
// apps/web/hooks/use-documents.test.ts
import { describe, test, expect } from 'vitest';
import { useDocuments } from './use-documents';

describe('useDocuments', () => {
  test('fetches documents', async () => {
    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.documents).toHaveLength(3);
    });
  });
});
```

### Test Coverage Goals

- **Critical paths**: 80%+ coverage
- **Utilities**: 90%+ coverage
- **UI components**: 60%+ coverage (focus on logic, not rendering)

## Submitting Changes

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add infinity canvas zoom controls
fix: resolve chat streaming bug
docs: update API documentation
refactor: simplify search logic
test: add tests for document service
chore: update dependencies
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Pull Request Process

1. **Update Your Branch**
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-branch
   git rebase main
   ```

2. **Run Checks**
   ```bash
   bun run check-types
   bun run format-lint
   bun test
   ```

3. **Push Changes**
   ```bash
   git push origin your-branch
   ```

4. **Create Pull Request**
   - Go to GitHub and create PR
   - Fill out the PR template
   - Link related issues
   - Request review

### PR Title Format

```
type(scope): description

Examples:
feat(canvas): add zoom controls
fix(search): resolve vector search timeout
docs(api): update authentication guide
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] All tests passing

## Screenshots (if applicable)
[Add screenshots]

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
```

## Documentation

### When to Update Docs

Update documentation when you:
- Add new features
- Change API endpoints
- Modify configuration
- Fix significant bugs
- Add dependencies

### Documentation Structure

```
docs/
├── setup/          # Installation guides
├── features/       # Feature documentation
├── api/            # API reference
├── architecture/   # System design
├── development/    # Contributing guides
└── deployment/     # Deployment guides
```

### Writing Documentation

**Good documentation:**
- Explains *why*, not just *what*
- Includes code examples
- Has clear steps
- Uses screenshots/diagrams
- Is up-to-date

**Example:**

````markdown
# Infinity Canvas

## Overview
The Infinity Canvas allows visual organization of memories...

## Basic Usage

```tsx
import { InfinityCanvas } from '@/components/canvas';

function MyPage() {
  return <InfinityCanvas documents={docs} />;
}
```

## Configuration

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| documents | Document[] | [] | Documents to display |
| zoom | number | 1.0 | Initial zoom level |
````

## Areas for Contribution

### High Priority

- [ ] Real-time collaboration on canvas
- [ ] Mobile apps (iOS/Android)
- [ ] Advanced graph visualization
- [ ] Voice input and search
- [ ] Improved OCR for images
- [ ] Performance optimizations

### Good First Issues

Look for issues labeled `good-first-issue`:
- Bug fixes
- Documentation improvements
- UI enhancements
- Test coverage
- Accessibility improvements

### Feature Requests

Before implementing:
1. Check existing issues/PRs
2. Open issue for discussion
3. Wait for maintainer approval
4. Create detailed design doc
5. Implement with tests

## Getting Help

- **Questions**: [GitHub Discussions](https://github.com/guilhermexp/supermemory/discussions)
- **Bugs**: [GitHub Issues](https://github.com/guilhermexp/supermemory/issues)
- **Chat**: Coming soon (Discord/Slack)

## Recognition

Contributors are recognized in:
- README.md contributors section
- CHANGELOG.md for significant contributions
- GitHub contributors page

Thank you for contributing to Supermemory! 🚀

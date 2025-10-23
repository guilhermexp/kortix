# Contributing to Supermemory

Thank you for your interest in contributing to Supermemory! We welcome contributions from developers of all skill levels. This guide will help you get started with contributing to our self-hosted AI memory platform.

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Bun** (>= 1.2.17) - Our package manager
- **Node.js** (>= 20) - Runtime environment
- **Git** - Version control

### Setting Up the Development Environment

1. **Fork and Clone the Repository**

   ```bash
   git clone https://github.com/your-username/supermemory.git
   cd supermemory
   ```

2. **Install Dependencies**

   ```bash
   bun install
   ```

3. **Set Up Environment Variables**

   ```bash
   # Copy example environment files
   cp apps/api/.env.local.example apps/api/.env.local
   cp apps/web/.env.example apps/web/.env.local

   # Edit the files with your configuration
   # You'll need Supabase credentials and API keys
   ```

4. **Start Development Servers**

   ```bash
   # Terminal 1: API
   bun run --cwd apps/api dev

   # Terminal 2: Web
   bun run --cwd apps/web dev
   ```

   The web app will be available at `http://localhost:3000` and the API at `http://localhost:4000`.

## 📁 Project Structure

Supermemory is organized as a Turbo monorepo:

```
supermemory/
├── apps/
│   ├── api/                 # Bun + Hono backend
│   ├── web/                 # Next.js frontend
│   ├── docs/                # Mintlify documentation
│   └── browser-extension/   # WXT browser extension
├── packages/
│   ├── ui/                  # Shared UI components
│   ├── lib/                 # Shared utilities
│   ├── hooks/               # Shared React hooks
│   ├── validation/          # Zod schemas
│   └── ai-sdk/              # AI SDK integrations
├── spec/                    # Technical specs
├── ai_docs/                 # AI documentation
└── db/                      # Database migrations
```

## 🛠️ Development Workflow

### Available Scripts

```bash
# Root level (monorepo)
bun run dev              # Start API + Web
bun run dev:all          # Start all apps including docs
bun run build            # Build all applications
bun run format-lint      # Format and lint with Biome
bun run check-types      # Type check all packages

# Individual apps
bun run --cwd apps/api dev          # Backend dev server
bun run --cwd apps/api ingest:worker # Background worker
bun run --cwd apps/web dev          # Frontend dev server
bun run --cwd apps/web build        # Build frontend
bun run --cwd apps/docs dev         # Documentation site
```

### Code Quality Checks

Before submitting a PR, ensure your code passes all checks:

```bash
bun run format-lint      # Format and lint
bun run check-types      # TypeScript validation
bun run build            # Build all apps
```

## 🎨 Tech Stack

### Backend (`apps/api/`)
- **Runtime**: Bun
- **Framework**: Hono
- **Language**: TypeScript (strict mode)
- **Database**: Supabase Postgres + pgvector
- **Auth**: Custom session-based (scrypt password hashing)
- **AI**: Vercel AI SDK + Google Gemini

### Frontend (`apps/web/`)
- **Framework**: Next.js 15 with Turbopack
- **Language**: TypeScript
- **UI Components**: Radix UI
- **Styling**: Tailwind CSS
- **State Management**: Zustand + TanStack Query
- **Tables**: TanStack Table
- **Charts**: Recharts
- **Rich Text**: Slate
- **Animation**: Framer Motion

### Tools
- **Monorepo**: Turbo
- **Linting**: Biome
- **Package Manager**: Bun
- **Deployment**: Railway + Nixpacks

## 🎯 How to Contribute

### Types of Contributions

We welcome various types of contributions:

- 🐛 **Bug fixes**
- ✨ **New features**
- 📝 **Documentation improvements**
- 🎨 **UI/UX enhancements**
- ⚡ **Performance optimizations**
- 🧪 **Tests**

### Finding Issues to Work On

1. Check our [Issues](https://github.com/guilhermexp/supermemory/issues) page
2. Look for issues labeled `good first issue` for beginners
3. Issues labeled `help wanted` are great for contributors
4. Feel free to propose new features by opening an issue first

### Making Changes

1. **Create a Branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make Your Changes**
   - Follow our coding standards (see below)
   - Write clear, concise commit messages
   - Add tests if applicable
   - Update documentation if needed

3. **Test Your Changes**
   ```bash
   bun run dev          # Test locally
   bun run build        # Ensure it builds
   bun run format-lint  # Check formatting
   bun run check-types  # Check types
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve bug in search"
   ```

## 📝 Coding Standards

### General Guidelines

- Use **TypeScript** for all new code
- Follow the existing code style and patterns
- Write self-documenting code with clear variable names
- Add JSDoc comments for complex functions
- Keep functions small and focused (single responsibility)
- Prefer composition over inheritance

### TypeScript Standards

- Enable strict mode
- Use proper types (avoid `any`)
- Define interfaces for complex objects
- Use discriminated unions for state management
- Leverage type inference where appropriate

### Component Guidelines

- Use functional components with hooks
- Extract reusable logic into custom hooks
- Use proper TypeScript types for props
- Implement proper error boundaries
- Handle loading and error states

### File Naming Conventions

- Use `kebab-case` for file names: `user-profile.tsx`
- Use `PascalCase` for component files: `UserProfile.tsx`
- Use `camelCase` for utility functions: `formatDate.ts`
- Use `.tsx` for React components, `.ts` for utilities

### Import Organization

```typescript
// 1. React and Next.js imports
import React from 'react';
import { NextPage } from 'next';

// 2. Third-party libraries
import { clsx } from 'clsx';
import { motion } from 'motion';

// 3. Internal packages
import { Button } from '@repo/ui';
import { useAuth } from '@repo/lib';

// 4. Relative imports
import { Header } from './header';
import { Footer } from './footer';

// 5. Types
import type { User } from '@repo/validation';
```

### Code Style

We use **Biome** for linting and formatting. Key rules:

- No default exports (except for Next.js pages)
- Use single quotes for strings
- Semicolons required
- 2-space indentation
- Max line length: 100 characters
- Trailing commas in objects/arrays
- Self-closing JSX elements

## 🔄 Pull Request Process

### Before Submitting

1. Ensure your branch is up to date with `main`
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Run all quality checks
   ```bash
   bun run format-lint
   bun run check-types
   bun run build
   ```

3. Test your changes thoroughly
4. Update documentation if needed

### PR Guidelines

1. **Title Format**
   - Use conventional commit format
   - ✅ `feat: add semantic search to memory graph`
   - ✅ `fix: resolve authentication redirect loop`
   - ✅ `docs: update deployment guide`
   - ❌ `update stuff`

2. **Description**
   Include:
   - **What**: What changes you made
   - **Why**: Why you made these changes
   - **How**: How you implemented them
   - **Screenshots**: For UI changes
   - **Breaking Changes**: If applicable
   - **Related Issues**: Link to issues

3. **Size**
   - Keep PRs focused and reasonably sized
   - Prefer multiple small PRs over one large PR
   - Each PR should address a single concern

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(search): add hybrid search with reranking
fix(auth): resolve session expiration bug
docs(readme): update deployment instructions
refactor(api): simplify document ingestion flow
```

### Review Process

1. All PRs require at least one review
2. Address feedback promptly and professionally
3. Be open to suggestions and improvements
4. Maintain a collaborative attitude
5. CI checks must pass before merging

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Environment**:
  - OS (macOS, Linux, Windows)
  - Node.js version
  - Bun version
  - Browser (if frontend issue)

- **Steps to Reproduce**:
  1. Step one
  2. Step two
  3. Step three

- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Screenshots**: If applicable
- **Error Messages**: Console logs or error traces

### Feature Requests

For feature requests, please provide:

- **Problem Statement**: What problem does this solve?
- **Proposed Solution**: How should it work?
- **Alternatives Considered**: Other approaches you've thought of
- **Use Cases**: Real-world scenarios where this would help
- **Additional Context**: Any relevant information

## 🏗️ Architecture Guidelines

### State Management

- Use **Zustand** for global client state
- Use **TanStack Query** for server state
- Keep state as local as possible
- Use proper TypeScript types for state
- Avoid prop drilling with context

### API Integration

- Use the existing API client patterns
- Handle loading, error, and success states
- Implement proper error boundaries
- Use optimistic updates where appropriate
- Add retry logic for network failures

### Performance

- Use `React.memo()` for expensive components
- Implement proper loading states
- Optimize images and assets
- Use code splitting for large bundles
- Lazy load components when appropriate
- Minimize bundle size

### Database

- Use Drizzle ORM for queries
- Always scope data by `organization_id`
- Use transactions for multi-step operations
- Add proper indexes for performance
- Follow RLS (Row-Level Security) patterns

## 🧪 Testing

While we don't have a comprehensive test suite yet, we encourage:

- Manual testing of all changes
- Testing edge cases and error conditions
- Testing across different browsers
- Testing with different data scenarios
- Performance testing for critical paths

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Maintain professionalism in all interactions
- Respect different perspectives and experiences

### Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and community chat
- **Pull Request Comments**: For code review discussions

## 📄 License

By contributing to Supermemory, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](LICENSE) file).

## 🙏 Recognition

All contributors will be recognized in our README and release notes. We appreciate every contribution, no matter how small!

---

Thank you for contributing to Supermemory! Together, we're building a powerful self-hosted AI memory platform. 🚀

**Repository**: https://github.com/guilhermexp/supermemory  
**Maintainer**: guilhermexp

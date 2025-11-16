# AI Issues & Bug Tracking Directory

## Purpose

This directory tracks identified bugs, known issues, blockers, and problems in the Supermemory project. Issues are organized by status and severity for easy reference and resolution tracking.

## Contents

### Active Issues
Issues currently being worked on or pending resolution:
- File per major issue
- Each file contains detailed description, reproduction steps, and workarounds

### Resolved Issues (Archived)
Issues that have been fixed or resolved:
- Moved to `archived/` subdirectory
- Kept for reference and historical tracking
- Prevents duplication of fixes

## Organization Structure

```
ai_issues/
├── README.md (this file)
├── ACTIVE_ISSUES.md (index of current issues)
├── archived/
│   └── [resolved issues]
└── [current issue files]
```

## Issue Format Template

Each issue file should follow this structure:

```markdown
# [Issue Title]

## Status
- [ ] Open
- [ ] In Progress
- [ ] Blocked
- [ ] Resolved
- [ ] Won't Fix

## Severity
- Critical
- High
- Medium
- Low

## Description
[Detailed description of the issue]

## Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Expected result vs actual result]

## Workaround
[If available]

## Related Files/Components
- Component A
- Component B

## Related Issues
- Issue #123
- Related PR #456

## Notes
[Additional context]

## Last Updated
[Date]
```

## Status Indicators

- 🔴 **Critical** - System broken, production impact
- 🟠 **High** - Major feature broken, significant impact
- 🟡 **Medium** - Partial feature broken, workaround exists
- 🟢 **Low** - Minor issues, cosmetic problems

## Adding New Issues

When discovering a new issue:

1. Create a new `.md` file with descriptive name
2. Use the template format above
3. Include all reproduction steps
4. Add relevant component tags
5. Reference related code locations
6. Update ACTIVE_ISSUES.md index
7. Add to appropriate severity level

## Resolving Issues

When an issue is resolved:

1. Update status to "Resolved"
2. Add resolution notes and workaround alternatives
3. Reference commit/PR that fixed it
4. Archive file to `archived/` directory
5. Update ACTIVE_ISSUES.md to remove from active list
6. Update related documentation

## Cross-References

- **Changelog**: See `ai_changelog/CHANGELOG.md` for fixes
- **Documentation**: See `ai_docs/` for technical details
- **Specifications**: See `ai_specs/` for requirements
- **Research**: See `ai_research/` for investigation notes

## Current Issue Count

- ✅ Active: 0 (All fixed!)
- ✅ Archived: 5
  - YOUTUBE_TITLE_UNKNOWN_BUG.md - Fixed Nov 2025
  - YOUTUBE_TRANSCRIPT_FIX_RESOLVED.md - Fixed Nov 2025
  - Authentication Schema Issues - Fixed Nov 16, 2025
  - Database Performance - Fixed Nov 16, 2025
  - Query Optimization - Fixed Nov 16, 2025
- 📊 Total: 5 (All Resolved)

## Recent Resolutions (Nov 16, 2025)

### 🔐 Authentication Schema Fixed
**Status**: ✅ RESOLVED
- **Issue**: Column name mismatch (`hashed_password` vs `password_hash`)
- **Fix**: Updated auth.ts and password.ts, created missing tables
- **Commit**: d381ebf7
- **Testing**: All auth flows verified with devtools

### ⚡ Database Performance Optimized
**Status**: ✅ RESOLVED
- **Issue**: Document queries taking 200-500ms
- **Fix**: Applied migration 0013 with 7 new indexes
- **Impact**: 80-95% query performance improvement
- **Testing**: Schema sync verified, all migrations applied

## Last Updated

November 16, 2025 - Authentication schema and database performance issues resolved

## Guidelines

- Be specific in issue descriptions
- Include error messages and stack traces
- Add reproduction steps so others can verify
- Reference code files and line numbers
- Include environment details (browser, OS, etc.)
- Use consistent formatting
- Archive resolved issues promptly
- Keep related issues linked

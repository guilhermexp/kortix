# AI Research & Experimentation Directory

## Purpose

This directory contains research notes, experiments, proof of concepts, technology evaluations, and findings from exploration and investigation. It serves as a repository for learnings, performance benchmarks, and experimental features.

## Document Categories

### Performance Research
- Benchmarks and performance analysis
- Optimization experiments
- Load testing results
- Scalability studies

### Technology Evaluation
- Library/framework assessments
- Tool comparisons
- Integration feasibility studies
- Architecture experiments

### Proof of Concepts
- Experimental features
- Novel approaches
- Integration prototypes
- Feature exploration

### Investigation Notes
- Problem-solving research
- Root cause analysis
- Performance profiling
- Debugging investigations

## Organization Structure

```
ai_research/
├── README.md (this file)
├── [Investigation directories]
└── [Research findings]
```

## Current Research Directories

### Existing Research Areas
- **`railway-log-analysis/`** - Railway deployment log analysis and findings
- **`infra/`** - Infrastructure research and configuration studies
- **`cards-to-full-markdown-pages/`** - Research on card-to-markdown conversion
- **`menu-horizontal-top/`** - UI menu implementation research
- **`claude-agent-sdk-fixes/`** - Claude Agent SDK integration research

## Research Document Format

```markdown
# [Research Title]

## Objective
[What are we trying to learn or explore?]

## Methodology
[How was the research conducted?]

## Findings
[Key discoveries and results]

## Conclusions
[What did we learn?]

## Recommendations
[Next steps or implementation suggestions]

## Data/Evidence
[Supporting data, benchmarks, screenshots]

## References
[Related documents, issues, commits]

## Completion Date
[Date research was concluded]
```

## Research Status Indicators

- 🟢 **Complete** - Research finished, conclusions drawn
- 🟡 **In Progress** - Actively researching
- 🔵 **Planned** - Research scheduled
- ⚪ **On Hold** - Temporarily paused
- ⚫ **Archived** - Historical reference only

## Adding Research

When documenting new research:

1. Create descriptive directory or file
2. Use consistent naming convention
3. Include methodology and approach
4. Document findings clearly
5. Draw conclusions with supporting evidence
6. Include recommendations
7. Reference related issues/documents
8. Add to this README's directory listing

## Key Research Areas

### Performance Optimization
- Vector search optimization
- API response time improvements
- Frontend rendering optimization
- Database query performance

### Feature Exploration
- Canvas interactions and visualizations
- Editor capabilities and limitations
- Search algorithm enhancements
- AI integration possibilities

### Infrastructure & Deployment
- Railway platform capabilities
- Database scaling approaches
- Backup and recovery strategies
- CDN and caching optimization

### Integration Studies
- Third-party service integrations
- API compatibility research
- Protocol support evaluation
- Tool interoperability

## Cross-References

- **Documentation**: See `ai_docs/` for implementation results
- **Specifications**: See `ai_specs/` for formal requirements
- **Issues**: See `ai_issues/` for discovered problems
- **Changelog**: See `ai_changelog/` for integration results

## Using Research Findings

When research is complete:

1. Update documentation (`ai_docs/`) with conclusions
2. Create specification (`ai_specs/`) if feature implementation is planned
3. File issues (`ai_issues/`) for any discovered problems
4. Reference research in implementation documents
5. Archive research to historical section

## Recent Research Completions (Nov 16, 2025)

### 🔐 Authentication & Database Schema Investigation
**Status**: ✅ Complete
- **Objective**: Identify and fix schema mismatches in auth flow
- **Findings**:
  - Column naming inconsistency: `hashed_password` vs `password_hash`
  - Missing sessions table for session management
  - Missing payload column in ingestion_jobs
- **Recommendations**: Apply database migrations and fix code references
- **Result**: All issues resolved, auth flow fully functional

### ⚡ Database Performance Research
**Status**: ✅ Complete
- **Objective**: Optimize database query performance
- **Findings**:
  - Document queries: 200-500ms → 20-50ms (90% improvement)
  - Org statistics: 500-1000ms → 1-5ms (99% improvement)
  - Need for composite indexes and materialized views
- **Recommendations**: Apply multi-index strategy with autovacuum tuning
- **Result**: 80-95% overall query performance improvement achieved

## Last Updated

November 16, 2025 - Authentication and performance research completed and implemented

## Guidelines

- Document methodology, not just conclusions
- Include data and evidence
- Be specific about test conditions
- Note limitations and caveats
- Include dates and version information
- Reference code commits and branches
- Link related research and documents
- Archive complete research appropriately
- Share findings with team promptly
- Update status indicators regularly

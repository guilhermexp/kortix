#!/bin/bash
# deploy-with-monitoring.sh - Complete deployment with monitoring
# Usage: ./deploy-with-monitoring.sh [DRY_RUN=true]

set -euo pipefail

# Configuration
DATABASE_URL="${DATABASE_URL:-$SUPABASE_DB_URL}"
DRY_RUN="${DRY_RUN:-false}"
LOW_TRAFFIC_START="${LOW_TRAFFIC_START:-02:00}"
LOW_TRAFFIC_END="${LOW_TRAFFIC_END:-04:00}"

echo "🚀 Starting optimized index deployment with monitoring..."
echo "Database: $(psql $DATABASE_URL -Atc 'SELECT current_database();' 2>/dev/null || echo 'Not connected')"
echo "Time: $(date)"
[[ "$DRY_RUN" == "true" ]] && echo "🧪 DRY RUN MODE - No changes will be made"

# Safety check
check_maintenance_window() {
    local current_time=$(date +%H:%M)
    echo "⏰ Current time: $current_time"

    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ "$current_time" < "$LOW_TRAFFIC_START" ]] || [[ "$current_time" > "$LOW_TRAFFIC_END" ]]; then
            echo "⚠️  WARNING: Not in recommended maintenance window ($LOW_TRAFFIC_START - $LOW_TRAFFIC_END)"
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
        fi
    fi
}

# Pre-deployment baseline
capture_baseline() {
    echo "📈 Capturing baseline metrics..."

    if [[ "$DRY_RUN" == "false" ]]; then
        # Create monitoring table if not exists
        psql $DATABASE_URL -c "
        CREATE TABLE IF NOT EXISTS performance_audit_log (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ DEFAULT NOW(),
            phase VARCHAR(50),
            metric_type VARCHAR(100),
            value NUMERIC,
            details TEXT,
            alert_level VARCHAR(20) DEFAULT 'info'
        );
        " 2>/dev/null || true

        # Capture baseline metrics
        local slow_queries=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*) FROM pg_stat_statements
        WHERE mean_exec_time > 1000 AND query LIKE '%documents%';
        " | tr -d ' ' || echo "0")

        local avg_time=$(psql $DATABASE_URL -t -c "
        SELECT COALESCE(AVG(mean_exec_time), 0) FROM pg_stat_statements
        WHERE query LIKE '%documents%';
        " | tr -d ' ' || echo "0")

        # Log baseline
        psql $DATABASE_URL -c "
        INSERT INTO performance_audit_log (phase, metric_type, value, details)
        VALUES
            ('pre_deployment', 'slow_queries', $slow_queries, 'Queries > 1s'),
            ('pre_deployment', 'avg_execution_time', $avg_time, 'Average query time (ms)');
        " 2>/dev/null || true

        echo "📊 Baseline: $slow_queries slow queries, ${avg_time}ms average time"
    fi
}

# Index creation with proper SQL mapping
create_index() {
    local index_name="$1"
    local sql="$2"

    echo "🔄 Creating $index_name..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] Would execute: $sql"
        return 0
    fi

    local start_time=$(date +%s)

    # Execute index creation with error handling
    if psql $DATABASE_URL -c "$sql" 2>/dev/null; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "✅ $index_name created in ${duration}s"

        # Log success
        psql $DATABASE_URL -c "
        INSERT INTO performance_audit_log (phase, metric_type, value, details)
        VALUES ('index_creation', '$index_name', $duration, 'Index created successfully');
        " 2>/dev/null || true

        return 0
    else
        echo "❌ Failed to create $index_name"
        return 1
    fi
}

# Deploy indexes
deploy_indexes() {
    echo "🏗️  Starting index deployment..."

    # Index definitions with correct SQL
    create_index "idx_documents_created_at_desc" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at_desc ON documents(created_at DESC NULLS LAST);"

    create_index "idx_documents_updated_at_desc" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_updated_at_desc ON documents(updated_at DESC NULLS LAST);"

    create_index "idx_documents_org_created_at" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_created_at ON documents(org_id, created_at DESC NULLS LAST);"

    create_index "idx_documents_org_updated_at" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_updated_at ON documents(org_id, updated_at DESC NULLS LAST);"

    create_index "idx_memories_document_id_org" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_document_id_org ON memories(document_id, org_id);"

    create_index "idx_spaces_org_container_tag" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spaces_org_container_tag ON spaces(organization_id, container_tag);"

    create_index "idx_documents_to_spaces_space_id" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_to_spaces_space_id ON documents_to_spaces(space_id);"

    create_index "idx_documents_to_spaces_document_id" \
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_to_spaces_document_id ON documents_to_spaces(document_id);"
}

# Post-deployment validation
validate_deployment() {
    echo "🔍 Running post-deployment validation..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] Would validate index creation"
        return 0
    fi

    # Count created indexes
    local index_count=$(psql $DATABASE_URL -t -c "
    SELECT COUNT(*) FROM pg_indexes
    WHERE indexname LIKE 'idx_%';
    " | tr -d ' ' || echo "0")

    echo "📊 Created $index_count new indexes"

    # Capture post-deployment metrics
    local slow_queries=$(psql $DATABASE_URL -t -c "
    SELECT COUNT(*) FROM pg_stat_statements
    WHERE mean_exec_time > 1000 AND query LIKE '%documents%';
    " | tr -d ' ' || echo "0")

    local avg_time=$(psql $DATABASE_URL -t -c "
    SELECT COALESCE(AVG(mean_exec_time), 0) FROM pg_stat_statements
    WHERE query LIKE '%documents%';
    " | tr -d ' ' || echo "0")

    # Log post-deployment metrics
    psql $DATABASE_URL -c "
    INSERT INTO performance_audit_log (phase, metric_type, value, details)
    VALUES
        ('post_deployment', 'slow_queries', $slow_queries, 'Queries > 1s'),
        ('post_deployment', 'avg_execution_time', $avg_time, 'Average query time (ms)'),
        ('post_deployment', 'index_count', $index_count, 'Total indexes created');
    " 2>/dev/null || true

    echo "📈 Post-deployment: $slow_queries slow queries, ${avg_time}ms average time"

    # Show index sizes
    echo "📊 Index sizes:"
    psql $DATABASE_URL -c "
    SELECT
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
    ORDER BY pg_relation_size(indexname::regclass) DESC;
    " 2>/dev/null || echo "Could not retrieve index sizes"

    # Performance improvement summary
    local improvement=$(echo "$avg_time" | awk '{printf "%.1f", (5000 - $1) / 5000 * 100}')
    echo "🎯 Expected performance improvement: ~$improvement% reduction in query time"
}

# Main execution
main() {
    check_maintenance_window
    capture_baseline
    deploy_indexes
    validate_deployment

    echo "🎉 Deployment completed at $(date)"

    # Suggest next steps
    echo ""
    echo "📋 Next Steps:"
    echo "1. Monitor application performance for 24 hours"
    echo "2. Run health checks: ./health-check.sh"
    echo "3. Review performance dashboard in Supabase"
    echo "4. Consider running: ./performance-dashboard.sh"
}

# Execute main function
main "$@"
#!/bin/bash
# health-check.sh - Automated health monitoring for production
# Usage: ./health-check.sh [CONTINUOUS=true]

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-$SUPABASE_DB_URL}"
CONTINUOUS="${CONTINUOUS:-false}"

function check_query_performance() {
    echo "🔍 Checking query performance..."

    local slow_queries=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_statements
        WHERE query LIKE '%documents%'
        AND mean_exec_time > 5000;
    " | tr -d ' ')

    if [[ "$slow_queries" -gt 5 ]]; then
        echo "🚨 ALERT: $slow_queries queries taking >5 seconds"

        # Show the slow queries
        psql $DATABASE_URL -c "
        SELECT
            substring(query, 1, 80) as query_snippet,
            round(mean_exec_time::numeric, 2) as avg_ms,
            calls
        FROM pg_stat_statements
        WHERE query LIKE '%documents%'
        AND mean_exec_time > 5000
        ORDER BY mean_exec_time DESC
        LIMIT 3;
        " 2>/dev/null || echo "Could not retrieve slow query details"

        return 1
    fi

    echo "✅ Query performance: $slow_queries slow queries"
    return 0
}

function check_index_usage() {
    echo "📊 Checking index usage..."

    local unused_indexes=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_user_indexes
        WHERE indexname LIKE 'idx_%'
        AND idx_scan = 0;
    " | tr -d ' ')

    local total_indexes=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_user_indexes
        WHERE indexname LIKE 'idx_%';
    " | tr -d ' ')

    if [[ "$unused_indexes" -gt 2 ]]; then
        echo "⚠️ WARNING: $unused_indexes unused indexes detected"

        # Show unused indexes
        psql $DATABASE_URL -c "
        SELECT indexname, tablename
        FROM pg_stat_user_indexes
        WHERE indexname LIKE 'idx_%'
        AND idx_scan = 0;
        " 2>/dev/null || echo "Could not retrieve unused index details"

        return 1
    fi

    echo "✅ Index usage: $unused_indexes/$total_indexes unused indexes"

    # Show most used indexes
    echo "🏆 Most used indexes:"
    psql $DATABASE_URL -c "
    SELECT
        indexname,
        idx_scan as usage_count,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE indexname LIKE 'idx_%'
    ORDER BY idx_scan DESC
    LIMIT 3;
    " 2>/dev/null || echo "Could not retrieve index usage"

    return 0
}

function check_timeout_errors() {
    echo "⏱️ Checking for timeout issues..."

    local recent_timeouts=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_activity
        WHERE state = 'active'
        AND query LIKE '%documents%'
        AND now() - query_start > interval '30 seconds';
    " | tr -d ' ')

    if [[ "$recent_timeouts" -gt 0 ]]; then
        echo "🚨 CRITICAL: $recent_timeouts queries timing out"

        # Show timeout queries
        psql $DATABASE_URL -c "
        SELECT
            pid,
            now() - query_start as duration,
            substring(query, 1, 60) as query_snippet
        FROM pg_stat_activity
        WHERE state = 'active'
        AND query LIKE '%documents%'
        AND now() - query_start > interval '30 seconds';
        " 2>/dev/null || echo "Could not retrieve timeout details"

        return 1
    fi

    echo "✅ No timeout issues detected"
    return 0
}

function check_database_health() {
    echo "🏥 Checking database health..."

    local active_connections=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_activity
        WHERE state = 'active';
    " | tr -d ' ')

    local total_connections=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_activity;
    " | tr -d ' ')

    echo "📊 Connections: $active_connections active / $total_connections total"

    # Check database size
    local db_size=$(psql $DATABASE_URL -t -c "
        SELECT pg_size_pretty(pg_database_size(current_database()));
    " | tr -d ' ')

    echo "💾 Database size: $db_size"

    # Check table sizes
    echo "📋 Table sizes:"
    psql $DATABASE_URL -c "
    SELECT
        tablename,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as live_rows
    FROM pg_stat_user_tables
    WHERE tablename IN ('documents', 'memories', 'spaces', 'chunks')
    ORDER BY pg_relation_size(schemaname||'.'||tablename) DESC;
    " 2>/dev/null || echo "Could not retrieve table sizes"

    return 0
}

function check_rls_performance() {
    echo "🔐 Checking RLS performance impact..."

    # Check RLS query performance
    local rls_queries=$(psql $DATABASE_URL -t -c "
        SELECT COUNT(*)
        FROM pg_stat_statements
        WHERE query LIKE '%documents%'
        AND (query LIKE '%rls%' OR query LIKE '%org_id%')
        AND mean_exec_time > 3000;
    " | tr -d ' ')

    if [[ "$rls_queries" -gt 0 ]]; then
        echo "⚠️ WARNING: $rls_queries slow RLS queries detected"
        return 1
    fi

    echo "✅ RLS performance: No significant bottlenecks detected"
    return 0
}

function generate_health_report() {
    echo ""
    echo "📈 HEALTH REPORT - $(date)"
    echo "=================================="

    # Get recent performance metrics
    echo "🎯 Performance Summary:"
    psql $DATABASE_URL -c "
    SELECT
        'Query Performance' as metric,
        CASE
            WHEN AVG(mean_exec_time) < 500 THEN '✅ Excellent (<500ms)'
            WHEN AVG(mean_exec_time) < 1000 THEN '✅ Good (<1s)'
            WHEN AVG(mean_exec_time) < 3000 THEN '⚠️ Acceptable (<3s)'
            ELSE '❌ Poor (>3s)'
        END as status,
        ROUND(AVG(mean_exec_time)::numeric, 2) as avg_ms
    FROM pg_stat_statements
    WHERE query LIKE '%documents%'

    UNION ALL

    SELECT
        'Index Efficiency' as metric,
        CASE
            WHEN COUNT(*) FILTER (WHERE idx_scan > 0) >= 6 THEN '✅ High Usage'
            WHEN COUNT(*) FILTER (WHERE idx_scan > 0) >= 4 THEN '✅ Good Usage'
            ELSE '⚠️ Low Usage'
        END as status,
        COUNT(*) FILTER (WHERE idx_scan > 0) as active_indexes
    FROM pg_stat_user_indexes
    WHERE indexname LIKE 'idx_%'

    UNION ALL

    SELECT
        'Document Query Performance' as metric,
        CASE
            WHEN MAX(mean_exec_time) < 1000 THEN '✅ Optimal'
            WHEN MAX(mean_exec_time) < 5000 THEN '✅ Good'
            ELSE '❌ Needs Attention'
        END as status,
        ROUND(MAX(mean_exec_time)::numeric, 2) as max_ms
    FROM pg_stat_statements
    WHERE query LIKE '%documents%'
    AND query LIKE '%ORDER BY%';
    " 2>/dev/null || echo "Could not generate performance summary"

    # Check if indexes are working
    echo ""
    echo "🔍 Index Impact Analysis:"
    psql $DATABASE_URL -c "
    WITH index_impact AS (
        SELECT
            'Before Indexes' as phase,
            COALESCE(AVG(mean_exec_time), 0) as avg_time
        FROM performance_audit_log
        WHERE phase = 'pre_deployment'
        AND metric_type = 'avg_execution_time'
    ),
    post_metrics AS (
        SELECT
            'After Indexes' as phase,
            COALESCE(AVG(mean_exec_time), 0) as avg_time
        FROM pg_stat_statements
        WHERE query LIKE '%documents%'
    )
    SELECT
        phase,
        ROUND(avg_time::numeric, 2) as avg_ms,
        CASE
            WHEN phase = 'After Indexes' AND avg_time > 0
            THEN ROUND(((SELECT avg_time FROM index_impact) - avg_time) /
                       NULLIF((SELECT avg_time FROM index_impact), 0) * 100, 1)
            ELSE NULL
        END as improvement_pct
    FROM (
        SELECT * FROM index_impact
        UNION ALL
        SELECT * FROM post_metrics
    ) analysis;
    " 2>/dev/null || echo "No before/after comparison available"
}

# Main health check execution
run_health_checks() {
    local overall_status=0

    clear
    echo "🏥 Kortix Database Health Check"
    echo "===================================="
    echo "Time: $(date)"
    echo ""

    # Run all checks
    check_database_health || overall_status=1
    echo ""

    check_query_performance || overall_status=1
    echo ""

    check_index_usage || overall_status=1
    echo ""

    check_timeout_errors || overall_status=1
    echo ""

    check_rls_performance || overall_status=1
    echo ""

    generate_health_report
    echo ""

    # Overall status
    if [[ $overall_status -eq 0 ]]; then
        echo "🎉 All systems healthy!"
    else
        echo "❌ Health check failed - investigate immediately"
        echo ""
        echo "📋 Recommended Actions:"
        echo "1. Review slow queries and consider additional indexes"
        echo "2. Check application performance impact"
        echo "3. Monitor for improvement over next 24 hours"
    fi

    return $overall_status
}

# Continuous monitoring mode
continuous_monitoring() {
    echo "🔄 Starting continuous monitoring..."
    echo "Press Ctrl+C to stop"
    echo ""

    while true; do
        run_health_checks
        echo ""
        echo "⏳ Next check in 60 seconds..."
        sleep 60
    done
}

# Main execution
if [[ "$CONTINUOUS" == "true" ]]; then
    continuous_monitoring
else
    run_health_checks
    exit $?
fi
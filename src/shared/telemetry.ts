/**
 * Telemetry & Analytics
 * 
 * Structured logging for debugging and performance optimization.
 * All data stored locally, never sent to external servers.
 */

export interface TelemetryEvent {
    timestamp: number;
    domain: string;
    taskId: string;
    strategyUsed: 'dom' | 'a11y' | 'vision' | 'semantic' | 'fuzzy' | 'heuristic';
    actionType: string;
    success: boolean;
    retries: number;
    duration: number;
    errorDetails?: string;
    screenshotOnFailure?: string;
    modelUsed?: string;
    tokenUsage?: number;
}

export interface TelemetryStats {
    totalEvents: number;
    successRate: number;
    avgRetries: number;
    avgDuration: number;
    strategyBreakdown: Record<string, { count: number; successRate: number }>;
    topErrors: Array<{ error: string; count: number }>;
    domainStats: Record<string, { total: number; success: number }>;
}

const TELEMETRY_KEY = 'telemetry_log';
const MAX_EVENTS = 1000; // Keep last 1000 events

/**
 * Log a telemetry event
 */
export async function logTelemetry(event: TelemetryEvent): Promise<void> {
    try {
        const result = await chrome.storage.local.get(TELEMETRY_KEY);
        const log: TelemetryEvent[] = result[TELEMETRY_KEY] || [];

        // Add new event
        log.push(event);

        // Keep only last MAX_EVENTS
        const pruned = log.slice(-MAX_EVENTS);

        await chrome.storage.local.set({ [TELEMETRY_KEY]: pruned });
    } catch (error) {
        console.error('Failed to log telemetry:', error);
    }
}

/**
 * Get all telemetry events
 */
export async function getTelemetry(): Promise<TelemetryEvent[]> {
    const result = await chrome.storage.local.get(TELEMETRY_KEY);
    return result[TELEMETRY_KEY] || [];
}

/**
 * Get telemetry statistics
 */
export async function getTelemetryStats(): Promise<TelemetryStats> {
    const events = await getTelemetry();

    if (events.length === 0) {
        return {
            totalEvents: 0,
            successRate: 0,
            avgRetries: 0,
            avgDuration: 0,
            strategyBreakdown: {},
            topErrors: [],
            domainStats: {}
        };
    }

    const successCount = events.filter(e => e.success).length;
    const successRate = successCount / events.length;

    const avgRetries = events.reduce((sum, e) => sum + e.retries, 0) / events.length;
    const avgDuration = events.reduce((sum, e) => sum + e.duration, 0) / events.length;

    // Strategy breakdown
    const strategyBreakdown: Record<string, { count: number; successRate: number }> = {};
    for (const event of events) {
        if (!strategyBreakdown[event.strategyUsed]) {
            strategyBreakdown[event.strategyUsed] = { count: 0, successRate: 0 };
        }
        strategyBreakdown[event.strategyUsed].count++;
        if (event.success) {
            strategyBreakdown[event.strategyUsed].successRate++;
        }
    }

    // Calculate success rates
    for (const strategy in strategyBreakdown) {
        const stats = strategyBreakdown[strategy];
        stats.successRate = stats.successRate / stats.count;
    }

    // Top errors
    const errorCounts = new Map<string, number>();
    for (const event of events) {
        if (!event.success && event.errorDetails) {
            const error = event.errorDetails.slice(0, 100); // Truncate long errors
            errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
        }
    }

    const topErrors = Array.from(errorCounts.entries())
        .map(([error, count]) => ({ error, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Domain stats
    const domainStats: Record<string, { total: number; success: number }> = {};
    for (const event of events) {
        if (!domainStats[event.domain]) {
            domainStats[event.domain] = { total: 0, success: 0 };
        }
        domainStats[event.domain].total++;
        if (event.success) {
            domainStats[event.domain].success++;
        }
    }

    return {
        totalEvents: events.length,
        successRate,
        avgRetries,
        avgDuration,
        strategyBreakdown,
        topErrors,
        domainStats
    };
}

/**
 * Clear telemetry data
 */
export async function clearTelemetry(): Promise<void> {
    await chrome.storage.local.remove(TELEMETRY_KEY);
}

/**
 * Export telemetry data as JSON
 */
export async function exportTelemetry(): Promise<string> {
    const events = await getTelemetry();
    const stats = await getTelemetryStats();

    return JSON.stringify({
        exportDate: new Date().toISOString(),
        stats,
        events
    }, null, 2);
}

/**
 * Get events for a specific domain
 */
export async function getTelemetryForDomain(domain: string): Promise<TelemetryEvent[]> {
    const events = await getTelemetry();
    return events.filter(e => e.domain === domain);
}

/**
 * Get events in time range
 */
export async function getTelemetryInRange(
    startTime: number,
    endTime: number
): Promise<TelemetryEvent[]> {
    const events = await getTelemetry();
    return events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
}

/**
 * Generate task ID for grouping related events
 */
export function generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


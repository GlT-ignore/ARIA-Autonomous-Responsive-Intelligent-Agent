/**
 * Community Pattern Library
 * 
 * Privacy-first pattern sharing:
 * - Patterns stored locally by default
 * - Optional cloud sync (opt-in only)
 * - No personal data collected (only domain + steps + success rate)
 */

import type { TaskStep } from './types';

export interface CommunityPattern {
    id: string;
    domainHash: string;
    taskHash: string;
    steps: TaskStep[];
    successRate: number;
    totalExecutions: number;
    upvotes: number;
    downvotes: number;
    createdAt: number;
    lastUsed: number;
    version: string;
}

export interface PatternSharingConfig {
    enabled: boolean;
    cloudEndpoint?: string;
    anonymousId?: string; // Random UUID, no tracking
}

const PATTERN_SHARING_KEY = 'pattern_sharing_config';
const LOCAL_PATTERNS_KEY = 'community_patterns_local';

/**
 * Load pattern sharing configuration
 */
export async function loadPatternSharingConfig(): Promise<PatternSharingConfig> {
    const result = await chrome.storage.local.get(PATTERN_SHARING_KEY);
    return result[PATTERN_SHARING_KEY] || { enabled: false };
}

/**
 * Save pattern sharing configuration
 */
export async function savePatternSharingConfig(config: PatternSharingConfig): Promise<void> {
    await chrome.storage.local.set({ [PATTERN_SHARING_KEY]: config });
}

/**
 * Upload pattern to community (if sharing enabled)
 */
export async function uploadPattern(pattern: CommunityPattern): Promise<boolean> {
    const config = await loadPatternSharingConfig();
    
    if (!config.enabled || !config.cloudEndpoint) {
        // Just store locally
        await storeLocalPattern(pattern);
        return false;
    }

    try {
        // Upload to cloud
        const response = await fetch(`${config.cloudEndpoint}/api/patterns`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Anonymous-ID': config.anonymousId || 'unknown'
            },
            body: JSON.stringify({
                domainHash: pattern.domainHash,
                taskHash: pattern.taskHash,
                steps: pattern.steps,
                successRate: pattern.successRate,
                totalExecutions: pattern.totalExecutions,
                version: pattern.version
            })
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        // Also store locally as backup
        await storeLocalPattern(pattern);
        return true;
    } catch (error) {
        console.error('Failed to upload pattern:', error);
        // Fallback to local storage
        await storeLocalPattern(pattern);
        return false;
    }
}

/**
 * Query community patterns for a domain + task
 */
export async function queryCommunityPatterns(
    domainHash: string,
    taskHash: string,
    minSuccessRate: number = 0.7
): Promise<CommunityPattern[]> {
    const config = await loadPatternSharingConfig();
    
    // Always check local patterns first
    const localPatterns = await queryLocalPatterns(domainHash, taskHash);
    
    if (!config.enabled || !config.cloudEndpoint) {
        return localPatterns.filter(p => p.successRate >= minSuccessRate);
    }

    try {
        // Query cloud patterns
        const url = new URL(`${config.cloudEndpoint}/api/patterns/query`);
        url.searchParams.set('domainHash', domainHash);
        url.searchParams.set('taskHash', taskHash);
        url.searchParams.set('minSuccessRate', String(minSuccessRate));

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'X-Anonymous-ID': config.anonymousId || 'unknown'
            }
        });

        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
        }

        const cloudPatterns: CommunityPattern[] = await response.json();
        
        // Merge local and cloud patterns, de-duplicate
        const merged = mergePatterns(localPatterns, cloudPatterns);
        return merged.filter(p => p.successRate >= minSuccessRate);
    } catch (error) {
        console.error('Failed to query community patterns:', error);
        // Fallback to local patterns only
        return localPatterns.filter(p => p.successRate >= minSuccessRate);
    }
}

/**
 * Vote on a pattern (upvote/downvote)
 */
export async function votePattern(patternId: string, vote: 'up' | 'down'): Promise<void> {
    const config = await loadPatternSharingConfig();
    
    if (!config.enabled || !config.cloudEndpoint) {
        return; // Voting only works with cloud sync
    }

    try {
        await fetch(`${config.cloudEndpoint}/api/patterns/${patternId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Anonymous-ID': config.anonymousId || 'unknown'
            },
            body: JSON.stringify({ vote })
        });
    } catch (error) {
        console.error('Failed to vote on pattern:', error);
    }
}

/**
 * Store pattern locally
 */
async function storeLocalPattern(pattern: CommunityPattern): Promise<void> {
    const result = await chrome.storage.local.get(LOCAL_PATTERNS_KEY);
    const patterns: CommunityPattern[] = result[LOCAL_PATTERNS_KEY] || [];
    
    // Check if pattern already exists (by domainHash + taskHash)
    const existingIndex = patterns.findIndex(
        p => p.domainHash === pattern.domainHash && p.taskHash === pattern.taskHash
    );
    
    if (existingIndex >= 0) {
        // Update existing
        patterns[existingIndex] = pattern;
    } else {
        // Add new
        patterns.push(pattern);
    }
    
    // Keep only top 500 patterns (by success rate)
    const pruned = patterns
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 500);
    
    await chrome.storage.local.set({ [LOCAL_PATTERNS_KEY]: pruned });
}

/**
 * Query local patterns
 */
async function queryLocalPatterns(
    domainHash: string,
    taskHash: string
): Promise<CommunityPattern[]> {
    const result = await chrome.storage.local.get(LOCAL_PATTERNS_KEY);
    const patterns: CommunityPattern[] = result[LOCAL_PATTERNS_KEY] || [];
    
    return patterns.filter(p => 
        p.domainHash === domainHash && 
        (p.taskHash === taskHash || calculateSimilarity(p.taskHash, taskHash) > 0.8)
    );
}

/**
 * Merge and deduplicate patterns
 */
function mergePatterns(
    local: CommunityPattern[],
    cloud: CommunityPattern[]
): CommunityPattern[] {
    const merged = new Map<string, CommunityPattern>();
    
    // Add all local patterns
    for (const pattern of local) {
        const key = `${pattern.domainHash}:${pattern.taskHash}`;
        merged.set(key, pattern);
    }
    
    // Merge cloud patterns (prefer higher success rate)
    for (const pattern of cloud) {
        const key = `${pattern.domainHash}:${pattern.taskHash}`;
        const existing = merged.get(key);
        
        if (!existing || pattern.successRate > existing.successRate) {
            merged.set(key, pattern);
        }
    }
    
    return Array.from(merged.values())
        .sort((a, b) => b.successRate - a.successRate);
}

/**
 * Simple similarity score for task hashes
 */
function calculateSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;
    
    // Simple character overlap similarity
    const set1 = new Set(hash1.split(''));
    const set2 = new Set(hash2.split(''));
    const intersection = new Set([...set1].filter(c => set2.has(c)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
}

/**
 * Generate anonymous ID for privacy-preserving tracking
 */
export function generateAnonymousId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Clear all local community patterns
 */
export async function clearLocalPatterns(): Promise<void> {
    await chrome.storage.local.remove(LOCAL_PATTERNS_KEY);
}

/**
 * Get statistics about local patterns
 */
export async function getLocalPatternStats(): Promise<{
    total: number;
    avgSuccessRate: number;
    topDomains: string[];
}> {
    const result = await chrome.storage.local.get(LOCAL_PATTERNS_KEY);
    const patterns: CommunityPattern[] = result[LOCAL_PATTERNS_KEY] || [];
    
    if (patterns.length === 0) {
        return { total: 0, avgSuccessRate: 0, topDomains: [] };
    }
    
    const avgSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;
    
    const domainCounts = new Map<string, number>();
    for (const pattern of patterns) {
        domainCounts.set(pattern.domainHash, (domainCounts.get(pattern.domainHash) || 0) + 1);
    }
    
    const topDomains = Array.from(domainCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain]) => domain);
    
    return {
        total: patterns.length,
        avgSuccessRate,
        topDomains
    };
}


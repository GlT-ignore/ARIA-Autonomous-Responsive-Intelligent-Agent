/**
 * Task Pattern Matching Logic
 * 
 * Implements fuzzy matching and similarity scoring for task history memory.
 */

export interface TaskHistoryEntry {
    id: string;
    taskDescription: string;
    domainHash: string;
    normalizedTask: string;
    steps: TaskStep[];
    successCount: number;
    failureCount: number;
    lastExecuted: number;
    createdAt: number;
    averageExecutionTime: number;
    selectors: Record<string, string>;
    confidence: number;
}

export interface TaskStep {
    action: 'NAVIGATE' | 'FIND' | 'TYPE' | 'CLICK' | 'WAIT' | 'SELECT' | 'UPLOAD';
    target?: string;
    value?: string;
    url?: string;
}

// Stop words to ignore in task descriptions
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can'
]);

/**
 * Simple SHA-256 hash implementation
 */
async function sha256(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize task description for fingerprinting
 */
export function normalizeDescription(description: string): string {
    return description.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')  // Remove special characters
        .split(/\s+/)
        .filter(word => word.length > 0 && !STOP_WORDS.has(word))
        .sort()
        .join('_');
}

/**
 * Generate unique fingerprint for a task
 */
export async function generateTaskFingerprint(
    description: string,
    domain: string
): Promise<string> {
    const normalized = normalizeDescription(description);
    const domainHash = await sha256(domain);
    return `${domainHash.slice(0, 16)}_${normalized.slice(0, 50)}`;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Calculate similarity score between two descriptions (0-1)
 */
export function calculateSimilarity(desc1: string, desc2: string): number {
    const norm1 = normalizeDescription(desc1);
    const norm2 = normalizeDescription(desc2);
    
    if (norm1 === norm2) return 1.0;
    
    const distance = levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    
    if (maxLength === 0) return 0;
    
    return 1 - (distance / maxLength);
}

/**
 * Calculate recency bonus (0-1)
 */
function calculateRecencyBonus(lastExecuted: number): number {
    const daysSince = (Date.now() - lastExecuted) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return 1.0;
    if (daysSince < 30) return 0.8;
    if (daysSince < 90) return 0.5;
    return 0.2;
}

/**
 * Calculate confidence score for a task entry
 */
export function calculateConfidence(entry: TaskHistoryEntry): number {
    const total = entry.successCount + entry.failureCount;
    if (total === 0) return 0;
    
    const successRate = entry.successCount / total;
    const recencyBonus = calculateRecencyBonus(entry.lastExecuted);
    const frequencyBonus = Math.min(entry.successCount / 10, 1);
    
    // Weighted average: success rate is most important
    return (successRate * 0.6) + (recencyBonus * 0.2) + (frequencyBonus * 0.2);
}

/**
 * Find similar tasks in history
 */
export async function findSimilarTasks(
    taskDescription: string,
    domain: string,
    history: TaskHistoryEntry[],
    minConfidence: number = 0.8,
    minSuccesses: number = 3
): Promise<TaskHistoryEntry[]> {
    const domainHash = await sha256(domain);
    
    // Filter by domain first
    const domainMatches = history.filter(entry => 
        entry.domainHash === domainHash
    );
    
    if (domainMatches.length === 0) {
        return [];
    }
    
    // Calculate similarity scores
    const scored = domainMatches.map(entry => ({
        entry,
        similarity: calculateSimilarity(taskDescription, entry.taskDescription)
    }));
    
    // Filter by confidence and similarity
    const matches = scored
        .filter(item => 
            item.similarity >= 0.8 &&
            item.entry.successCount >= minSuccesses &&
            item.entry.confidence >= minConfidence
        )
        .sort((a, b) => {
            // Sort by similarity first, then confidence
            if (Math.abs(a.similarity - b.similarity) > 0.05) {
                return b.similarity - a.similarity;
            }
            return b.entry.confidence - a.entry.confidence;
        })
        .map(item => item.entry);
    
    return matches;
}

/**
 * Check if a pattern should be pruned
 */
export function shouldPrunePattern(entry: TaskHistoryEntry): boolean {
    const now = Date.now();
    const age = now - entry.lastExecuted;
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    
    const total = entry.successCount + entry.failureCount;
    const successRate = total > 0 ? entry.successCount / total : 0;
    
    // Prune if:
    // 1. Not used in 90 days
    // 2. Success rate < 30%
    // 3. Only 1-2 attempts and > 30 days old
    
    return (
        age > NINETY_DAYS ||
        successRate < 0.3 ||
        (total <= 2 && age > THIRTY_DAYS)
    );
}

/**
 * Generate a simple UUID
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


import type { TaskHistoryEntry, HistoryIndex, TaskStep } from './types';
import { generateTaskFingerprint, calculateConfidence, shouldPrunePattern, generateUUID } from './taskMatcher';

export type DetectionStrategy = 'dom' | 'a11y' | 'vision';

export type LlmConfig = {
	mode: 'heuristic' | 'llm';
	baseUrl?: string;
	apiKey?: string;
    model?: string;
	agentLoop?: boolean;
	maxSteps?: number;
	detectionStrategy?: DetectionStrategy;
	useVisionFallback?: boolean;
};

const LLM_KEY = 'webpilot_llm_config';

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
	await chrome.storage.local.set({ [LLM_KEY]: config });
}

export async function loadLlmConfig(): Promise<LlmConfig> {
	const obj = await chrome.storage.local.get(LLM_KEY);
	return (obj[LLM_KEY] as LlmConfig) || { mode: 'heuristic' };
}

// Agent loop settings
export type AgentLoopConfig = {
	enabled: boolean;
	maxIterations: number;
};

const AGENT_KEY = 'webpilot_agent_loop_config';

export async function saveAgentLoopConfig(config: AgentLoopConfig): Promise<void> {
	await chrome.storage.local.set({ [AGENT_KEY]: config });
}

export async function loadAgentLoopConfig(): Promise<AgentLoopConfig> {
	const obj = await chrome.storage.local.get(AGENT_KEY);
	return (obj[AGENT_KEY] as AgentLoopConfig) || { enabled: false, maxIterations: 20 };
}

// Task History Storage
const HISTORY_INDEX_KEY = 'taskHistory_index';

/**
 * Save task history entry
 */
export async function saveTaskHistory(
	taskDescription: string,
	domain: string,
	steps: TaskStep[],
	executionTime: number,
	selectors: Record<string, string>,
	success: boolean
): Promise<void> {
	const fingerprint = await generateTaskFingerprint(taskDescription, domain);
	const storageKey = `taskHistory_${fingerprint}`;
	const domainHash = await hashString(domain);
	
	// Check if entry exists
	const existing = await chrome.storage.local.get(storageKey);
	
	if (existing[storageKey]) {
		// Update existing entry
		const entry: TaskHistoryEntry = existing[storageKey] as TaskHistoryEntry;
		
		if (success) {
			entry.successCount++;
			entry.averageExecutionTime =
				(entry.averageExecutionTime * (entry.successCount - 1) + executionTime) /
				entry.successCount;
		} else {
			entry.failureCount++;
		}
		
		entry.lastExecuted = Date.now();
		entry.steps = steps; // Update with latest steps
		entry.selectors = { ...entry.selectors, ...selectors }; // Merge selectors
		entry.confidence = calculateConfidence(entry);
		
		await chrome.storage.local.set({ [storageKey]: entry });
	} else {
		// Create new entry
		const newEntry: TaskHistoryEntry = {
			id: generateUUID(),
			taskDescription,
			domainHash,
			normalizedTask: normalizeDescription(taskDescription),
			steps,
			successCount: success ? 1 : 0,
			failureCount: success ? 0 : 1,
			lastExecuted: Date.now(),
			createdAt: Date.now(),
			averageExecutionTime: executionTime,
			selectors,
			confidence: success ? 0.5 : 0.1
		};
		
		await chrome.storage.local.set({ [storageKey]: newEntry });
		
		// Update index
		await updateHistoryIndex(domainHash, fingerprint);
	}
}

/**
 * Load all task history entries for a domain
 */
export async function loadTaskHistory(domain: string): Promise<TaskHistoryEntry[]> {
	const domainHash = await hashString(domain);
	const indexData = await chrome.storage.local.get(HISTORY_INDEX_KEY);
	const index: HistoryIndex = (indexData[HISTORY_INDEX_KEY] as HistoryIndex) || {};
	
	const fingerprints = index[domainHash] || [];
	if (fingerprints.length === 0) {
		return [];
	}
	
	// Load all entries for this domain
	const keys = fingerprints.map(fp => `taskHistory_${fp}`);
	const data = await chrome.storage.local.get(keys);
	
	return Object.values(data) as TaskHistoryEntry[];
}

/**
 * Load all task history entries (for management UI)
 */
export async function loadAllTaskHistory(): Promise<TaskHistoryEntry[]> {
	const allData = await chrome.storage.local.get(null);
	const entries: TaskHistoryEntry[] = [];
	
	for (const key in allData) {
		if (key.startsWith('taskHistory_') && key !== HISTORY_INDEX_KEY) {
			entries.push(allData[key] as TaskHistoryEntry);
		}
	}
	
	return entries;
}

/**
 * Update task history index
 */
async function updateHistoryIndex(domainHash: string, fingerprint: string): Promise<void> {
	const indexData = await chrome.storage.local.get(HISTORY_INDEX_KEY);
	const index: HistoryIndex = (indexData[HISTORY_INDEX_KEY] as HistoryIndex) || {};
	
	if (!index[domainHash]) {
		index[domainHash] = [];
	}
	
	if (!index[domainHash].includes(fingerprint)) {
		index[domainHash].push(fingerprint);
	}
	
	await chrome.storage.local.set({ [HISTORY_INDEX_KEY]: index });
}

/**
 * Prune old task history entries
 */
export async function pruneTaskHistory(): Promise<number> {
	const allEntries = await loadAllTaskHistory();
	const toPrune: string[] = [];
	
	for (const entry of allEntries) {
		if (shouldPrunePattern(entry)) {
			const fingerprint = await generateTaskFingerprint(entry.taskDescription, 'dummy');
			toPrune.push(`taskHistory_${fingerprint}`);
		}
	}
	
	if (toPrune.length > 0) {
		await chrome.storage.local.remove(toPrune);
	}
	
	return toPrune.length;
}

/**
 * Clear all task history
 */
export async function clearTaskHistory(): Promise<void> {
	const allData = await chrome.storage.local.get(null);
	const historyKeys: string[] = [];
	
	for (const key in allData) {
		if (key.startsWith('taskHistory_')) {
			historyKeys.push(key);
		}
	}
	
	if (historyKeys.length > 0) {
		await chrome.storage.local.remove(historyKeys);
	}
}

/**
 * Get task history statistics
 */
export async function getHistoryStats(): Promise<{
	totalEntries: number;
	totalSuccesses: number;
	totalFailures: number;
	storageSize: number;
}> {
	const allEntries = await loadAllTaskHistory();
	
	let totalSuccesses = 0;
	let totalFailures = 0;
	
	for (const entry of allEntries) {
		totalSuccesses += entry.successCount;
		totalFailures += entry.failureCount;
	}
	
	// Estimate storage size
	const storageSize = JSON.stringify(allEntries).length;
	
	return {
		totalEntries: allEntries.length,
		totalSuccesses,
		totalFailures,
		storageSize
	};
}

// Helper functions
function normalizeDescription(description: string): string {
	const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
	return description.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.split(/\s+/)
		.filter(word => word.length > 0 && !stopWords.has(word))
		.sort()
		.join('_');
}

async function hashString(str: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}



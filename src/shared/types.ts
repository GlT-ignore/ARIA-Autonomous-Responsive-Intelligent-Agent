export type BusTarget = 'activeTab';

export interface BusRequest {
	id: string;
	type: string;
	payload?: unknown;
	target: BusTarget;
}

export interface BusResponse<T = unknown> {
	id: string;
	success: boolean;
	data?: T;
	error?: string;
}

export const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Task History Memory Types
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

export interface HistoryIndex {
	[domainHash: string]: string[];
}






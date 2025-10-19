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




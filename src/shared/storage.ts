export type LlmConfig = {
	mode: 'heuristic' | 'llm';
	baseUrl?: string;
	apiKey?: string;
    model?: string;
};

const LLM_KEY = 'webpilot_llm_config';

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
	await chrome.storage.local.set({ [LLM_KEY]: config });
}

export async function loadLlmConfig(): Promise<LlmConfig> {
	const obj = await chrome.storage.local.get(LLM_KEY);
	return (obj[LLM_KEY] as LlmConfig) || { mode: 'heuristic' };
}



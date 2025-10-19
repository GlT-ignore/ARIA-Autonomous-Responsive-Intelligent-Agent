import { loadLlmConfig } from './storage';

export async function planWithLLM(prompt: string): Promise<string> {
	const cfg = await loadLlmConfig();
	if (cfg.mode !== 'llm' || !cfg.baseUrl) throw new Error('LLM not configured');
	const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
		},
		body: JSON.stringify({
			model: cfg.model || 'llama-3.3-70b-instruct',
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.2,
		}),
	});
	if (!res.ok) throw new Error(`LLM error ${res.status}`);
	const data = await res.json();
	return data.choices?.[0]?.message?.content || '';
}



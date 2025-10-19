import { createId, type BusRequest, type BusResponse } from './shared/types';
import { loadLlmConfig, saveLlmConfig } from './shared/storage';
import { planWithLLM } from './shared/llmClient';

const log = (msg: unknown) => {
	const el = document.getElementById('log');
	if (el) el.textContent = `${el.textContent ?? ''}\n${JSON.stringify(msg)}`;
};

document.getElementById('ping')?.addEventListener('click', async () => {
	try {
		const res = await chrome.runtime.sendMessage({ type: 'PING' });
		log(res);
	} catch (e) {
		log({ error: String(e) });
	}
});

const sendToActive = <T = unknown>(type: string, payload?: unknown) =>
	new Promise<BusResponse<T>>((resolve) => {
		const req: BusRequest = { id: createId(), type, payload, target: 'activeTab' };
		chrome.runtime.sendMessage(req, (resp: BusResponse<T>) => resolve(resp));
	});

// Dev test controls
const selInput = () => (document.getElementById('sel') as HTMLInputElement)?.value || 'button';
const textInput = () => (document.getElementById('text') as HTMLInputElement)?.value || '';
const descInput = () => (document.getElementById('desc') as HTMLInputElement)?.value || '';
const taskInput = () => (document.getElementById('task') as HTMLInputElement)?.value || '';

document.getElementById('btn-analyze')?.addEventListener('click', async () => {
    const r = await sendToActive('ANALYZE_PAGE');
    log(r);
});

document.getElementById('btn-highlight')?.addEventListener('click', async () => {
    const r = await sendToActive('HIGHLIGHT', { selector: selInput() });
    log(r);
});

document.getElementById('btn-find')?.addEventListener('click', async () => {
    const r = await sendToActive<{ selector: string }>('FIND', { description: descInput() });
    log(r);
    if (r.success && r.data?.selector) {
        (document.getElementById('sel') as HTMLInputElement).value = r.data.selector;
        const h = await sendToActive('HIGHLIGHT', { selector: r.data.selector });
        log(h);
    }
});

document.getElementById('btn-click')?.addEventListener('click', async () => {
    const r = await sendToActive('CLICK', { selector: selInput() });
    log(r);
});

document.getElementById('btn-type')?.addEventListener('click', async () => {
    const r = await sendToActive('TYPE', { selector: selInput(), text: textInput() });
    log(r);
});

document.getElementById('btn-wait')?.addEventListener('click', async () => {
    const r = await sendToActive('WAIT', { selector: selInput(), timeout: 5000 });
    log(r);
});

// Simple heuristic planner/executor (no LLM yet)
document.getElementById('btn-run-task')?.addEventListener('click', async () => {
    const t = taskInput();
    if (!t) return;
    const cfg = await loadLlmConfig();
    const steps: Array<{ action: string; target?: string; value?: string; url?: string }> = [];
    if (cfg.mode === 'llm') {
        try {
            const snap = await sendToActive('SNAPSHOT', {});
            const prompt = `You are a web task planner and selector generator. You receive a simplified snapshot of the current page (JSON), and a user task. Produce steps (one per line) in the format ACTION:TARGET:VALUE where ACTION in {NAVIGATE,FIND,TYPE,CLICK,WAIT}. TARGET for FIND is a human description; when possible, add a CSS selector after '->' like FIND:search box->input[aria-label="Search"]. Prefer stable attributes (aria-label, role, id). If the task requires a new site, include NAVIGATE first. Keep steps minimal and deterministic.\nSNAPSHOT JSON (truncated): ${JSON.stringify((snap as any)?.data || {}).slice(0, 8000)}\nTask: ${t}`;
            const text = await planWithLLM(prompt);
            for (const line of text.split(/\r?\n/)) {
                const m = line.trim().match(/^(NAVIGATE|FIND|TYPE|CLICK|WAIT)\s*:\s*([^:]*)\s*:?\s*(.*)$/i);
                if (!m) continue;
                const action = m[1].toUpperCase();
                const target = m[2]?.trim();
                const value = m[3]?.trim();
                if (action === 'NAVIGATE') steps.push({ action, url: value });
                else if (action === 'TYPE') steps.push({ action, target: target?.split('->')[1] || 'AUTO', value });
                else if (action === 'FIND') steps.push({ action, value: target?.split('->')[1] || target });
                else steps.push({ action, target: target || 'AUTO' });
            }
        } catch (e) {
            log({ llmError: String(e), fallback: 'Using heuristic planner' });
        }
    }
    // Heuristic fallback if LLM returns empty or fails
    if (steps.length === 0) {
        log({ info: 'LLM returned no steps, using heuristic planner' });
        const lc = t.toLowerCase();
        if (lc.includes('youtube')) {
            steps.push({ action: 'NAVIGATE', url: 'https://www.youtube.com/?app=desktop' });
            const m = lc.match(/search for (.+?)( on youtube)?$/);
            const q = m?.[1]?.trim() || '';
            steps.push({ action: 'FIND', value: 'search box' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: q });
            steps.push({ action: 'FIND', value: 'search button' });
            steps.push({ action: 'CLICK', target: 'AUTO' });
        } else if (lc.includes('amazon')) {
            steps.push({ action: 'NAVIGATE', url: 'https://www.amazon.com/' });
            const m = lc.match(/search for (.+?)( on amazon)?$/);
            const q = m?.[1]?.trim() || '';
            steps.push({ action: 'FIND', value: 'search box' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: q });
            steps.push({ action: 'FIND', value: 'search button' });
            steps.push({ action: 'CLICK', target: 'AUTO' });
        }
    }
    // Executor that uses last-found selector when target == 'AUTO'
    let lastSelector = '';
    const progressEl = document.getElementById('progress');
    const updateProgress = (msg: string) => {
        if (progressEl) progressEl.textContent = msg;
    };
    updateProgress(`Starting task (${steps.length} steps)...`);
    log({ status: 'Starting', steps: steps.length });
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        updateProgress(`Step ${i + 1}/${steps.length}: ${s.action} ${s.value || s.url || s.target || ''}`);

        if (s.action === 'NAVIGATE' && s.url) {
            let url = s.url;
            if (url && !url.startsWith('http')) url = 'https:' + url;
            log({ step: { action: s.action, url } });
            await sendToActive('NAVIGATE', { url });
            // wait for content script to reconnect
            for (let i = 0; i < 20; i++) {
                try {
                    const pong = await sendToActive('PING_CONTENT', {});
                    if ((pong as any)?.success) break;
                } catch {}
                await new Promise(r => setTimeout(r, 250));
            }
            // wait for page to be ready (network-idle + DOM-settle)
            log({ status: 'Waiting for page ready...' });
            try {
                await sendToActive('PAGE_READY', { timeout: 8000 });
            } catch (e) {
                log({ warning: 'PAGE_READY timeout', error: String(e) });
            }
            continue;
        }
        if (s.action === 'FIND' && s.value) {
            let r: BusResponse<{ selector: string }> | undefined;
            for (let i = 0; i < 5; i++) {
                try {
                    r = await sendToActive<{ selector: string }>('FIND', { description: s.value });
                    if (r.success && r.data?.selector) break;
                } catch {}
                await new Promise(res => setTimeout(res, 500));
            }
            log(r);
            if (r && r.success && r.data?.selector) {
                lastSelector = r.data.selector;
                (document.getElementById('sel') as HTMLInputElement).value = lastSelector;
                await sendToActive('HIGHLIGHT', { selector: lastSelector });
                await new Promise(r => setTimeout(r, 500)); // Let animations settle
            }
            continue;
        }
        if (s.action === 'TYPE') {
            const selector = s.target === 'AUTO' ? lastSelector : s.target || selInput();
            if (!selector) {
                log({ error: 'TYPE: no selector available', target: s.target, lastSelector });
                continue;
            }
            log({ action: 'TYPE', selector, value: s.value });
            let r: BusResponse = { success: false, id: '', error: 'Not attempted' };
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    r = await sendToActive('TYPE', { selector, text: s.value || textInput() });
                    if (r.success) break;
                } catch (e) {
                    r = { success: false, id: '', error: String(e) };
                }
                if (attempt < 2) await new Promise(r2 => setTimeout(r2, 1000 * (attempt + 1)));
            }
            log(r);
            continue;
        }
        if (s.action === 'CLICK') {
            const selector = s.target === 'AUTO' ? lastSelector : s.target || selInput();
            let r = await sendToActive('CLICK', { selector });
            if (!r.success) {
                await new Promise(r2 => setTimeout(r2, 500));
                r = await sendToActive('CLICK', { selector });
            }
            log(r);
            continue;
        }
        await new Promise(r => setTimeout(r, 200));
    }
    updateProgress('✅ Task completed!');
    log({ status: 'Done' });
});

// LLM settings load/save
(async () => {
    const cfg = await loadLlmConfig();
    (document.getElementById('llm-mode') as HTMLSelectElement | null)!.value = cfg.mode;
    (document.getElementById('llm-url') as HTMLInputElement | null)!.value = cfg.baseUrl || '';
    (document.getElementById('llm-key') as HTMLInputElement | null)!.value = cfg.apiKey || '';
    (document.getElementById('llm-model') as HTMLInputElement | null)!.value = cfg.model || 'llama-3.3-70b-instruct';
})();

document.getElementById('save-llm')?.addEventListener('click', async () => {
    const mode = (document.getElementById('llm-mode') as HTMLSelectElement).value as 'heuristic' | 'llm';
    const baseUrl = (document.getElementById('llm-url') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('llm-key') as HTMLInputElement).value.trim();
    const model = (document.getElementById('llm-model') as HTMLInputElement).value.trim();
    await saveLlmConfig({ mode, baseUrl, apiKey, model });
    log({ saved: true, mode });
});




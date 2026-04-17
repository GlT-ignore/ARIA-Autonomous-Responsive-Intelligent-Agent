/**
 * Task Executor Module
 * Core automation engine: agent loop, heuristic fallback, step execution
 */

import { createId, type BusRequest, type BusResponse, type TaskStep } from '../shared/types';
import { loadLlmConfig, loadAgentLoopConfig, saveTaskHistory, loadTaskHistory } from '../shared/storage';
import { planWithLLM, createNextActionPrompt, createOptimizedPrompt, optimizeSnapshot, chatWithLLM, planSiteApproach } from '../shared/llmClient';
import { findSimilarTasks } from '../shared/taskMatcher';
import { conversation } from '../shared/conversation';
import { classifyAction, extractPrice } from '../shared/actionClassifier';
import { requestConfirmation, createConfirmationRequest } from '../shared/confirmations';
import type { ExtractionTarget } from '../workflows/dataExtraction';
import { type InternalStep, normalizeSelector, normalizeUrl, parseLineToStep, parseLLMResponse } from './stepParser';
import { log, updateProgress, setRunningUi, stopRequested, setStopRequested } from './uiState';

// ---- Message bus ----
export const sendToActive = <T = unknown>(type: string, payload?: unknown) =>
	new Promise<BusResponse<T>>((resolve) => {
		const req: BusRequest = { id: createId(), type, payload, target: 'activeTab' };
		chrome.runtime.sendMessage(req, (resp: BusResponse<T>) => resolve(resp));
	});

// ---- Pre-navigation URL extraction ----
const SITE_MAP: Record<string, string> = {
	youtube: 'https://www.youtube.com',
	google: 'https://www.google.com',
	amazon: 'https://www.amazon.com',
	linkedin: 'https://www.linkedin.com',
	github: 'https://github.com',
	twitter: 'https://twitter.com',
	x: 'https://x.com',
	reddit: 'https://www.reddit.com',
	facebook: 'https://www.facebook.com',
	instagram: 'https://www.instagram.com',
	wikipedia: 'https://en.wikipedia.org',
	stackoverflow: 'https://stackoverflow.com',
	netflix: 'https://www.netflix.com',
	spotify: 'https://open.spotify.com',
	ebay: 'https://www.ebay.com',
	walmart: 'https://www.walmart.com',
	flipkart: 'https://www.flipkart.com',
	makemytrip: 'https://www.makemytrip.com',
};

function extractTargetUrl(taskText: string): string | null {
	const lower = taskText.toLowerCase();
	// Check for explicit URLs in the task
	const urlMatch = taskText.match(/https?:\/\/\S+/i);
	if (urlMatch) return urlMatch[0];
	// Check for "on <site>" or "from <site>" or "to <site>" patterns
	for (const [name, url] of Object.entries(SITE_MAP)) {
		if (lower.includes(` on ${name}`) || lower.includes(` from ${name}`) ||
			lower.includes(` to ${name}`) || lower.includes(`go to ${name}`) ||
			lower.includes(`open ${name}`) || lower.includes(`visit ${name}`) ||
			lower.includes(`search ${name}`) || lower.includes(`${name}.com`)) {
			return url;
		}
	}
	return null;
}

// ---- Confirmation helper ----
async function checkAndConfirmClick(elementText: string, url: string, selector?: string): Promise<boolean> {
	try {
		const classification = classifyAction(elementText, {}, url);
		if (!classification.requiresConfirmation) return true;

		const price = extractPrice(elementText);
		const confirmRequest = createConfirmationRequest(
			elementText, url, selector, {},
			price ? { price } : undefined
		);

		conversation.addAssistantMessage(`About to ${confirmRequest.description} - requesting confirmation...`);
		const confirmed = await requestConfirmation(confirmRequest);

		if (confirmed) {
			conversation.addAssistantMessage(`Confirmed: Proceeding with ${confirmRequest.description}`);
		} else {
			conversation.addAssistantMessage(`Cancelled: ${confirmRequest.description} was not performed`);
		}
		return confirmed;
	} catch (error) {
		console.error('Confirmation check failed:', error);
		return conversation.requestConfirmation(
			`Do you want to proceed with clicking "${elementText}"?`,
			'medium'
		);
	}
}

// ---- Dev test controls ----
const selInput = () => 'button'; // fallback selector
const textInput = () => ''; // no manual text input

export function initDevControls() {
	document.getElementById('ping')?.addEventListener('click', async () => {
		try {
			const res = await chrome.runtime.sendMessage({ type: 'PING' });
			log(res);
		} catch (e) {
			log({ error: String(e) });
		}
	});

	document.getElementById('btn-analyze')?.addEventListener('click', async () => {
		const r = await sendToActive('ANALYZE_PAGE');
		log(r);
	});

	document.getElementById('btn-highlight')?.addEventListener('click', async () => {
		const r = await sendToActive('HIGHLIGHT', { selector: selInput() });
		log(r);
	});

	document.getElementById('btn-find')?.addEventListener('click', async () => {
		const descInputEl = document.getElementById('desc') as HTMLInputElement;
		const r = await sendToActive<{ selector: string }>('FIND', { description: descInputEl?.value || '' });
		log(r);
		if (r.success && r.data?.selector) {
			const selInputEl = document.getElementById('sel') as HTMLInputElement | null;
			if (selInputEl) selInputEl.value = r.data.selector;
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
}

// ---- Execute a single step ----
async function execOneStep(
	s: InternalStep,
	i: number,
	total: number,
	lastSelector: { value: string },
	foundSelectors: Record<string, string>,
	hasNavigatedOnce: { value: boolean }
) {
	updateProgress(`Step ${i + 1}/${total}: ${s.action} ${s.value || s.url || s.target || ''}`, ((i + 1) / total) * 100);

	if (s.action === 'NAVIGATE' && s.url) {
		const url = normalizeUrl(s.url);
		if (!url) throw new Error(`NAVIGATE invalid url: ${s.url}`);
		log({ step: { action: 'NAVIGATE', url } });
		conversation.addAssistantMessage(`Navigating to ${url}...`);
		await sendToActive('NAVIGATE', { url });
		// Wait for content script to reconnect
		for (let j = 0; j < 20; j++) {
			try {
				const pong = await sendToActive('PING_CONTENT', {});
				if ((pong as any)?.success) break;
			} catch { }
			await new Promise(r => setTimeout(r, 250));
		}
		log({ status: 'Waiting for page ready...' });
		try {
			await sendToActive('PAGE_READY', { timeout: 15000 });
		} catch (e) {
			log({ warning: 'PAGE_READY timeout', error: String(e) });
		}
		// Universal SPA wait
		await new Promise(r => setTimeout(r, 1000));
		return;
	}

	if (s.action === 'FIND' && s.value) {
		if (s.target) {
			lastSelector.value = normalizeSelector(s.target);
			const selEl = document.getElementById('sel') as HTMLInputElement;
			if (selEl) selEl.value = lastSelector.value;
			const r = await sendToActive('HIGHLIGHT', { selector: lastSelector.value, label: 'Found element' });
			if (!(r as any)?.success) {
				throw new Error(`FIND failed: Element not found for ${lastSelector.value}`);
			}
			log({ info: 'Using LLM-provided selector', selector: lastSelector.value });
			if (s.value) foundSelectors[s.value] = lastSelector.value;
			await new Promise(r => setTimeout(r, 200));
			return;
		}
		let r: BusResponse<{ selector: string }> | undefined;
		for (let k = 0; k < 5; k++) {
			r = await sendToActive<{ selector: string }>('FIND', { description: s.value });
			if (r.success && r.data?.selector) break;
			await new Promise(res => setTimeout(res, 400));
		}
		log(r);
		if (r && r.success && r.data?.selector) {
			lastSelector.value = r.data.selector;
			const selEl = document.getElementById('sel') as HTMLInputElement;
			if (selEl) selEl.value = lastSelector.value;
			await sendToActive('HIGHLIGHT', { selector: lastSelector.value, label: s.value });
			if (s.value) foundSelectors[s.value] = r.data.selector;
			await new Promise(r2 => setTimeout(r2, 300));
		} else {
			throw new Error('FIND failed');
		}
		return;
	}

	if (s.action === 'TYPE') {
		const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
		if (!selector) throw new Error('TYPE: no selector available');
		log({ action: 'TYPE', selector, value: s.value });
		conversation.addAssistantMessage(`Typing "${s.value}" into ${selector}...`);
		const r = await sendToActive('TYPE', { selector, text: s.value || textInput() });
		log(r);
		if (!r.success) throw new Error(r.error || 'TYPE failed');
		// After TYPE, check if this is an autocomplete field and wait for dropdown
		try {
			const checkResult = await sendToActive('CHECK_AUTOCOMPLETE', { selector });
			if ((checkResult as any)?.data?.isAutocomplete) {
				log({ info: 'Autocomplete field detected, waiting for dropdown suggestions...' });
				await new Promise(r2 => setTimeout(r2, 1200));
			}
		} catch { /* ignore autocomplete check failures */ }
		return;
	}

	if (s.action === 'CLICK') {
		const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
		if (!selector) throw new Error('CLICK: no selector available');

		// Search buttons never need confirmation — skip the whole check.
		const isSearchButton = /search|nav-search/i.test(selector);
		if (isSearchButton) {
			conversation.addAssistantMessage(`Clicking ${selector}...`);
			const r = await sendToActive('CLICK', { selector });
			log(r);
			if (!r.success) throw new Error(r.error || 'CLICK failed');
			await new Promise(r2 => setTimeout(r2, 400));
			return;
		}

		const currentUrl = ((await sendToActive<{ url: string }>('PING_CONTENT', {})).data as any)?.url || window.location.href;
		const elementText = selector.includes('buy') || selector.includes('purchase')
			? 'Buy/Purchase button'
			: selector.includes('delete') || selector.includes('remove')
				? 'Delete/Remove button'
				: selector.includes('submit')
					? 'Submit button'
					: selector;

		const confirmed = await checkAndConfirmClick(elementText, currentUrl, selector);
		if (!confirmed) {
			log({ action: 'CLICK', selector, cancelled: true });
			throw new Error('CLICK cancelled by user');
		}

		conversation.addAssistantMessage(`Clicking ${selector}...`);
		const r = await sendToActive('CLICK', { selector });
		log(r);
		if (!r.success) throw new Error(r.error || 'CLICK failed');
		await new Promise(r2 => setTimeout(r2, 400));
		return;
	}

	if (s.action === 'PRESS_ENTER') {
		const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
		if (!selector) throw new Error('PRESS_ENTER: no selector available');
		log({ action: 'PRESS_ENTER', selector });
		conversation.addAssistantMessage(`Pressing Enter on ${selector}...`);
		const r = await sendToActive('PRESS_ENTER', { selector });
		log(r);
		if (!r.success) throw new Error(r.error || 'PRESS_ENTER failed');
		await new Promise(r2 => setTimeout(r2, 400));
		return;
	}

	if (s.action === 'SELECT') {
		const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
		if (!selector) throw new Error('SELECT: no selector available');
		const r = await sendToActive('SELECT', { selector, value: s.value });
		log(r);
		if (!r.success) throw new Error(r.error || 'SELECT failed');
		return;
	}

	if (s.action === 'WAIT' && s.value) {
		await new Promise(r => setTimeout(r, parseInt(s.value || '1000')));
		return;
	}
}

// ---- Main task runner ----
export async function runTask(taskText: string) {
	if (!taskText) return;

	conversation.addUserMessage(taskText);
	conversation.addAssistantMessage('Starting task execution...');

	// Signal active tab
	await sendToActive('ARIA_ACTIVE');

	const startTime = Date.now();
	const cfg = await loadLlmConfig();
	const agentCfg = await loadAgentLoopConfig();
	setStopRequested(false);
	setRunningUi(true);

	const currentTab = await chrome.tabs.query({ active: true, currentWindow: true });
	const currentUrl = currentTab[0]?.url || '';
	const domain = new URL(currentUrl.startsWith('http') ? currentUrl : 'https://example.com').hostname;

	let steps: InternalStep[] = [];
	let usedHistory = false;

	// Always check task history first
	try {
		const history = await loadTaskHistory(domain);
		const similarTasks = await findSimilarTasks(taskText, domain, history, 0.8, 3);
		if (similarTasks.length > 0 && similarTasks[0]) {
			const bestMatch = similarTasks[0];
			if (bestMatch.confidence >= 0.8 && bestMatch.successCount > 0) {
				log({ info: `Reusing pattern: "${bestMatch.taskDescription}"`, confidence: bestMatch.confidence, successes: bestMatch.successCount });
				updateProgress(`Using cached pattern (${bestMatch.successCount} successes)...`);
				steps = bestMatch.steps.map(step => ({ action: step.action, target: step.target, value: step.value, url: step.url }));

				// If cached steps have no NAVIGATE and we're not on the right page, prepend one.
				const hasNavigate = steps.some(s => s.action === 'NAVIGATE');
				const isRestrictedUrl = !currentUrl.startsWith('http') || currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://') || currentUrl.includes('newtab');
				const targetUrl = extractTargetUrl(taskText);
				const onRightDomain = targetUrl ? currentUrl.includes(new URL(targetUrl).hostname) : true;

				if ((!hasNavigate && (!onRightDomain || isRestrictedUrl)) && targetUrl) {
					log({ info: `History has no NAVIGATE but current page is not the target. Prepending NAVIGATE to ${targetUrl}` });
					steps = [{ action: 'NAVIGATE', url: targetUrl }, ...steps];
				}

				usedHistory = true;
			}
		}
	} catch (error) {
		log({ warning: 'Failed to check history', error: String(error) });
	}

	// Task classification
	if (cfg.mode === 'llm' && !usedHistory) {
		try {
			updateProgress('Classifying task type...');
			const { classifyTask } = await import('../shared/taskClassifier.js');
			const classified = await classifyTask(taskText);
			log({ 'TASK CLASSIFIED': { type: classified.type, intent: classified.extractedIntent } });

			// Route to specific workflows
			if (classified.type === 'form_filling') {
				await handleFormFilling(taskText, startTime);
				await sendToActive('ARIA_INACTIVE');
				return;
			}
			if (classified.type === 'summarization') {
				await handleSummarization(startTime);
				await sendToActive('ARIA_INACTIVE');
				return;
			}
			if (classified.type === 'data_extraction') {
				await handleDataExtraction(taskText, currentUrl, startTime);
				await sendToActive('ARIA_INACTIVE');
				return;
			}
			if (classified.type === 'chat') {
				log({ status: 'Handling as chat interaction' });
				updateProgress('Thinking...');
				const response = await chatWithLLM(taskText);
				conversation.addAssistantMessage(response);
				updateProgress('Ready');
				setRunningUi(false);
				await sendToActive('ARIA_INACTIVE');
				return;
			}
			if (classified.type === 'information_query') {
				log({ status: 'Information query detected - using agent loop with LLM planning' });
				conversation.addAssistantMessage(`Researching: ${classified.extractedIntent}`);
				await runAgentLoop(taskText, cfg, agentCfg, currentUrl, startTime);
				await sendToActive('ARIA_INACTIVE');
				return;
			}
			log({ status: 'Using general automation workflow for navigation/interaction tasks' });
		} catch (error) {
			log({ warning: 'Task classification failed, using general automation', error: String(error) });
		}
	}

	// Agent loop mode
	if (cfg.mode === 'llm' && agentCfg.enabled && !usedHistory) {
		await runAgentLoop(taskText, cfg, agentCfg, currentUrl, startTime);
		await sendToActive('ARIA_INACTIVE');
		return;
	}

	// Heuristic / single-shot LLM planning
	if (steps.length === 0) {
		// Pre-navigate: if the task mentions a known site, go there first so the LLM
		// gets the correct page snapshot instead of the new-tab or unrelated page.
		const preNavUrl = extractTargetUrl(taskText);
		let shouldNavigate = false;
		if (preNavUrl) {
			if (!currentUrl.includes(new URL(preNavUrl).hostname)) {
				shouldNavigate = true;
			} else {
				// We're on the right domain, but check if the content script is alive (e.g. extension updated/reloaded)
				try {
					const ping = await sendToActive('PING_CONTENT', {});
					if (!(ping as any)?.success) shouldNavigate = true;
				} catch {
					shouldNavigate = true;
				}
			}
		}

		if (shouldNavigate && preNavUrl) {
			conversation.addAssistantMessage(`Navigating to ${preNavUrl}...`);
			log({ preNavigate: preNavUrl });
			await sendToActive('NAVIGATE', { url: preNavUrl });
			// Wait for content script to be ready
			for (let j = 0; j < 20; j++) {
				try { const pong = await sendToActive('PING_CONTENT', {}); if ((pong as any)?.success) break; } catch { }
				await new Promise(r => setTimeout(r, 250));
			}
			try { await sendToActive('PAGE_READY', { timeout: 15000 }); } catch { }
		}

		if (cfg.mode === 'llm') {
			try {
				const snap = await sendToActive('SNAPSHOT', {});
				const snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { url: currentUrl, title: '', elements: [] };
				const optimized = optimizeSnapshot(snapshotData);
				const prompt = createOptimizedPrompt(optimized, taskText);
				log({ info: `Using LLM: ${cfg.model || 'default'}`, snapshotSize: JSON.stringify(optimized).length });
				const text = await planWithLLM(prompt);
				steps = parseLLMResponse(text);
				// Filter out NAVIGATE steps for the site we already navigated to
				if (preNavUrl) {
					const preHost = new URL(preNavUrl).hostname;
					steps = steps.filter(s => {
						if (s.action === 'NAVIGATE' && s.url) {
							try { return !new URL(normalizeUrl(s.url) || '').hostname.includes(preHost); } catch { return true; }
						}
						return true;
					});
				}
				log({ info: `LLM generated ${steps.length} steps` });
			} catch (e) {
				log({ llmError: String(e), fallback: 'Using heuristic planner' });
			}
		}
		if (steps.length === 0) {
			steps = await buildHeuristicSteps(taskText);
		}
	}

	// Execute steps
	const lastSelector = { value: '' };
	const foundSelectors: Record<string, string> = {};
	let hasError = false;
	updateProgress(`Starting task (${steps.length} steps)...`);
	log({ status: 'Starting', steps: steps.length, usedHistory });

	for (let i = 0; i < steps.length; i++) {
		const s = steps[i];
		if (!s) continue;
		updateProgress(`Step ${i + 1}/${steps.length}: ${s.action} ${s.value || s.url || s.target || ''}`, ((i + 1) / steps.length) * 100);
		await sendToActive('ARIA_STEP_UPDATE', { step: i + 1, total: steps.length });

		if (s.action === 'NAVIGATE' && s.url) {
			const url = normalizeUrl(s.url);
			if (!url) { log({ error: 'NAVIGATE: invalid URL', raw: s.url }); continue; }
			log({ step: { action: s.action, url } });
			conversation.addAssistantMessage(`Navigating to ${url}...`);
			await sendToActive('NAVIGATE', { url });
			for (let j = 0; j < 20; j++) {
				try { const pong = await sendToActive('PING_CONTENT', {}); if ((pong as any)?.success) break; } catch { }
				await new Promise(r => setTimeout(r, 250));
			}
			log({ status: 'Waiting for page ready...' });
			try { await sendToActive('PAGE_READY', { timeout: 15000 }); } catch (e) { log({ warning: 'PAGE_READY timeout', error: String(e) }); }
			const curUrl = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url || '';
			if (curUrl.includes('airindia') || curUrl.includes('makemytrip') || curUrl.includes('booking')) {
				await new Promise(r => setTimeout(r, 1000));
			}
			continue;
		}
		if (s.action === 'FIND' && s.value) {
			if (s.target) {
				lastSelector.value = normalizeSelector(s.target);
				const selEl = document.getElementById('sel') as HTMLInputElement;
				if (selEl) selEl.value = lastSelector.value;
				const r = await sendToActive('HIGHLIGHT', { selector: lastSelector.value, label: 'Found' });
				if (!(r as any)?.success) {
					log({ warning: `FIND failed: Element not found for ${lastSelector.value}` });
					hasError = true;
					continue;
				}
				if (s.value) foundSelectors[s.value] = lastSelector.value;
				await new Promise(r => setTimeout(r, 300));
				continue;
			}
			let r: BusResponse<{ selector: string }> | undefined;
			for (let k = 0; k < 5; k++) {
				try { r = await sendToActive<{ selector: string }>('FIND', { description: s.value }); if (r.success && r.data?.selector) break; } catch { }
				await new Promise(res => setTimeout(res, 500));
			}
			log(r);
			if (r && r.success && r.data?.selector) {
				lastSelector.value = r.data.selector;
				const selEl = document.getElementById('sel') as HTMLInputElement;
				if (selEl) selEl.value = lastSelector.value;
				await sendToActive('HIGHLIGHT', { selector: lastSelector.value, label: s.value });
				if (s.value) foundSelectors[s.value] = r.data.selector;
				await new Promise(r => setTimeout(r, 500));
			}
			continue;
		}
		if (s.action === 'TYPE') {
			const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
			if (!selector) { log({ error: 'TYPE: no selector', target: s.target, lastSelector: lastSelector.value }); hasError = true; continue; }
			conversation.addAssistantMessage(`Typing "${s.value}"...`);
			let r: BusResponse = { success: false, id: '', error: 'Not attempted' };
			for (let attempt = 0; attempt < 3; attempt++) {
				try { r = await sendToActive('TYPE', { selector, text: s.value || textInput() }); if (r.success) break; } catch (e) { r = { success: false, id: '', error: String(e) }; }
				if (attempt < 2) await new Promise(r2 => setTimeout(r2, 1000 * (attempt + 1)));
			}
			if (!r.success) hasError = true;
			log(r);
			continue;
		}
		if (s.action === 'CLICK') {
			const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
			conversation.addAssistantMessage(`Clicking ${selector}...`);
			let r = await sendToActive('CLICK', { selector });
			if (!r.success) { await new Promise(r2 => setTimeout(r2, 500)); r = await sendToActive('CLICK', { selector }); }
			if (!r.success) hasError = true;
			log(r);
			continue;
		}
		if (s.action === 'PRESS_ENTER') {
			const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
			conversation.addAssistantMessage(`Pressing Enter on ${selector}...`);
			let r = await sendToActive('PRESS_ENTER', { selector });
			if (!r.success) { await new Promise(r2 => setTimeout(r2, 500)); r = await sendToActive('PRESS_ENTER', { selector }); }
			if (!r.success) hasError = true;
			log(r);
			continue;
		}
		if (s.action === 'SELECT') {
			const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector.value : s.target || selInput());
			conversation.addAssistantMessage(`Selecting "${s.value}"...`);
			const r = await sendToActive('SELECT', { selector, value: s.value });
			if (!(r as any)?.success) hasError = true;
			log(r);
			continue;
		}
		if (s.action === 'UPLOAD') {
			const r = await sendToActive('UPLOAD', { selector: s.target, fileName: s.value });
			log(r);
			continue;
		}
		if (s.action === 'WAIT' && s.value) {
			conversation.addAssistantMessage('Waiting...');
			await new Promise(r => setTimeout(r, parseInt(s.value || '1000')));
			continue;
		}
		await new Promise(r => setTimeout(r, 200));
	}

	const executionTime = Date.now() - startTime;
	updateProgress('Task completed!');
	conversation.addAssistantMessage('Task completed!');
	log({ status: 'Done', executionTime: `${executionTime}ms` });
	setRunningUi(false);
	await sendToActive('ARIA_INACTIVE');

	// Save to task history
	if (!usedHistory && !hasError) {
		try {
			const taskSteps: TaskStep[] = steps.map(step => {
				const s: TaskStep = { action: step.action as any };
				if (step.target !== undefined) s.target = step.target;
				if (step.value !== undefined) s.value = step.value;
				if (step.url !== undefined) s.url = step.url;
				return s;
			});
			await saveTaskHistory(taskText, domain, taskSteps, executionTime, foundSelectors, true);
			log({ info: 'Saved to task history' });
		} catch (error) {
			log({ warning: 'Failed to save history', error: String(error) });
		}
	}
}

// ---- Agent loop ----
async function runAgentLoop(
	taskText: string,
	cfg: Awaited<ReturnType<typeof loadLlmConfig>>,
	agentCfg: Awaited<ReturnType<typeof loadAgentLoopConfig>>,
	currentUrl: string,
	startTime: number
) {
	const maxIterations = Math.max(1, Math.min(200, agentCfg.maxIterations || 20));
	const recent: Array<InternalStep & { ok?: boolean; error?: string }> = [];

	updateProgress('Phase 1/2: Planning approach...');
	let siteGuidance: { startUrl: string; approach: string };
	try {
		siteGuidance = await planSiteApproach(taskText);
	} catch (e) {
		const errMsg = String(e);
		log({ error: 'Planning failed', details: errMsg });
		conversation.addAssistantMessage(`Failed to connect to AI: ${errMsg.replace(/^Error:\s*/, '')}. Please check your API settings.`);
		updateProgress('Failed: AI connection error');
		setRunningUi(false);
		return;
	}

	if (siteGuidance.startUrl) {
		updateProgress(`Plan ready: ${siteGuidance.startUrl}`);
		log({ 'PLANNING COMPLETE': { startUrl: siteGuidance.startUrl, approach: siteGuidance.approach } });
	} else {
		updateProgress('Planning: No start URL, proceeding...');
	}

	let plannedStartUrl = siteGuidance.startUrl || '';
	const lastSelector = { value: '' };
	const foundSelectors: Record<string, string> = {};
	let hasNavigatedOnce = { value: false };

	try {
		updateProgress('Phase 2/2: Executing...');
		log({ status: 'PHASE 2: Starting agent loop', maxIterations });
		let consecutiveFailures = 0;
		let consecutiveLlmFailures = 0;
		let consecutiveWaits = 0;

		for (let i = 0; i < maxIterations; i++) {
			if (stopRequested) {
				log({ status: 'Stopped by user' });
				updateProgress('Stopped.');
				break;
			}

			await sendToActive('ARIA_STEP_UPDATE', { step: i + 1, total: maxIterations });

			let snap = await sendToActive('SNAPSHOT', { force: true });
			if (!(snap as any)?.success) {
				log({ warning: 'SNAPSHOT call failed', error: (snap as any)?.error });
			}
			let snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { url: currentUrl, title: '', elements: [] };

			// If snapshot is empty, poll until the content script reconnects AND the page
			// has elements. A simple PING_CONTENT success is not enough — intermediate
			// redirect pages (e.g. Google's RotateCookiesPage) respond to pings but have
			// 0 elements. Keep polling every second for up to 20 s.
			const elemCount = (snapshotData.elements || []).length;
			if (elemCount === 0 && (i > 0 || !(plannedStartUrl && plannedStartUrl.startsWith('http')))) {
				log({ info: 'Snapshot empty - polling until page has elements...' });
				for (let reconnectRetry = 0; reconnectRetry < 20; reconnectRetry++) {
					await new Promise(r => setTimeout(r, 1000));
					try {
						const pong = await sendToActive('PING_CONTENT', {});
						if ((pong as any)?.success) {
							snap = await sendToActive('SNAPSHOT', { force: true });
							snapshotData = (snap as any)?.success && (snap as any)?.data
								? (snap as any).data
								: { url: currentUrl, title: '', elements: [] };
							if ((snapshotData.elements || []).length > 0) break;
						}
					} catch { }
				}
			}

			const optimized = optimizeSnapshot(snapshotData);

			let step: InternalStep | null = null;
			let lastLlmLine = '';

			if (i === 0 && plannedStartUrl && plannedStartUrl.startsWith('http')) {
				step = { action: 'NAVIGATE', url: plannedStartUrl };
			} else {
				// Video playback intervention logic
				const lowerTask = taskText.toLowerCase();
				const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch') || lowerTask.includes('song'));
				const currentUrl = snapshotData.url || '';
				const hasSearched = recent.some(s => s.action === 'TYPE' && s.ok === true);
				const hasClickedVideo = recent.slice(recent.findIndex(s => s.action === 'TYPE')).some(s => s.action === 'CLICK' && s.ok === true);
				const recentWaits = recent.slice(-5).filter(s => s.action === 'WAIT').length;

				if (isVideoPlayback && hasSearched && currentUrl === 'https://www.youtube.com/' && recentWaits >= 3) {
					const searchButtonSelectors = ['button#search-icon-legacy', 'button[aria-label*="Search"]', '#search-icon-legacy', 'ytd-searchbox button'];
					for (const selector of searchButtonSelectors) {
						try {
							const clickResult = await sendToActive('CLICK', { selector });
							if ((clickResult as any).success) {
								recent.push({ action: 'CLICK', target: selector, ok: true });
								await new Promise(r => setTimeout(r, 2000));
								break;
							}
						} catch { }
					}
					continue;
				}

				if (isVideoPlayback && hasSearched && (currentUrl.includes('/results') || currentUrl.includes('search_query=')) && !hasClickedVideo) {
					const clicksAfterSearch = recent.slice(recent.findIndex(s => s.action === 'TYPE')).filter(s => s.action === 'CLICK').length;
					if (clicksAfterSearch >= 2 && clicksAfterSearch < 4) {
						const videoSelectors = ['ytd-video-renderer a#video-title', 'ytd-video-renderer h3 a', 'a#video-title', 'ytd-thumbnail a'];
						for (const selector of videoSelectors) {
							try {
								const clickResult = await sendToActive('CLICK', { selector });
								if ((clickResult as any).success) {
									recent.push({ action: 'CLICK', target: selector, ok: true });
									await new Promise(r => setTimeout(r, 2000));
									break;
								}
							} catch { }
						}
						continue;
					}
				}

				// Ask LLM for next action
				const prompt = createNextActionPrompt({
					snapshot: optimized,
					task: taskText,
					recentSteps: recent.slice(-10).map(r => ({
						action: r.action,
						...(r.target !== undefined ? { target: r.target } : {}),
						...(r.value !== undefined ? { value: r.value } : {}),
						...(r.url !== undefined ? { url: r.url } : {}),
						...(r.ok !== undefined ? { ok: r.ok } : {}),
						...(r.error !== undefined ? { error: r.error } : {}),
					})),
					siteApproach: siteGuidance.approach,
				});

				let text = '';
				try {
					text = await planWithLLM(prompt);
					consecutiveLlmFailures = 0;
					const firstLinePreview = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] || '(empty)';
					log({ llmResponse: firstLinePreview });
				} catch (e) {
					consecutiveLlmFailures++;
					const errMsg = String(e).replace(/^Error:\s*/, '');
					log({ error: 'LLM call failed', details: errMsg });
					if (consecutiveLlmFailures >= 3) {
						conversation.addAssistantMessage(`AI connection failed ${consecutiveLlmFailures} times: ${errMsg}. Please check your API settings.`);
						updateProgress('Failed: AI connection error');
						break;
					}
				}
				const firstLine = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] || '';
				lastLlmLine = firstLine;
				step = parseLineToStep(firstLine);
			}

			if (!step) {
				log({ warning: 'Unparseable LLM response', iteration: i, rawLine: lastLlmLine?.slice(0, 100) || '(empty)' });
				recent.push({ action: 'ERROR', value: 'No parseable action', ok: false, error: 'No parseable action' });
				consecutiveFailures++;
				continue;
			}

			if (step.action === 'DONE') {
				// Validate completion
				const lowerTask = taskText.toLowerCase();
				const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch') || lowerTask.includes('song'));
				const isSearchOrQuery = lowerTask.includes('search') || /\b(what\s+is|what's|how\s+much|price|cost|weather|who\s+is|cheapest|best|find|check|open.*and)\b/.test(lowerTask);
				const hasTypedSearch = recent.some(s => s.action === 'TYPE' && s.ok === true);
				const hasClickedAfterSearch = recent.slice(recent.findIndex(s => s.action === 'TYPE')).some(s => s.action === 'CLICK' && s.ok === true);
				const doneRejections = recent.filter(s => s.action === 'WAIT' && s.error?.includes('premature')).length;

				// Reject premature DONE for search/info tasks that haven't typed anything yet
				if (isSearchOrQuery && !hasTypedSearch) {
					if (doneRejections >= 5) {
						log({ warning: 'Search task could not proceed after 5 retries' });
						break;
					}
					log({ info: 'Rejecting premature DONE - search/query task has not typed search query yet' });
					recent.push({ action: 'WAIT', value: '2000', ok: true, error: 'premature-done-rejection' });
					await new Promise(r => setTimeout(r, 2000));
					continue;
				}

				if (isVideoPlayback && hasTypedSearch && !hasClickedAfterSearch) {
					if (doneRejections >= 3) {
						updateProgress('Could not find video to play');
						break;
					}
					recent.push({ action: 'WAIT', value: '1500', ok: true, error: 'premature-done-rejection' });
					await new Promise(r => setTimeout(r, 1500));
					continue;
				}

				if (isVideoPlayback) {
					const currentSnapshot = await sendToActive('SNAPSHOT', {});
					const curUrl = (currentSnapshot as any)?.data?.url || '';
					if (!curUrl.includes('/watch')) {
						if (doneRejections >= 5) break;
						recent.push({ action: 'WAIT', value: '1000', ok: true, error: 'premature-done-rejection' });
						await new Promise(r => setTimeout(r, 1000));
						continue;
					}
				}

				updateProgress('Done (LLM said DONE)');
				conversation.addAssistantMessage('Task completed!');
				log({ status: 'Done', reason: 'LLM_DONE' });
				break;
			}

			// Block repeated navigations (only cross-domain)
			// Block repeated navigations to the same page
			if (step.action === 'NAVIGATE') {
				const currentTabUrl = ((await sendToActive<{ url: string }>('PING_CONTENT', {})).data as any)?.url || '';
				const targetUrl = normalizeUrl(step.url!) || '';

				// Check if we are already on this URL (ignoring minor differences)
				const isSameUrl = currentTabUrl && targetUrl && (() => {
					try {
						const cur = new URL(currentTabUrl);
						const tgt = new URL(targetUrl);
						return cur.hostname.replace('www.', '') === tgt.hostname.replace('www.', '') &&
							cur.pathname.replace(/\/$/, '') === tgt.pathname.replace(/\/$/, '');
					} catch { return false; }
				})();

				if (isSameUrl) {
					log({ info: 'Skipping redundant navigation', url: targetUrl });
					// Just wait a bit instead of reloading
					step = { action: 'WAIT', value: '1000' };
					recent.push({ ...step, ok: true, error: 'Redundant navigation skipped' });
					await new Promise(r => setTimeout(r, 1000));
					continue;
				}

				// Check domain crossing if we have navigated once (to prevent loops)
				const isSameDomain = currentTabUrl && targetUrl && (() => {
					try {
						return new URL(currentTabUrl).hostname.replace('www.', '') === new URL(targetUrl).hostname.replace('www.', '');
					} catch { return false; }
				})();

				if (hasNavigatedOnce.value && !isSameDomain) {
					log({ warning: 'Blocked cross-domain navigation in loop', current: currentTabUrl, target: targetUrl });
					step = { action: 'WAIT', value: '1000' };
					recent.push({ ...step, ok: true, error: 'Cross-domain navigation blocked' });
					await new Promise(r => setTimeout(r, 1000));
					continue;
				} else {
					hasNavigatedOnce.value = true;
				}
			}

			// Execute with retry
			let succeeded = false;
			for (let retry = 0; retry < 3 && !succeeded; retry++) {
				try {
					if (retry > 0) await new Promise(r => setTimeout(r, Math.pow(2, retry - 1) * 500));
					await execOneStep(step, i, maxIterations, lastSelector, foundSelectors, hasNavigatedOnce);
					succeeded = true;
					recent.push({ ...step, ok: true });
					consecutiveFailures = 0;
					consecutiveWaits = step.action === 'WAIT' ? consecutiveWaits + 1 : 0;
				} catch (e) {
					if (retry === 2) {
						recent.push({ ...step, ok: false, error: String(e) });
						consecutiveFailures++;
					}
				}
			}

			if (consecutiveFailures >= 5 || consecutiveWaits >= 8) {
				updateProgress('FAILED: Agent stuck');
				break;
			}
		}
	} finally {
		const executionTime = Date.now() - startTime;

		// Save to task history
		if (!stopRequested && recent.length > 0) {
			try {
				const isSuccess = recent.some(s => s.action === 'DONE');
				// Save if successful or if we executed meaningful steps
				if (isSuccess || recent.filter(s => s.ok).length >= 2) {
					const taskSteps: TaskStep[] = recent
						.filter(step => step.ok && step.action !== 'ERROR' && step.action !== 'WAIT' && step.action !== 'DONE')
						.map(step => {
							const s: TaskStep = { action: step.action as any };
							if (step.target !== undefined) s.target = step.target;
							if (step.value !== undefined) s.value = step.value;
							if (step.url !== undefined) s.url = step.url;
							return s;
						});

					let domain = 'example.com';
					try { domain = new URL(currentUrl).hostname; } catch { }

					await saveTaskHistory(taskText, domain, taskSteps, executionTime, foundSelectors, isSuccess);
					log({ info: 'Saved agent session to history', success: isSuccess });
				}
			} catch (e) {
				log({ warning: 'Failed to save agent history', error: String(e) });
			}
		}

		setRunningUi(false);
		log({ status: 'Agent loop finished', executionTime: `${executionTime}ms` });

		// For info queries, try to extract and display visible answer from the page
		const lowerTask = taskText.toLowerCase();
		const isInfoQuery = /\b(what\s+is|what's|how\s+much|price|cost|weather|time\s+in|cheapest|best)\b/.test(lowerTask);
		if (isInfoQuery) {
			try {
				const snap = await sendToActive('SNAPSHOT', {});
				const pageText = ((snap as any)?.data?.elements || [])
					.map((e: any) => e.text)
					.filter((t: string) => t && t.length > 5)
					.join(' | ')
					.slice(0, 500);
				if (pageText) {
					conversation.addAssistantMessage(`Here's what I found: ${pageText}`);
				}
			} catch { /* ignore extraction failures */ }
		}
	}
}

// ---- Heuristic step builder ----
async function buildHeuristicSteps(taskText: string): Promise<InternalStep[]> {
	const steps: InternalStep[] = [];
	const lc = taskText.toLowerCase();
	log({ info: 'LLM returned no steps, using heuristic planner' });

	// --- Gmail / Email: send composed email ---
	// Triggered when the user says "send the mail", "send the email", "press send",
	// "click send button", "send my email", etc.
	const isSendIntent =
		/(send|click|press|hit)\s+(the\s+)?(send|mail|email|message)\s*(button)?/i.test(taskText) ||
		/(send\s+(the\s+)?(mail|email|message|it))/i.test(taskText) ||
		/just\s+(press|click|hit)\s+send/i.test(taskText);

	if (isSendIntent) {
		log({ info: 'Send-email intent detected – using semantic FIND for Send button' });
		// content.ts getModernPatterns() now has 'mail.google.com' → 'send button' selectors.
		// FIND will use findBySemantic which resolves these correctly for Gmail.
		// Generic email clients will fall through to the 'submit button' fallback in findBySemantic.
		steps.push({ action: 'FIND', value: 'send button' });
		steps.push({ action: 'CLICK', target: 'AUTO' });
		return steps;
	}

	if (lc.includes('youtube')) {
		steps.push({ action: 'NAVIGATE', url: 'https://www.youtube.com/?app=desktop' });

		// Extract search query from multiple phrase patterns
		let q = '';
		const patterns = [
			lc.match(/search (?:for |)(.+?)(?:\s+on youtube|$)/),          // "search for cats on youtube"
			lc.match(/search youtube for (.+?)(?:\s+and|$)/),               // "search youtube for cats"
			lc.match(/(?:open|watch|find|play|show)\s+(.+?)\s+(?:on youtube|videos?)/), // "open cat videos on youtube"
			lc.match(/youtube.*?(?:search|find|open|watch)\s+(.+?)(?:\s+and|$)/), // "youtube: search cats"
		];
		for (const m of patterns) {
			if (m?.[1]?.trim()) { q = m[1].trim(); break; }
		}

		const wantsVideo = lc.includes('click') || lc.includes('play') || lc.includes('open') || lc.includes('watch') || lc.includes('first');

		steps.push({ action: 'FIND', value: 'search box' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: q });
		steps.push({ action: 'PRESS_ENTER', target: 'AUTO' });
		steps.push({ action: 'WAIT', value: '2000' });

		// Click first video result if the task implies playing/opening a video
		if (wantsVideo) {
			steps.push({ action: 'FIND', value: 'first video result' });
			steps.push({ action: 'CLICK', target: 'AUTO' });
		} else {
			// Otherwise just click the search button
			steps.push({ action: 'FIND', value: 'search button' });
			steps.push({ action: 'CLICK', target: 'AUTO' });
		}
	} else if (lc.includes('amazon')) {
		steps.push({ action: 'NAVIGATE', url: 'https://www.amazon.com/' });
		let q = '';
		const m1 = lc.match(/search (?:for |)(.+?)\s+on amazon/);
		const m2 = lc.match(/search amazon for (.+?)$/);
		if (m1) q = m1[1]?.trim() || '';
		else if (m2) q = m2[1]?.trim() || '';
		steps.push({ action: 'FIND', value: 'search box' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: q });
		steps.push({ action: 'FIND', value: 'search button' });
		steps.push({ action: 'CLICK', target: 'AUTO' });
	} else if (lc.includes('linkedin') && (lc.includes('apply') || lc.includes('job'))) {
		log({ info: 'LinkedIn Easy Apply workflow detected' });
		const { loadUserProfile } = await import('../shared/userProfile');
		const profile = await loadUserProfile();
		steps.push({ action: 'FIND', value: 'Easy Apply' });
		steps.push({ action: 'CLICK', target: 'AUTO' });
		steps.push({ action: 'WAIT', value: '1000' });
		steps.push({ action: 'FIND', value: 'first name' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.firstName });
		steps.push({ action: 'FIND', value: 'last name' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.lastName });
		steps.push({ action: 'FIND', value: 'email' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.email });
		steps.push({ action: 'FIND', value: 'phone' });
		steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.phone });
		if (profile.professional.resumeFileName) {
			steps.push({ action: 'UPLOAD', target: 'resume', value: profile.professional.resumeFileName });
		}
		steps.push({ action: 'FIND', value: 'Next' });
		steps.push({ action: 'CLICK', target: 'AUTO' });
	}
	return steps;
}

// ---- Workflow handlers ----
async function handleFormFilling(taskText: string, startTime: number) {
	try {
		updateProgress('Form Filling Mode: Detecting form fields...');
		const {
			detectFormFields, generateFormInputHTML, collectFormData,
			fillFormWithData, extractFormDataFromPrompt,
			isProfileFillIntent, matchProfileToForm, generateFillSummary
		} = await import('../workflows/formFilling.js');
		const snap = await sendToActive('SNAPSHOT', {});
		const snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { elements: [] };
		const form = detectFormFields(snapshotData);

		if (form.fields.length === 0) {
			updateProgress('No form fields found on this page');
			conversation.addAssistantMessage('No form fields detected on this page.');
			setRunningUi(false);
			return;
		}

		conversation.addAssistantMessage(`Detected ${form.fields.length} form fields.`);

		// Check if user wants to fill from their saved profile
		const useProfile = isProfileFillIntent(taskText);
		let extractedData: Record<string, string | boolean> = {};

		if (useProfile) {
			updateProgress('Loading your saved profile...');
			const { loadUserProfile } = await import('../shared/userProfile.js');
			const profile = await loadUserProfile();

			// Check if profile has meaningful data
			const hasProfileData = profile.personal.firstName || profile.personal.email || profile.personal.phone;

			if (hasProfileData) {
				updateProgress('Matching profile to form fields...');
				conversation.addAssistantMessage('Using your saved profile to fill the form...');
				extractedData = matchProfileToForm(profile, form);

				let matchedFields = 0;
				for (const field of form.fields) {
					if (extractedData[field.selector] !== undefined && extractedData[field.selector] !== '') matchedFields++;
				}

				if (matchedFields > 0) {
					// Show fill summary in chat
					const summary = generateFillSummary(form, extractedData);
					conversation.addAssistantMessage(summary);

					// Auto-fill directly without showing the dialog
					updateProgress(`Filling ${matchedFields} fields from profile...`);
					await fillFormWithData(form, extractedData, log);
					updateProgress('Form filled from profile!');
					conversation.addAssistantMessage(
						`Filled ${matchedFields}/${form.fields.length} fields from your profile.`
					);

					log({ status: 'Profile-based form filling complete', matchedFields, totalFields: form.fields.length, executionTime: `${Date.now() - startTime}ms` });
					setRunningUi(false);
					return;
				} else {
					conversation.addAssistantMessage('Could not match profile fields to this form. Trying prompt extraction...');
				}
			} else {
				conversation.addAssistantMessage('No profile data saved. Go to Settings > Your Profile to save your details. Trying prompt extraction...');
			}
		}

		// Fallback: extract from prompt text (or if profile matching failed)
		updateProgress(`Found ${form.fields.length} form fields. Extracting data from prompt...`);
		extractedData = await extractFormDataFromPrompt(taskText, form);

		let matchedFields = 0;
		for (const field of form.fields) {
			if (extractedData[field.selector]) matchedFields++;
		}

		if (matchedFields > 0) {
			updateProgress(`Auto-filled ${matchedFields}/${form.fields.length} fields. Please review...`);
		} else {
			updateProgress('Could not auto-extract data. Please fill manually...');
		}

		const dialogContainer = document.getElementById('form-dialog-container');
		const dialogContent = document.getElementById('form-dialog-content');
		if (dialogContainer && dialogContent) {
			dialogContent.innerHTML = generateFormInputHTML(form, extractedData);
			dialogContainer.style.display = 'block';

			await new Promise<void>((resolve) => {
				document.getElementById('form-submit-data')?.addEventListener('click', async () => {
					const data = collectFormData(form);
					if (data) {
						dialogContainer.style.display = 'none';
						updateProgress('Filling form...');
						await fillFormWithData(form, data, log);
						updateProgress('Form filled successfully!');
						resolve();
					}
				});
				document.getElementById('form-cancel-data')?.addEventListener('click', () => {
					dialogContainer.style.display = 'none';
					updateProgress('Form filling cancelled');
					resolve();
				});
			});
		}

		log({ status: 'Form filling complete', executionTime: `${Date.now() - startTime}ms` });
		setRunningUi(false);
	} catch (error) {
		log({ error: 'Form filling failed', details: String(error) });
		updateProgress('Form filling failed');
		setRunningUi(false);
	}
}

async function handleSummarization(startTime: number) {
	try {
		updateProgress('Summarization Mode: Extracting content...');
		const { executeSummarizationWorkflow, generateSummaryHTML } = await import('../workflows/summarization.js');
		const summary = await executeSummarizationWorkflow(log);

		const summaryHtml = generateSummaryHTML(summary);
		conversation.addAssistantMessage(summaryHtml, { isHtml: true });

		updateProgress('Summary generated!');
		log({ status: 'Summarization complete', executionTime: `${Date.now() - startTime}ms` });
		setRunningUi(false);
	} catch (error) {
		log({ error: 'Summarization failed', details: String(error) });
		updateProgress('Summarization failed');
		setRunningUi(false);
	}
}

async function handleDataExtraction(taskText: string, currentUrl: string, startTime: number) {
	try {
		updateProgress('Data Extraction Mode: Identifying targets...');
		const { executeDataExtractionWorkflow, generateExtractionHTML, dataToCSV } = await import('../workflows/dataExtraction.js');

		const snap = await sendToActive('SNAPSHOT', {});
		const snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { elements: [] };
		const data = await executeDataExtractionWorkflow(taskText, snapshotData, log);

		// If CSS-selector extraction found nothing (common on sites with obfuscated class names),
		// fall back to summarization which uses full page text and is more reliable.
		if (data.count === 0) {
			log({ info: 'Data extraction found 0 items, falling back to summarization...' });
			await handleSummarization(startTime);
			return;
		}

		const resultsContainer = document.getElementById('results-container');
		if (resultsContainer) {
			const targets: ExtractionTarget[] = [];
			resultsContainer.innerHTML = generateExtractionHTML(data, targets);

			document.getElementById('copy-extraction-json')?.addEventListener('click', () => {
				navigator.clipboard.writeText(JSON.stringify(data.items, null, 2));
				alert('Data copied as JSON!');
			});
			document.getElementById('copy-extraction-csv')?.addEventListener('click', () => {
				navigator.clipboard.writeText(dataToCSV(data));
				alert('Data copied as CSV!');
			});
		}

		updateProgress(`Extracted ${data.count} items!`);
		log({ status: 'Data extraction complete', executionTime: `${Date.now() - startTime}ms` });
		setRunningUi(false);
	} catch (error) {
		log({ error: 'Data extraction failed', details: String(error) });
		updateProgress('Data extraction failed');
		setRunningUi(false);
	}
}

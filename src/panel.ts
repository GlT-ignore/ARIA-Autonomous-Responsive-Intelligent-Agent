import { createId, type BusRequest, type BusResponse, type TaskStep } from './shared/types';
import { loadAgentLoopConfig, loadLlmConfig, saveAgentLoopConfig, saveLlmConfig, saveTaskHistory, loadTaskHistory } from './shared/storage';
import { planWithLLM, createNextActionPrompt, createOptimizedPrompt, optimizeSnapshot } from './shared/llmClient';
import { findSimilarTasks } from './shared/taskMatcher';

const log = (msg: unknown) => {
	const el = document.getElementById('log');
	if (el) el.textContent = `${el.textContent ?? ''}\n${JSON.stringify(msg)}`;
};

const progressEl = document.getElementById('progress');
const updateProgress = (msg: string) => {
	if (progressEl) progressEl.textContent = msg;
};

let stopRequested = false;
const setRunningUi = (running: boolean) => {
	const runBtn = document.getElementById('btn-run-task') as HTMLButtonElement | null;
	const stopBtn = document.getElementById('btn-stop') as HTMLButtonElement | null;
	if (runBtn) runBtn.disabled = running;
	if (stopBtn) stopBtn.disabled = !running;
};

document.getElementById('btn-stop')?.addEventListener('click', () => {
	stopRequested = true;
	updateProgress('Stopping...');
});

// ---- LLM step parsing helpers ----
const HTML_TAGS = new Set([
	'a',
	'abbr',
	'address',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'base',
	'bdi',
	'bdo',
	'blockquote',
	'body',
	'br',
	'button',
	'canvas',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'data',
	'datalist',
	'dd',
	'del',
	'details',
	'dfn',
	'dialog',
	'div',
	'dl',
	'dt',
	'em',
	'embed',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'header',
	'hr',
	'html',
	'i',
	'iframe',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'link',
	'main',
	'map',
	'mark',
	'menu',
	'meta',
	'meter',
	'nav',
	'noscript',
	'object',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'param',
	'picture',
	'pre',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'script',
	'section',
	'select',
	'small',
	'source',
	'span',
	'strong',
	'style',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'template',
	'textarea',
	'tfoot',
	'th',
	'thead',
	'time',
	'title',
	'tr',
	'track',
	'u',
	'ul',
	'var',
	'video',
	'wbr',
]);

const normalizeSelector = (raw: string | undefined | null): string => {
	const s = (raw || '').trim();
	if (!s) return '';

	// If it already looks like a selector, keep it.
	if (/[#.[\] >,:()"'=]/.test(s)) return s;

	// If it looks like a tag name, keep it (avoid turning "input" into "#input").
	const lower = s.toLowerCase();
	if (HTML_TAGS.has(lower)) return lower;

	// Common LLM output: bare element id like "searchDropdownBox"
	if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(s)) return `#${s}`;

	return s;
};

const extractNavigateUrl = (line: string): string | null => {
	// Keep everything after "NAVIGATE:" or "NAVIGATE " to avoid breaking on "https://"
	// Handle both "NAVIGATE:https://..." and "NAVIGATE https://..."
	const m = line.trim().match(/^NAVIGATE[\s:]+(.+)$/i);
	if (!m) return null;
	let url = m[1].trim();
	// Common model variants: "url=...", "url:..."
	url = url.replace(/^url\s*=\s*/i, '').replace(/^url\s*:\s*/i, '').trim();
	if (!url) return null;

	// If the model included extra text, try to extract the first URL-like token
	const urlToken =
		url.match(/https?:\/\/\S+/i)?.[0] ??
		url.match(/\/\/\S+/)?.[0] ??
		url.match(/www\.\S+/i)?.[0] ??
		url;

	return urlToken.replace(/[)\],.]+$/g, '').trim();
};

const normalizeUrl = (raw: string): string | null => {
	let url = (raw || '').trim();
	if (!url) return null;

	// Handle accidental "https:" or "http" outputs
	if (/^https?:?$/i.test(url) || /^http$/i.test(url)) return null;

	// Remove accidental "url=" prefix (defensive)
	url = url.replace(/^url\s*=\s*/i, '').replace(/^url\s*:\s*/i, '').trim();

	// Already absolute
	if (/^https?:\/\//i.test(url)) return url;

	// Protocol-relative
	if (url.startsWith('//')) return `https:${url}`;

	// Domain-like
	if (/^www\./i.test(url)) return `https://${url}`;

	// If it looks like a hostname/path, assume https
	if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;

	return null;
};

type InternalStep = { action: string; target?: string; value?: string; url?: string };

const parseLineToStep = (line: string): InternalStep | null => {
	const trimmed = (line || '').trim();
	if (!trimmed) return null;
	if (/^DONE\b/i.test(trimmed)) return { action: 'DONE' };

	const navUrl = extractNavigateUrl(trimmed);
	if (navUrl) return { action: 'NAVIGATE', url: navUrl };

	const m = trimmed.match(/^(FIND|TYPE|CLICK|WAIT|SELECT|UPLOAD)\s*:\s*(.+)$/i);
	if (!m) return null;
	const action = m[1].toUpperCase();
	const rest = (m[2] || '').trim();

	// Split "target:value" only at the first ':'
	const idx = rest.indexOf(':');
	const target = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
	const value = (idx >= 0 ? rest.slice(idx + 1) : '').trim();

	if (action === 'TYPE') {
		const selector = target?.split('->')[1] || target || 'AUTO';
		return { action, target: normalizeSelector(selector), value };
	}
	if (action === 'FIND') {
		const parts = target.split('->');
		const desc = parts[0]?.trim() || '';
		const selector = parts[1]?.trim() || '';
		return { action, target: selector ? normalizeSelector(selector) : '', value: desc || target };
	}
	if (action === 'SELECT') {
		const selector = target?.split('->')[1] || target || 'AUTO';
		return { action, target: normalizeSelector(selector), value };
	}
	if (action === 'UPLOAD') {
		return { action, target, value };
	}
	if (action === 'WAIT') {
		const ms = (/^\d+$/.test(target) ? target : /^\d+$/.test(value) ? value : target || value);
		return { action, value: ms };
	}
	// CLICK
	const selector = target?.split('->')[1] || target || 'AUTO';
	return { action, target: normalizeSelector(selector) };
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

// Task execution with history memory
document.getElementById('btn-run-task')?.addEventListener('click', async () => {
    const t = taskInput();
    if (!t) return;
    
    const startTime = Date.now();
    const cfg = await loadLlmConfig();
    const agentCfg = await loadAgentLoopConfig();
    stopRequested = false;
    setRunningUi(true);
    
    // Extract domain from current tab or target URL
    const currentTab = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = currentTab[0]?.url || '';
    const domain = new URL(currentUrl.startsWith('http') ? currentUrl : 'https://example.com').hostname;
    
    let steps: InternalStep[] = [];
    let usedHistory = false;
    
    // Check task history first
    if (!(cfg.mode === 'llm' && agentCfg.enabled)) {
        try {
            const history = await loadTaskHistory(domain);
            const similarTasks = await findSimilarTasks(t, domain, history, 0.8, 3);
            
            if (similarTasks.length > 0 && similarTasks[0].confidence >= 0.8) {
                const bestMatch = similarTasks[0];
                log({ 
                    info: `🎯 Reusing pattern: "${bestMatch.taskDescription}"`,
                    confidence: bestMatch.confidence,
                    successes: bestMatch.successCount
                });
                updateProgress(`Using cached pattern (${bestMatch.successCount} successes)...`);
                
                // Convert TaskStep[] to our internal format
                steps = bestMatch.steps.map(step => ({
                    action: step.action,
                    target: step.target,
                    value: step.value,
                    url: step.url
                }));
                usedHistory = true;
            }
        } catch (error) {
            log({ warning: 'Failed to check history', error: String(error) });
        }
    }
    
    // TASK CLASSIFICATION: Determine task type and route to appropriate workflow
    if (cfg.mode === 'llm') {
        try {
            updateProgress('🔍 Classifying task type...');
            const { classifyTask } = await import('./shared/taskClassifier.js');
            const classified = await classifyTask(t);
            
            log({ 
                '🎯 TASK CLASSIFIED': {
                    type: classified.type,
                    intent: classified.extractedIntent
                }
            });
            
            // Route to specific workflows
            if (classified.type === 'form_filling') {
                try {
                    updateProgress('📝 Form Filling Mode: Detecting form fields...');
                    const { detectFormFields, generateFormInputHTML, collectFormData, fillFormWithData, extractFormDataFromPrompt } = await import('./workflows/formFilling.js');
                    
                    // Get snapshot for form detection
                    const snap = await sendToActive('SNAPSHOT', {});
                    const snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { elements: [] };
                    
                    const form = detectFormFields(snapshotData);
                    
                    if (form.fields.length === 0) {
                        updateProgress('❌ No form fields found on this page');
                        log({ warning: 'No form fields detected', snapshot: snapshotData });
                        setRunningUi(false);
                        return;
                    }
                    
                    log({ status: 'Form detected', fieldsCount: form.fields.length });
                    updateProgress(`📋 Found ${form.fields.length} form fields. Extracting data from your prompt...`);
                    
                    // Extract data from user's prompt using LLM
                    const extractedData = await extractFormDataFromPrompt(t, form);
                    
                    // Count how many ACTUAL form fields were matched (not just extracted values)
                    let matchedFields = 0;
                    let filledRequiredFields = 0;
                    let requiredFields = 0;
                    
                    for (const field of form.fields) {
                        if (field.required) requiredFields++;
                        if (extractedData[field.selector]) {
                            matchedFields++;
                            if (field.required) filledRequiredFields++;
                        }
                    }
                    
                    log({ 
                        status: 'Data extraction complete', 
                        matchedFields,
                        totalFields: form.fields.length,
                        requiredFields,
                        filledRequiredFields,
                        extractedData 
                    });
                    
                    // ALWAYS show dialog for review - user should verify data
                    // But provide helpful feedback about what was auto-filled
                    if (matchedFields > 0) {
                        updateProgress(`📋 Auto-filled ${matchedFields}/${form.fields.length} fields. Please review...`);
                    } else {
                        updateProgress(`📋 Could not auto-extract data. Please fill manually...`);
                    }
                    
                    const dialogContainer = document.getElementById('form-dialog-container');
                    const dialogContent = document.getElementById('form-dialog-content');
                    
                    if (dialogContainer && dialogContent) {
                        dialogContent.innerHTML = generateFormInputHTML(form, extractedData);
                        dialogContainer.style.display = 'block';
                        
                        // Handle form submission
                        await new Promise<void>((resolve) => {
                            document.getElementById('form-submit-data')?.addEventListener('click', async () => {
                                const data = collectFormData(form);
                                if (data) {
                                    dialogContainer.style.display = 'none';
                                    updateProgress('✍️ Filling form...');
                                    await fillFormWithData(form, data, log);
                                    updateProgress('✅ Form filled successfully!');
                                    resolve();
                                }
                            });
                            
                            document.getElementById('form-cancel-data')?.addEventListener('click', () => {
                                dialogContainer.style.display = 'none';
                                updateProgress('❌ Form filling cancelled');
                                resolve();
                            });
                        });
                    }
                    
                    const executionTime = Date.now() - startTime;
                    log({ status: 'Form filling complete', executionTime: `${executionTime}ms` });
                    setRunningUi(false);
                    return;
                } catch (error) {
                    log({ error: 'Form filling failed', details: String(error) });
                    updateProgress('❌ Form filling failed');
                    setRunningUi(false);
                    return;
                }
            }
            
            if (classified.type === 'summarization') {
                try {
                    updateProgress('📄 Summarization Mode: Extracting content...');
                    const { executeSummarizationWorkflow, generateSummaryHTML } = await import('./workflows/summarization.js');
                    
                    const summary = await executeSummarizationWorkflow(log);
                    
                    // Display summary in results container
                    const resultsContainer = document.getElementById('results-container');
                    if (resultsContainer) {
                        resultsContainer.innerHTML = generateSummaryHTML(summary);
                        
                        // Add copy button handler
                        document.getElementById('copy-summary')?.addEventListener('click', () => {
                            navigator.clipboard.writeText(summary.content);
                            alert('Summary copied to clipboard!');
                        });
                    }
                    
                    updateProgress('✅ Summary generated!');
                    const executionTime = Date.now() - startTime;
                    log({ status: 'Summarization complete', executionTime: `${executionTime}ms` });
                    setRunningUi(false);
                    return;
                } catch (error) {
                    log({ error: 'Summarization failed', details: String(error) });
                    updateProgress('❌ Summarization failed');
                    setRunningUi(false);
                    return;
                }
            }
            
            if (classified.type === 'data_extraction') {
                try {
                    updateProgress('📊 Data Extraction Mode: Identifying targets...');
                    const { executeDataExtractionWorkflow, generateExtractionHTML, dataToCSV } = await import('./workflows/dataExtraction.js');
                    
                    // Get snapshot
                    const snap = await sendToActive('SNAPSHOT', {});
                    const snapshotData = (snap as any)?.success && (snap as any)?.data ? (snap as any).data : { elements: [] };
                    
                    const data = await executeDataExtractionWorkflow(t, snapshotData, log);
                    
                    // Display extracted data in results container
                    const resultsContainer = document.getElementById('results-container');
                    if (resultsContainer) {
                        const targets = []; // Would need to pass from workflow
                        resultsContainer.innerHTML = generateExtractionHTML(data, targets);
                        
                        // Add copy button handlers
                        document.getElementById('copy-extraction-json')?.addEventListener('click', () => {
                            navigator.clipboard.writeText(JSON.stringify(data.items, null, 2));
                            alert('Data copied as JSON!');
                        });
                        
                        document.getElementById('copy-extraction-csv')?.addEventListener('click', () => {
                            navigator.clipboard.writeText(dataToCSV(data));
                            alert('Data copied as CSV!');
                        });
                    }
                    
                    updateProgress(`✅ Extracted ${data.count} items!`);
                    const executionTime = Date.now() - startTime;
                    log({ status: 'Data extraction complete', executionTime: `${executionTime}ms` });
                    setRunningUi(false);
                    return;
                } catch (error) {
                    log({ error: 'Data extraction failed', details: String(error) });
                    updateProgress('❌ Data extraction failed');
                    setRunningUi(false);
                    return;
                }
            }
            
            // For navigation and general_automation, fall through to existing agent loop
            log({ status: 'Using general automation workflow for navigation/interaction tasks' });
            
        } catch (error) {
            log({ warning: 'Task classification failed, using general automation', error: String(error) });
        }
    }
    
    // Agent loop mode (LLM multi-turn): observe → plan(1 step) → act → observe...
    if (cfg.mode === 'llm' && agentCfg.enabled) {
        const maxIterations = Math.max(1, Math.min(200, agentCfg.maxIterations || 20));
        const recent: Array<InternalStep & { ok?: boolean; error?: string }> = [];

        // PHASE 1: Ask LLM for site-specific approach (planning phase)
        updateProgress('🧠 Phase 1/2: Asking LLM how to approach this task...');
        log({ status: '🧠 PHASE 1: Planning - Asking LLM for execution strategy' });
        const { planSiteApproach } = await import('./shared/llmClient.js');
        const siteGuidance = await planSiteApproach(t);
        
        if (siteGuidance.startUrl) {
            updateProgress(`📍 Plan ready: ${siteGuidance.startUrl}`);
            log({ 
                '🧠 PLANNING PHASE COMPLETE': {
                    startUrl: siteGuidance.startUrl,
                    approachSteps: siteGuidance.approach.split('\n').filter(l => l.trim().startsWith('-')).length + ' steps',
                    fullApproach: siteGuidance.approach
                }
            });
        } else {
            updateProgress('⚠️ Planning: LLM did not provide start URL, proceeding anyway...');
            log({ 
                '⚠️ WARNING': 'No start URL from planning phase', 
                approach: siteGuidance.approach || 'No approach provided'
            });
        }
        
        // If we got a valid start URL, use it for first navigation
        let plannedStartUrl = siteGuidance.startUrl || '';
        
        // Executor state
        let lastSelector = '';
        const foundSelectors: Record<string, string> = {};
        let hasNavigatedOnce = false; // Track if we've navigated already
        let lastPageElementCount = 0; // Track page health

        const execOne = async (s: InternalStep, i: number) => {
            updateProgress(`Step ${i + 1}/${maxIterations}: ${s.action} ${s.value || s.url || s.target || ''}`);

            if (s.action === 'NAVIGATE' && s.url) {
                const url = normalizeUrl(s.url);
                if (!url) throw new Error(`NAVIGATE invalid url: ${s.url}`);
                log({ step: { action: 'NAVIGATE', url } });
                await sendToActive('NAVIGATE', { url });
                // wait for content script to reconnect
                for (let j = 0; j < 20; j++) {
                    try {
                        const pong = await sendToActive('PING_CONTENT', {});
                        if ((pong as any)?.success) break;
                    } catch {}
                    await new Promise(r => setTimeout(r, 250));
                }
                log({ status: 'Waiting for page ready...' });
                try {
                    await sendToActive('PAGE_READY', { timeout: 15000 });
                } catch (e) {
                    log({ warning: 'PAGE_READY timeout', error: String(e) });
                }
                
                // Universal extra wait for ALL SPAs (most modern sites are SPAs)
                log({ info: 'Adding universal SPA wait (1s) for dynamic content...' });
                await new Promise(r => setTimeout(r, 1000));
                return;
            }

            if (s.action === 'FIND' && s.value) {
                // If LLM provided selector: FIND:desc->selector
                if (s.target) {
                    lastSelector = normalizeSelector(s.target);
                    (document.getElementById('sel') as HTMLInputElement).value = lastSelector;
                    const h = await sendToActive('HIGHLIGHT', { selector: lastSelector });
                    log({ info: 'Using LLM-provided selector', selector: lastSelector, highlight: h.success });
                    if (s.value) foundSelectors[s.value] = lastSelector;
                    await new Promise(r => setTimeout(r, 200));
                    return;
                }
                // Otherwise semantic FIND by description
                let r: BusResponse<{ selector: string }> | undefined;
                for (let k = 0; k < 5; k++) {
                    r = await sendToActive<{ selector: string }>('FIND', { description: s.value });
                    if (r.success && r.data?.selector) break;
                    await new Promise(res => setTimeout(res, 400));
                }
                log(r);
                if (r && r.success && r.data?.selector) {
                    lastSelector = r.data.selector;
                    (document.getElementById('sel') as HTMLInputElement).value = lastSelector;
                    await sendToActive('HIGHLIGHT', { selector: lastSelector });
                    if (s.value) foundSelectors[s.value] = r.data.selector;
                    await new Promise(r2 => setTimeout(r2, 300));
                } else {
                    throw new Error('FIND failed');
                }
                return;
            }

            if (s.action === 'TYPE') {
                const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
                if (!selector) throw new Error('TYPE: no selector available');
                log({ action: 'TYPE', selector, value: s.value });
                const r = await sendToActive('TYPE', { selector, text: s.value || textInput() });
                log(r);
                if (!r.success) throw new Error(r.error || 'TYPE failed');
                return;
            }

            if (s.action === 'CLICK') {
                const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
                if (!selector) throw new Error('CLICK: no selector available');
                const r = await sendToActive('CLICK', { selector });
                log(r);
                if (!r.success) throw new Error(r.error || 'CLICK failed');
                await new Promise(r2 => setTimeout(r2, 400));
                return;
            }

            if (s.action === 'SELECT') {
                const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
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
        };

        try {
            updateProgress('⚙️ Phase 2/2: Executing planned approach...');
            log({ status: '⚙️ PHASE 2: Execution - Starting agent loop with planned guidance', maxIterations });
            let consecutiveNavigations = 0;
            let lastNavigationUrl = '';
            let consecutiveFailures = 0;
            let consecutiveWaits = 0;
            
            // PHASE 2: Execute with guidance
            for (let i = 0; i < maxIterations; i++) {
                if (stopRequested) {
                    log({ status: 'Stopped by user' });
                    updateProgress('Stopped.');
                    break;
                }

                const snap = await sendToActive('SNAPSHOT', {});
                const snapshotData =
                    (snap as any)?.success && (snap as any)?.data
                        ? (snap as any).data
                        : { url: currentUrl, title: '', elements: [] };
                const optimized = optimizeSnapshot(snapshotData);

                let step: InternalStep | null = null;
                
                // If this is the first iteration and we have a planned start URL, use it
                if (i === 0 && plannedStartUrl && plannedStartUrl.startsWith('http')) {
                    updateProgress(`📍 Step ${i + 1}: Navigating to planned URL...`);
                    log({ 
                        info: '✅ Using planned start URL from Phase 1 (bypassing LLM for first step)', 
                        url: plannedStartUrl 
                    });
                    step = { action: 'NAVIGATE', url: plannedStartUrl };
                } else {
                    // Check if we need to intervene for video playback tasks
                    const lowerTask = t.toLowerCase();
                    const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch') || lowerTask.includes('song'));
                    const currentUrl = snapshotData.url || '';
                    const hasSearched = recent.some(s => s.action === 'TYPE' && s.ok === true);
                    const hasClickedVideo = recent.slice(recent.findIndex(s => s.action === 'TYPE')).some(s => s.action === 'CLICK' && s.ok === true);
                    const recentWaits = recent.slice(-5).filter(s => s.action === 'WAIT').length;
                    
                    // CRITICAL CHECK: Are we stuck on homepage after searching?
                    if (isVideoPlayback && hasSearched && currentUrl === 'https://www.youtube.com/' && recentWaits >= 3) {
                        log({
                            '🚨 STUCK ON HOMEPAGE': {
                                reason: 'Search typed but still on homepage after multiple WAITs',
                                action: 'Search not executing. Forcing search button click.',
                                currentUrl
                            }
                        });
                        updateProgress('🔧 Search failed to navigate. Forcing search button...');
                        
                        // Try to force-click the search button (more reliable than Enter key)
                        const searchButtonSelectors = [
                            'button#search-icon-legacy',
                            'button[aria-label*="Search"]',
                            '#search-icon-legacy',
                            'ytd-searchbox button'
                        ];
                        
                        let searchClicked = false;
                        for (const selector of searchButtonSelectors) {
                            try {
                                const clickResult = await sendToActive('CLICK', { selector });
                                if ((clickResult as any).success) {
                                    log({ info: '✅ Forced search button click', selector });
                                    recent.push({ action: 'CLICK', target: selector, ok: true });
                                    searchClicked = true;
                                    await new Promise(r => setTimeout(r, 2000)); // Wait for results
                                    break;
                                }
                            } catch (e) {
                                // Try next selector
                            }
                        }
                        
                        if (searchClicked) {
                            // Get new snapshot to see if we're now on results page
                            const checkSnap = await sendToActive('SNAPSHOT', {});
                            const newUrl = (checkSnap as any)?.data?.url || '';
                            
                            if (newUrl.includes('/results') || newUrl.includes('search_query=')) {
                                log({ info: '✅ Search executed successfully, now on results page', newUrl });
                                continue; // Continue to next iteration to click video
                            } else {
                                log({ warning: 'Search button clicked but still not on results page', newUrl });
                            }
                        }
                        
                        // Fallback: If search still doesn't work, try clicking any video as last resort
                        log({ warning: 'Search button click failed, trying to click any video from homepage' });
                        const videoSelectors = [
                            'ytd-rich-item-renderer a#video-title-link',
                            'ytd-video-renderer a#video-title',
                            'a#video-title'
                        ];
                        
                        for (const selector of videoSelectors) {
                            try {
                                const clickResult = await sendToActive('CLICK', { selector });
                                if ((clickResult as any).success) {
                                    log({ info: '⚠️ Clicked random video from homepage (search failed)', selector });
                                    recent.push({ action: 'CLICK', target: selector, ok: true });
                                    await new Promise(r => setTimeout(r, 2000));
                                    break;
                                }
                            } catch (e) {
                                // Continue to next selector
                            }
                        }
                        
                        continue;
                    }
                    
                    // INTERVENTION: If video playback task, we've searched, and we're on /results but haven't clicked video yet
                    if (isVideoPlayback && hasSearched && (currentUrl.includes('/results') || currentUrl.includes('search_query=')) && !hasClickedVideo) {
                        const clicksAfterSearch = recent.slice(recent.findIndex(s => s.action === 'TYPE')).filter(s => s.action === 'CLICK').length;
                        const doneRejectionsOnResults = recent.filter(s => 
                            s.action === 'WAIT' && 
                            s.error?.includes('premature')
                        ).length;
                        
                        // Intervene if: LLM tried to click 2+ times OR got stuck saying DONE 3+ times
                        const shouldIntervene = (clicksAfterSearch >= 2 && clicksAfterSearch < 4) || 
                                               (doneRejectionsOnResults >= 3 && doneRejectionsOnResults < 5);
                        
                        if (shouldIntervene) {
                            log({
                                '🎯 SMART INTERVENTION': {
                                    reason: 'Video playback task stuck on search results - forcing video click',
                                    currentUrl,
                                    doneRejectionsOnResults,
                                    clicksAfterSearch,
                                    action: 'Looking for first video result to click'
                                }
                            });
                            updateProgress('🎬 Finding video to play...');
                            
                            // Look for common YouTube video result selectors
                            const videoSelectors = [
                                'ytd-video-renderer a#video-title',
                                'ytd-video-renderer h3 a',
                                'a#video-title',
                                'ytd-thumbnail a'
                            ];
                            
                            let clicked = false;
                            for (const selector of videoSelectors) {
                                try {
                                    const clickResult = await sendToActive('CLICK', { selector });
                                    if ((clickResult as any).success) {
                                        log({ info: '✅ Successfully clicked video with selector', selector });
                                        recent.push({ action: 'CLICK', target: selector, ok: true });
                                        clicked = true;
                                        await new Promise(r => setTimeout(r, 2000)); // Wait for video page to load
                                        break;
                                    }
                                } catch (e) {
                                    // Try next selector
                                }
                            }
                            
                            if (clicked) {
                                continue; // Skip LLM call, go to next iteration
                            }
                        }
                    }
                    
                    // Ask LLM for next action
                    const prompt = createNextActionPrompt({
                        snapshot: optimized,
                        task: t,
                        recentSteps: recent.map(r => ({ ...r })),
                        siteApproach: siteGuidance.approach, // Include planned approach
                    });

                    log({ info: `🤖 Asking LLM for next action (${cfg.model || 'default'})`, snapshotSize: JSON.stringify(optimized).length });
                    // planWithLLM already cleans up GLM-style output (removes <think>...</think>, <|begin_of_box|>, etc.)
                    const text = await planWithLLM(prompt);
                    const firstLine = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] || '';
                    step = parseLineToStep(firstLine);
                }
                
                if (!step) {
                    recent.push({ action: 'ERROR', value: 'No parseable action', ok: false, error: 'No parseable action' });
                    log({ warning: 'LLM returned no parseable action', cleaned: text, firstLine });
                    continue;
                }
                
                if (step.action === 'DONE') {
                    // Validate completion based on task type
                    const lowerTask = t.toLowerCase();
                    const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch') || lowerTask.includes('song'));
                    
                    // Check recent actions to see if task is truly complete
                    const hasTypedSearch = recent.some(s => s.action === 'TYPE' && s.ok === true);
                    const hasClickedAfterSearch = recent.slice(recent.findIndex(s => s.action === 'TYPE')).some(s => s.action === 'CLICK' && s.ok === true);
                    
                    // Count how many times we've rejected DONE (to prevent infinite loops)
                    const doneRejections = recent.filter(s => s.action === 'WAIT' && s.error?.includes('premature')).length;
                    
                    // For video playback: must have clicked on a result after searching
                    if (isVideoPlayback && hasTypedSearch && !hasClickedAfterSearch) {
                        if (doneRejections >= 3) {
                            log({
                                '❌ ABORTING': {
                                    reason: 'Rejected DONE 3+ times but no progress',
                                    suggestion: 'LLM cannot find video to click, or page elements not detectable'
                                }
                            });
                            updateProgress('❌ Could not find video to play');
                            break;
                        }
                        
                        log({ 
                            '⚠️ PREMATURE DONE DETECTED': {
                                reason: 'LLM tried to mark DONE but video playback task requires clicking on video',
                                hasSearched: hasTypedSearch,
                                hasClickedVideo: hasClickedAfterSearch,
                                action: 'Forcing WAIT and continuing execution'
                            }
                        });
                        updateProgress('⏳ Waiting for search results to load...');
                        step = { action: 'WAIT', value: '1500', error: 'premature-done-rejection' };
                        recent.push({ ...step, ok: true });
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                    
                    // Check URL for video playback completion
                    if (isVideoPlayback) {
                        const currentSnapshot = await sendToActive('SNAPSHOT', {});
                        const currentUrl = (currentSnapshot as any)?.data?.url || '';
                        
                        // YouTube video URLs contain "/watch?v="
                        if (!currentUrl.includes('/watch')) {
                            if (doneRejections >= 5) {
                                log({
                                    '❌ ABORTING': {
                                        reason: 'Rejected DONE 5+ times, stuck in loop',
                                        currentUrl,
                                        suggestion: 'Search may have failed or LLM clicking wrong elements'
                                    }
                                });
                                updateProgress('❌ Failed to navigate to video');
                                break;
                            }
                            
                            log({
                                '⚠️ PREMATURE DONE DETECTED': {
                                    reason: 'Task is "play video" but not on a video watch page',
                                    currentUrl,
                                    expected: 'URL should contain /watch?v=',
                                    rejectionCount: doneRejections + 1,
                                    action: 'Continuing execution to find and click video'
                                }
                            });
                            updateProgress('🔍 Looking for video to click...');
                            step = { action: 'WAIT', value: '1000', error: 'premature-done-rejection' };
                            recent.push({ ...step, ok: true });
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                    }
                    
                    updateProgress('✅ Done (LLM said DONE)');
                    log({ status: 'Done', reason: 'LLM_DONE' });
                    break;
                }
                
                // STRICT NAVIGATION BLOCKING: Only allow the first planned navigation
                if (step.action === 'NAVIGATE') {
                    if (hasNavigatedOnce) {
                        // Block all subsequent navigation attempts
                        log({ 
                            '🚫 BLOCKING NAVIGATION': {
                                reason: 'Already navigated once. LLM is hallucinating URLs.',
                                attemptedUrl: step.url,
                                currentUrl: snapshotData.url || 'unknown',
                                message: 'Forcing WAIT:1000 instead. LLM must work with current page.'
                            }
                        });
                        updateProgress(`🚫 Blocked navigation to ${step.url} - working with current page`);
                        step = { action: 'WAIT', value: '1000' };
                        recent.push({ ...step, ok: true, error: 'Navigation blocked - already navigated' });
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    } else {
                        // This is the first navigation (from the plan)
                        hasNavigatedOnce = true;
                        log({ info: '✅ First navigation allowed (from plan)', url: step.url });
                    }
                }

                // Execute with retry and exponential backoff
                let lastError = null;
                let succeeded = false;
                const maxRetries = 3;
                
                for (let retry = 0; retry < maxRetries && !succeeded; retry++) {
                    try {
                        if (retry > 0) {
                            const backoffMs = Math.pow(2, retry - 1) * 500; // 500ms, 1s, 2s
                            log({ info: `Retry ${retry}/${maxRetries} after ${backoffMs}ms` });
                            await new Promise(r => setTimeout(r, backoffMs));
                        }
                        
                        await execOne(step, i);
                        succeeded = true;
                        recent.push({ ...step, ok: true });
                        consecutiveFailures = 0; // Reset on success
                        
                        // Track WAIT spam
                        if (step.action === 'WAIT') {
                            consecutiveWaits++;
                        } else {
                            consecutiveWaits = 0;
                        }
                        
                        // After first navigation, check if page is valid
                        if (step.action === 'NAVIGATE' && i === 0) {
                            await new Promise(r => setTimeout(r, 1000)); // Extra wait
                            const checkSnap = await sendToActive('SNAPSHOT', {});
                            const checkData = (checkSnap as any)?.success && (checkSnap as any)?.data
                                ? (checkSnap as any).data
                                : { elements: [] };
                            const elementCount = checkData.elements?.length || 0;
                            const metadata = checkData.metadata || {};
                            
                            log({
                                '📊 PAGE HEALTH CHECK': {
                                    url: step.url,
                                    totalElements: elementCount,
                                    inputs: metadata.inputCount || 0,
                                    buttons: metadata.buttonCount || 0,
                                    hasForm: metadata.hasForm || false
                                }
                            });
                            
                            if (elementCount < 100) {
                                log({
                                    '⚠️ WARNING': 'Page seems broken or incomplete',
                                    elementCount,
                                    possibleReasons: ['404 error', 'Page not fully loaded', 'Wrong URL', 'Site structure changed']
                                });
                            }
                            
                            // CRITICAL: If page is completely empty, abort immediately
                            if (elementCount === 0) {
                                updateProgress('❌ FAILED: Page is completely blocked or empty');
                                log({
                                    '❌ TASK FAILED': {
                                        reason: 'Page completely empty (0 interactive elements)',
                                        url: step.url,
                                        possibleCauses: [
                                            'Site has anti-bot protection (Cloudflare, etc.)',
                                            'Site blocked Chrome extensions',
                                            'Site does not exist (404)',
                                            'Network/firewall blocking',
                                            'Site requires login first'
                                        ],
                                        suggestion: 'Try a different website or disable anti-bot protection'
                                    }
                                });
                                throw new Error('Page blocked or empty - cannot proceed');
                            }
                        }
                    } catch (e) {
                        lastError = String(e);
                        if (retry === maxRetries - 1) {
                            recent.push({ ...step, ok: false, error: lastError });
                            log({ stepError: lastError, step, retriesExhausted: true });
                            consecutiveFailures++;
                        }
                    }
                }
                
                // ABORT EARLY if clearly stuck
                if (consecutiveFailures >= 5) {
                    updateProgress('❌ FAILED: Too many consecutive errors');
                    log({
                        '❌ ABORTING': {
                            reason: '5+ consecutive action failures',
                            likelyIssue: 'Page elements not findable or site blocking automation',
                            suggestion: 'Check if site has anti-bot protection or requires login'
                        }
                    });
                    break;
                }
                
                if (consecutiveWaits >= 8) {
                    updateProgress('❌ FAILED: Agent stuck in wait loop');
                    log({
                        '❌ ABORTING': {
                            reason: '8+ consecutive WAIT actions',
                            likelyIssue: 'Page not loading or no interactive elements available',
                            lastSnapshot: optimized.metadata
                        }
                    });
                    break;
                }
            }
        } finally {
            const executionTime = Date.now() - startTime;
            setRunningUi(false);
            log({ status: 'Agent loop finished', executionTime: `${executionTime}ms` });
        }

        return;
    }

    // If no history match, proceed with LLM or heuristic planning
    if (steps.length === 0) {
    if (cfg.mode === 'llm') {
        try {
            const snap = await sendToActive('SNAPSHOT', {});
            const snapshotData =
                (snap as any)?.success && (snap as any)?.data
                    ? (snap as any).data
                    : { url: currentUrl, title: '', elements: [] };
            
            // Optimize snapshot for token efficiency
            const optimized = optimizeSnapshot(snapshotData);
            
            // Create optimized prompt
            const prompt = createOptimizedPrompt(optimized, t);
            
            log({ info: `Using LLM: ${cfg.model || 'default'}`, snapshotSize: JSON.stringify(optimized).length });
            
            const text = await planWithLLM(prompt);
            
            // Parse LLM response
            for (const line of text.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Special-case NAVIGATE to avoid splitting URLs on ':' (https://...)
                const navUrl = extractNavigateUrl(trimmed);
                if (navUrl) {
                    steps.push({ action: 'NAVIGATE', url: navUrl });
                    continue;
                }

                const m = trimmed.match(/^(FIND|TYPE|CLICK|WAIT|SELECT|UPLOAD)\s*:\s*(.+)$/i);
                if (!m) continue;
                const action = m[1].toUpperCase();
                const rest = (m[2] || '').trim();

                // Split rest into "target:value" (only on the first ':')
                const idx = rest.indexOf(':');
                const target = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
                const value = (idx >= 0 ? rest.slice(idx + 1) : '').trim();

                if (action === 'TYPE') {
                    const selector = target?.split('->')[1] || target || 'AUTO';
                    steps.push({ action, target: normalizeSelector(selector), value });
                } else if (action === 'FIND') {
                    // Prefer explicit selector if provided: FIND:description->selector
                    const parts = target.split('->');
                    const desc = parts[0]?.trim() || '';
                    const selector = parts[1]?.trim() || '';
                    steps.push({ action, target: selector ? normalizeSelector(selector) : '', value: desc || target });
                } else if (action === 'SELECT') {
                    const selector = target?.split('->')[1] || target || 'AUTO';
                    steps.push({ action, target: normalizeSelector(selector), value });
                } else if (action === 'UPLOAD') {
                    steps.push({ action, target, value });
                } else if (action === 'WAIT') {
                    // WAIT:milliseconds OR WAIT:description:milliseconds (use whichever is numeric)
                    const ms = (/^\d+$/.test(target) ? target : /^\d+$/.test(value) ? value : target || value);
                    steps.push({ action, value: ms });
                } else {
                    // CLICK:selector
                    const selector = target?.split('->')[1] || target || 'AUTO';
                    steps.push({ action, target: normalizeSelector(selector) });
                }
            }
            
            log({ info: `LLM generated ${steps.length} steps` });
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
            // Handle: "search for X on youtube" OR "search youtube for X"
            let q = '';
            const m1 = lc.match(/search (?:for |)(.+?)\s+on youtube/);
            const m2 = lc.match(/search youtube for (.+?)$/);
            if (m1) q = m1[1]?.trim() || '';
            else if (m2) q = m2[1]?.trim() || '';
            steps.push({ action: 'FIND', value: 'search box' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: q });
            steps.push({ action: 'FIND', value: 'search button' });
            steps.push({ action: 'CLICK', target: 'AUTO' });
        } else if (lc.includes('amazon')) {
            steps.push({ action: 'NAVIGATE', url: 'https://www.amazon.com/' });
            // Handle: "search for X on amazon" OR "search amazon for X"
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
            // LinkedIn job application workflow
            // Assumes user is already on a job posting page
            log({ info: 'LinkedIn Easy Apply workflow detected' });
            
            // Load user profile for auto-fill
            const { loadUserProfile } = await import('./shared/userProfile');
            const profile = await loadUserProfile();
            
            steps.push({ action: 'FIND', value: 'Easy Apply' });
            steps.push({ action: 'CLICK', target: 'AUTO' });
            steps.push({ action: 'WAIT', value: '1000' });
            
            // Fill form fields (basic)
            steps.push({ action: 'FIND', value: 'first name' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.firstName });
            
            steps.push({ action: 'FIND', value: 'last name' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.lastName });
            
            steps.push({ action: 'FIND', value: 'email' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.email });
            
            steps.push({ action: 'FIND', value: 'phone' });
            steps.push({ action: 'TYPE', target: 'AUTO', value: profile.personal.phone });
            
            // Resume upload (will prompt user)
            if (profile.professional.resumeFileName) {
                steps.push({ action: 'UPLOAD', target: 'resume', value: profile.professional.resumeFileName });
            }
            
            // Click Next/Submit
            steps.push({ action: 'FIND', value: 'Next' });
            steps.push({ action: 'CLICK', target: 'AUTO' });
            
            log({ info: `Profile loaded: ${profile.personal.firstName} ${profile.personal.lastName}` });
        }
    }
    }
    
    // Executor that uses last-found selector when target == 'AUTO'
    let lastSelector = '';
    updateProgress(`Starting task (${steps.length} steps)...`);
    log({ status: 'Starting', steps: steps.length, usedHistory });
    
    // Track selectors found during execution
    const foundSelectors: Record<string, string> = {};
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        updateProgress(`Step ${i + 1}/${steps.length}: ${s.action} ${s.value || s.url || s.target || ''}`);

        if (s.action === 'NAVIGATE' && s.url) {
            const url = normalizeUrl(s.url);
            if (!url) {
                log({ error: 'NAVIGATE: invalid URL from planner', raw: s.url });
                continue;
            }
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
                    await sendToActive('PAGE_READY', { timeout: 15000 });
                } catch (e) {
                    log({ warning: 'PAGE_READY timeout', error: String(e) });
                }
                
                // Extra wait for SPAs (Air India, booking sites, etc.)
                const currentUrl = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url || '';
                if (currentUrl.includes('airindia') || currentUrl.includes('makemytrip') || currentUrl.includes('booking')) {
                    log({ info: 'SPA detected, adding extra wait...' });
                    await new Promise(r => setTimeout(r, 1000));
                }
            continue;
        }
        if (s.action === 'FIND' && s.value) {
            let r: BusResponse<{ selector: string }> | undefined;
            // If the LLM provided a selector directly (FIND:desc->selector), use it.
            if (s.target) {
                lastSelector = normalizeSelector(s.target);
                (document.getElementById('sel') as HTMLInputElement).value = lastSelector;
                const h = await sendToActive('HIGHLIGHT', { selector: lastSelector });
                log({ info: 'Using LLM-provided selector', selector: lastSelector, highlight: h.success });
                await new Promise(r => setTimeout(r, 300));
                if (s.value) foundSelectors[s.value] = lastSelector;
                continue;
            }

            // Otherwise, use our semantic finder by description.
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

                // Store found selector for history
                if (s.value) {
                    foundSelectors[s.value] = r.data.selector;
                }
            }
            continue;
        }
        if (s.action === 'TYPE') {
            const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
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
            const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
            let r = await sendToActive('CLICK', { selector });
            if (!r.success) {
                await new Promise(r2 => setTimeout(r2, 500));
                r = await sendToActive('CLICK', { selector });
            }
            log(r);
            continue;
        }
        if (s.action === 'SELECT') {
            const selector = normalizeSelector(s.target === 'AUTO' ? lastSelector : s.target || selInput());
            const r = await sendToActive('SELECT', { selector, value: s.value });
            log(r);
            continue;
        }
        if (s.action === 'UPLOAD') {
            const r = await sendToActive('UPLOAD', { selector: s.target, fileName: s.value });
            log(r);
            continue;
        }
        if (s.action === 'WAIT' && s.value) {
            await new Promise(r => setTimeout(r, parseInt(s.value || '1000')));
            continue;
        }
        await new Promise(r => setTimeout(r, 200));
    }
    
    const executionTime = Date.now() - startTime;
    const success = true; // If we reached here, task succeeded
    
    updateProgress('✅ Task completed!');
    log({ status: 'Done', executionTime: `${executionTime}ms` });
    
    // Save to task history (if not already using history)
    if (!usedHistory && success) {
        try {
            // Convert steps to TaskStep format
            const taskSteps: TaskStep[] = steps.map(step => ({
                action: step.action as any,
                target: step.target,
                value: step.value,
                url: step.url
            }));
            
            await saveTaskHistory(t, domain, taskSteps, executionTime, foundSelectors, true);
            log({ info: '💾 Saved to task history' });
        } catch (error) {
            log({ warning: 'Failed to save history', error: String(error) });
        }
    } else if (usedHistory) {
        // Update existing history entry with success
        try {
            const taskSteps: TaskStep[] = steps.map(step => ({
                action: step.action as any,
                target: step.target,
                value: step.value,
                url: step.url
            }));
            
            await saveTaskHistory(t, domain, taskSteps, executionTime, foundSelectors, true);
            log({ info: '📈 Updated pattern stats' });
        } catch (error) {
            log({ warning: 'Failed to update history', error: String(error) });
        }
    }
});

// LLM settings load/save
(async () => {
    const cfg = await loadLlmConfig();
    (document.getElementById('llm-mode') as HTMLSelectElement | null)!.value = cfg.mode;
    (document.getElementById('llm-url') as HTMLInputElement | null)!.value = cfg.baseUrl || '';
    (document.getElementById('llm-key') as HTMLInputElement | null)!.value = cfg.apiKey || '';
    (document.getElementById('llm-model') as HTMLInputElement | null)!.value = cfg.model || 'llama-3.3-70b-instruct';
    (document.getElementById('detection-strategy') as HTMLSelectElement | null)!.value = cfg.detectionStrategy || 'dom';
    (document.getElementById('use-vision-fallback') as HTMLInputElement | null)!.checked = !!cfg.useVisionFallback;

    const agent = await loadAgentLoopConfig();
    (document.getElementById('agent-loop') as HTMLInputElement | null)!.checked = !!agent.enabled;
    (document.getElementById('agent-max') as HTMLInputElement | null)!.value = String(agent.maxIterations ?? 20);
})();

document.getElementById('save-llm')?.addEventListener('click', async () => {
    const mode = (document.getElementById('llm-mode') as HTMLSelectElement).value as 'heuristic' | 'llm';
    const baseUrl = (document.getElementById('llm-url') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('llm-key') as HTMLInputElement).value.trim();
    const model = (document.getElementById('llm-model') as HTMLInputElement).value.trim();
    const detectionStrategy = (document.getElementById('detection-strategy') as HTMLSelectElement).value as 'dom' | 'a11y' | 'vision';
    const useVisionFallback = (document.getElementById('use-vision-fallback') as HTMLInputElement).checked;
    
    await saveLlmConfig({ 
        mode, 
        baseUrl, 
        apiKey, 
        model,
        detectionStrategy,
        useVisionFallback
    });
    
    const enabled = (document.getElementById('agent-loop') as HTMLInputElement).checked;
    const maxIterations = parseInt((document.getElementById('agent-max') as HTMLInputElement).value || '20', 10);
    await saveAgentLoopConfig({
        enabled,
        maxIterations: Number.isFinite(maxIterations) ? maxIterations : 20
    });
    
    log({ saved: true, mode, detectionStrategy, useVisionFallback });
});

// Task History Management
import { getHistoryStats, pruneTaskHistory, clearTaskHistory, loadAllTaskHistory } from './shared/storage';

async function updateHistoryStats() {
    try {
        const stats = await getHistoryStats();
        const statsEl = document.getElementById('history-stats');
        if (statsEl) {
            const sizeMB = (stats.storageSize / 1024 / 1024).toFixed(2);
            statsEl.textContent = `${stats.totalEntries} patterns | ${stats.totalSuccesses} successes | ${sizeMB} MB`;
        }
    } catch (error) {
        log({ error: 'Failed to load history stats', details: String(error) });
    }
}

document.getElementById('view-history')?.addEventListener('click', async () => {
    try {
        const allHistory = await loadAllTaskHistory();
        log({ historyCount: allHistory.length });
        allHistory.slice(0, 10).forEach(entry => {
            log({
                task: entry.taskDescription,
                successes: entry.successCount,
                confidence: entry.confidence,
                lastUsed: new Date(entry.lastExecuted).toLocaleDateString()
            });
        });
    } catch (error) {
        log({ error: 'Failed to load history', details: String(error) });
    }
});

document.getElementById('prune-history')?.addEventListener('click', async () => {
    try {
        const pruned = await pruneTaskHistory();
        log({ pruned: `Removed ${pruned} old patterns` });
        await updateHistoryStats();
    } catch (error) {
        log({ error: 'Failed to prune history', details: String(error) });
    }
});

document.getElementById('clear-history')?.addEventListener('click', async () => {
    if (confirm('Clear all task history? This cannot be undone.')) {
        try {
            await clearTaskHistory();
            log({ info: 'All history cleared' });
            await updateHistoryStats();
        } catch (error) {
            log({ error: 'Failed to clear history', details: String(error) });
        }
    }
});

// Load history stats on startup
updateHistoryStats();

// User Profile Management
import { loadUserProfile, saveUserProfile } from './shared/userProfile';

document.getElementById('save-profile')?.addEventListener('click', async () => {
    const profile = {
        personal: {
            firstName: (document.getElementById('profile-firstName') as HTMLInputElement).value,
            lastName: (document.getElementById('profile-lastName') as HTMLInputElement).value,
            email: (document.getElementById('profile-email') as HTMLInputElement).value,
            phone: (document.getElementById('profile-phone') as HTMLInputElement).value,
            location: (document.getElementById('profile-location') as HTMLInputElement).value
        },
        professional: {
            currentTitle: (document.getElementById('profile-title') as HTMLInputElement).value,
            yearsOfExperience: parseInt((document.getElementById('profile-experience') as HTMLInputElement).value || '0'),
            currentCompany: '',
            resumeFileName: '',
            coverLetter: ''
        },
        preferences: {
            employmentTypes: ['Full-time'],
            workArrangement: ['Remote', 'Hybrid'],
            willingToRelocate: false,
            requiresSponsorship: false
        },
        education: {
            degree: '',
            fieldOfStudy: '',
            university: '',
            graduationYear: new Date().getFullYear()
        }
    };
    
    try {
        await saveUserProfile(profile);
        log({ info: 'Profile saved successfully' });
    } catch (error) {
        log({ error: 'Failed to save profile', details: String(error) });
    }
});

document.getElementById('load-profile')?.addEventListener('click', async () => {
    try {
        const profile = await loadUserProfile();
        (document.getElementById('profile-firstName') as HTMLInputElement).value = profile.personal.firstName;
        (document.getElementById('profile-lastName') as HTMLInputElement).value = profile.personal.lastName;
        (document.getElementById('profile-email') as HTMLInputElement).value = profile.personal.email;
        (document.getElementById('profile-phone') as HTMLInputElement).value = profile.personal.phone;
        (document.getElementById('profile-location') as HTMLInputElement).value = profile.personal.location;
        (document.getElementById('profile-title') as HTMLInputElement).value = profile.professional.currentTitle;
        (document.getElementById('profile-experience') as HTMLInputElement).value = String(profile.professional.yearsOfExperience);
        log({ info: 'Profile loaded successfully' });
    } catch (error) {
        log({ error: 'Failed to load profile', details: String(error) });
    }
});

// Auto-load profile on startup
(async () => {
    try {
        const profile = await loadUserProfile();
        if (profile.personal.firstName) {
            (document.getElementById('profile-firstName') as HTMLInputElement).value = profile.personal.firstName;
            (document.getElementById('profile-lastName') as HTMLInputElement).value = profile.personal.lastName;
            (document.getElementById('profile-email') as HTMLInputElement).value = profile.personal.email;
            (document.getElementById('profile-phone') as HTMLInputElement).value = profile.personal.phone;
            (document.getElementById('profile-location') as HTMLInputElement).value = profile.personal.location;
            (document.getElementById('profile-title') as HTMLInputElement).value = profile.professional.currentTitle;
            (document.getElementById('profile-experience') as HTMLInputElement).value = String(profile.professional.yearsOfExperience);
        }
    } catch {}
})();




import { loadLlmConfig } from './storage';

// Model-specific configurations
interface ModelConfig {
	temperature: number;
	maxTokens: number;
	stopSequences?: string[];
	systemPromptStyle?: 'chat' | 'instruct' | 'plain';
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
	'qwen/qwen-2.5-32b-instruct': {
		temperature: 0.1,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	'qwen/qwen-2.5-72b-instruct': {
		temperature: 0.1,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	'meta-llama/llama-3.3-70b-instruct': {
		temperature: 0.2,
		maxTokens: 512,
		stopSequences: ['<|eot_id|>'],
		systemPromptStyle: 'chat'
	},
	'meta-llama/llama-3.1-70b-instruct': {
		temperature: 0.2,
		maxTokens: 512,
		stopSequences: ['<|eot_id|>'],
		systemPromptStyle: 'chat'
	},
	'mistralai/mixtral-8x7b-instruct': {
		temperature: 0.15,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	'microsoft/phi-3-medium-instruct': {
		temperature: 0.15,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	// Local Ollama models
	'qwen2.5:32b': {
		temperature: 0.1,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	'llama3.3:70b': {
		temperature: 0.2,
		maxTokens: 512,
		systemPromptStyle: 'chat'
	},
	'mixtral:8x7b': {
		temperature: 0.15,
		maxTokens: 512,
		systemPromptStyle: 'instruct'
	},
	// Vision models (LM Studio / OpenAI-compatible)
	// GLM models use <think>...</think> blocks that consume many tokens, so need higher limit
	'glm-4.6v-flash': {
		temperature: 0.1,
		maxTokens: 1024,
		systemPromptStyle: 'instruct'
	},
	'zai-org/glm-4.6v-flash': {
		temperature: 0.1,
		maxTokens: 1024,
		systemPromptStyle: 'instruct'
	},
	'glm-4-v': {
		temperature: 0.1,
		maxTokens: 1024,
		systemPromptStyle: 'instruct'
	}
};

/**
 * Get model configuration with fallback to defaults
 */
function getModelConfig(modelName: string): ModelConfig {
	// Try exact match first
	if (MODEL_CONFIGS[modelName]) {
		return MODEL_CONFIGS[modelName];
	}
	
	const lowerName = modelName.toLowerCase();
	
	// Try partial match (e.g., "qwen" matches "qwen/qwen-2.5-32b-instruct")
	const partial = Object.keys(MODEL_CONFIGS).find(key => {
		const lowerKey = key.toLowerCase();
		return lowerKey.includes(lowerName) ||
			lowerName.includes(lowerKey) ||
			lowerName.includes(lowerKey.split('/')[1]?.split('-')[0] || '');
	});
	
	if (partial) {
		return MODEL_CONFIGS[partial];
	}
	
	// Check if it's a GLM/thinking model that needs higher token limit
	const isThinkingModel = lowerName.includes('glm') || 
		lowerName.includes('deepseek') || 
		lowerName.includes('r1');
	
	// Fallback defaults (higher for thinking models)
	return {
		temperature: 0.2,
		maxTokens: isThinkingModel ? 1024 : 512,
		systemPromptStyle: 'instruct'
	};
}

/**
 * Format prompt for specific model style
 */
function formatPrompt(prompt: string, style: 'chat' | 'instruct' | 'plain'): { messages: any[], systemMessage?: string } {
	if (style === 'chat') {
		// Llama 3-style chat format
		return {
			messages: [
				{ role: 'system', content: 'You are a precise web automation planner. Generate step-by-step actions for web tasks.' },
				{ role: 'user', content: prompt }
			]
		};
	} else if (style === 'instruct') {
		// Instruction-following format (Qwen, Mistral, Phi)
		return {
			messages: [{ role: 'user', content: prompt }]
		};
	} else {
		// Plain format
		return {
			messages: [{ role: 'user', content: prompt }]
		};
	}
}

/**
 * Enhanced prompt for web automation planning
 */
export function createOptimizedPrompt(snapshot: any, task: string): string {
	return `You are a precise web automation planner. Analyze this page snapshot and generate a deterministic action plan.

RULES:
1. Output ONLY actions, no explanations
2. Output format is action lines. Use EXACTLY these patterns:
   - NAVIGATE:https://example.com/path
   - FIND:description->cssSelector
   - TYPE:cssSelector:text
   - CLICK:cssSelector
   - SELECT:cssSelector:value
   - WAIT:milliseconds
   Notes: For NAVIGATE, DO NOT write "url=" and DO NOT add extra fields.
3. Use stable selectors (id > aria-label > role > name > class)
4. For FIND, include selector hint: FIND:description->selector
5. Keep steps minimal and deterministic

ACTIONS:
- NAVIGATE:https://... - Navigate to an absolute URL (must include https://)
- FIND:description->selector - Find element (provide CSS selector after ->)
- TYPE:selector:text - Type text into element
- CLICK:selector - Click element
- SELECT:selector:value - Select dropdown option
- WAIT:milliseconds - Wait for specified time

SNAPSHOT (top 100 interactive elements):
${JSON.stringify(snapshot).slice(0, 6000)}

TASK: ${task}

OUTPUT (one action per line, no numbering):`;
}

/**
 * Get universal guidance that applies to all sites
 */
function getUniversalGuidance(url: string, task: string, recentActions: any[], siteApproach?: string): string {
	const lowerTask = task.toLowerCase();
	const lowerUrl = url.toLowerCase();
	
	// Count recent navigations
	const recentNavs = recentActions.filter(a => a.action === 'NAVIGATE').length;
	const lastActions = recentActions.slice(-3).map(a => a.action);
	const allRecentNavs = lastActions.every(a => a === 'NAVIGATE' || a === 'ERROR');
	
	// Build dynamic guidance based on context
	let guidance = '';
	
	// Include site approach if available
	if (siteApproach) {
		guidance += `📋 EXECUTION PLAN (from planning phase):
${siteApproach}

`;
	}
	
	// Check if we've already navigated
	const hasNavigated = recentActions.some(a => a.action === 'NAVIGATE' && a.ok !== false);
	
	if (hasNavigated) {
		guidance += `🚫 NAVIGATION IS NOW DISABLED
- You have already navigated to the planned page
- DO NOT output any more NAVIGATE actions - they will be blocked
- Work ONLY with elements visible on the CURRENT page
- If you don't see expected elements, use WAIT:1000 to let page load
- Focus on: FIND, TYPE, CLICK, SELECT actions only

`;
	}
	
	// Check if we just typed in a search box (common YouTube pattern)
	const recentType = recentActions.slice(-2).find(a => a.action === 'TYPE');
	if (recentType && url.includes('youtube.com') && !url.includes('/results')) {
		guidance += `⚠️ SEARCH BOX BEHAVIOR:
- You just typed in a search box
- You MUST click the search button (button with magnifying glass icon) OR press Enter
- DO NOT click the YouTube logo or any other navigation element
- The search button selector is usually: button#search-icon-legacy
- After clicking search, WAIT for results page to load (URL will change to /results)

`;
	}
	
	// If stuck in navigation loop, be very explicit
	if (recentNavs >= 2 || allRecentNavs) {
		guidance += `⚠️ STOP TRYING TO NAVIGATE!
- Navigation is disabled after the first page load
- The URLs you're generating DON'T EXIST (404 errors)
- Use WAIT:1000 if page is still loading
- Look for elements in the current snapshot
- If truly no form elements exist, the task may not be possible on this site

`;
	}
	
	// Universal SPA guidance
	guidance += `UNIVERSAL RULES:
1. After first NAVIGATE, NEVER navigate again - work with the current page only
2. If snapshot shows <100 elements, page may be broken or still loading → WAIT:1000
3. Look for: input fields, buttons, forms in the snapshot
4. If no relevant elements found after waiting, task may not be achievable

`;
	
	return guidance.trim();
}

/**
 * Next-action prompt for agent loop (one action per LLM call).
 * The model must return exactly ONE line: either DONE or an action line.
 */
export function createNextActionPrompt(params: {
	snapshot: any;
	task: string;
	recentSteps: Array<{ action: string; target?: string; value?: string; url?: string; ok?: boolean; error?: string }>;
	siteApproach?: string;
}): string {
	const { snapshot, task, recentSteps, siteApproach } = params;
	const history = recentSteps
		.slice(-10)
		.map((s, idx) => {
			const status = s.ok === false ? `ERROR:${s.error || 'unknown'}` : s.ok === true ? 'OK' : 'UNKNOWN';
			const detail = s.action === 'NAVIGATE' ? s.url : s.value || s.target || '';
			return `${idx + 1}. ${s.action} ${detail} => ${status}`;
		})
		.join('\n');

	// Get universal guidance that adapts to any site
	const currentUrl = snapshot.url || '';
	const guidance = getUniversalGuidance(currentUrl, task, recentSteps, siteApproach);
	
	// Add page readiness assessment
	const meta = snapshot.metadata || {};
	let pageAssessment = '';
	
	if (meta.totalInteractive === 0) {
		pageAssessment = '🚨 CRITICAL: Page is COMPLETELY EMPTY (0 elements)!\n' +
			'This site is likely blocking automation or the page failed to load.\n' +
			'OUTPUT: DONE (task cannot be completed on this site)\n\n';
	} else if (meta.totalInteractive < 50) {
		pageAssessment = '⚠️ PAGE MAY BE LOADING: Only ' + meta.totalInteractive + ' interactive elements found. Try WAIT:1000 once, then check if elements appear.\n';
	} else if (meta.inputCount === 0 && (task.toLowerCase().includes('search') || task.toLowerCase().includes('type') || task.toLowerCase().includes('fill'))) {
		pageAssessment = '⚠️ NO INPUT FIELDS FOUND: Page may be loading or this is wrong page. Try WAIT:1000 once. If still no inputs after waiting, output DONE.\n';
	}

	// Detect task type for completion guidance
	const lowerTask = task.toLowerCase();
	const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch'));
	const hasTypedSearch = recentSteps.some(s => s.action === 'TYPE' && s.ok === true);
	const hasClickedResult = recentSteps.some(s => s.action === 'CLICK' && s.ok === true && hasTypedSearch);
	
	let completionGuidance = '';
	if (isVideoPlayback) {
		if (!hasTypedSearch) {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: You must search for the video first. Do NOT output DONE yet.`;
		} else if (!hasClickedResult) {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: You typed the search query. Now you MUST click on the video from search results. Do NOT output DONE until you've clicked the video.`;
		} else {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: You've clicked on a result. If you see a video player in the snapshot, output DONE. Otherwise, try clicking on the video thumbnail/title.`;
		}
	}
	
	return `You are an autonomous web agent controlling a browser via actions.

GOAL: ${task}

CURRENT PAGE: ${snapshot.url || 'unknown'}
PAGE STATS: ${meta.totalInteractive || 0} interactive elements, ${meta.inputCount || 0} inputs, ${meta.buttonCount || 0} buttons
${pageAssessment}
${guidance}
${completionGuidance}

RULES (must follow):
- Output EXACTLY ONE LINE.
- If the goal is FULLY complete, output: DONE
- CRITICAL: "Play video X" means the video must be PLAYING (not just searched). Click on the video before saying DONE.
- CRITICAL: "Book/Search X" means submit the form/search, not just type values.
- Otherwise output ONE action line, using one of these forms:
  NAVIGATE:https://example.com/path
  FIND:description->cssSelector
  TYPE:cssSelector:text
  CLICK:cssSelector
  SELECT:cssSelector:value
  WAIT:milliseconds
- Use stable selectors (id > aria-label > role > name > class). Prefer selectors visible in the snapshot.
- Do NOT include explanations, numbering, JSON, or multiple lines.

RECENT ACTIONS (for context, newest last):
${history || '(none)'}

CURRENT SNAPSHOT (top interactive elements, may be truncated):
${JSON.stringify(snapshot).slice(0, 6500)}

Now choose the single best NEXT action (or DONE if goal is FULLY accomplished).`;
}

/**
 * Ask LLM for site-specific guidance before starting automation
 */
export async function planSiteApproach(task: string): Promise<{ startUrl: string; approach: string }> {
	const lowerTask = task.toLowerCase();
	
	// Detect task type for specialized instructions
	const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube'));
	const isSearch = lowerTask.includes('search');
	const isBooking = lowerTask.includes('book') || lowerTask.includes('flight') || lowerTask.includes('hotel');
	
	let taskSpecificGuidance = '';
	
	if (isVideoPlayback) {
		taskSpecificGuidance = `
SPECIAL INSTRUCTIONS FOR VIDEO PLAYBACK:
- Video playback tasks require CLICKING ON THE VIDEO TITLE/THUMBNAIL after search
- Steps must include: search → wait for results → CLICK on video → task complete when video player is visible/playing
- "Play video X" means: find it via search, THEN click on it to start playing
- DO NOT mark task as complete after just searching - the video must be clicked and opened
- Example completion: "Task complete when video player shows and video begins playing"
`;
	} else if (isSearch && !isVideoPlayback) {
		taskSpecificGuidance = `
SPECIAL INSTRUCTIONS FOR SEARCH TASKS:
- Search tasks are complete when search results are displayed
- Include: type query → press Enter or click search button → wait for results
- Task complete when results page loads
`;
	} else if (isBooking) {
		taskSpecificGuidance = `
SPECIAL INSTRUCTIONS FOR BOOKING/FORM TASKS:
- Booking forms often have multi-step flows
- Include all field interactions: from/to locations, dates, passenger counts
- Task complete when search results or booking confirmation is shown
`;
	}
	
	const prompt = `You are a web automation expert helping plan how to accomplish a user's task on a website.

USER'S TASK: ${task}
${taskSpecificGuidance}

Your job is to provide a clear, COMPLETE execution plan. Think step-by-step about:
1. Which website/URL should we start at?
2. What elements (search boxes, buttons, input fields) will we need to interact with?
3. What is the FULL sequence of actions to COMPLETE the task?
4. What text/values need to be entered?
5. What is the FINAL action that completes the goal?
6. How do we know when the task is FULLY complete?

Format your response EXACTLY as follows:

START_URL: [full URL with https://]
APPROACH:
- Navigate to [URL] (the main page with the form/search)
- Wait 1 second for page to load (if needed)
- Find and click on [specific element description, e.g., "Search box" or "input field"]
- Type "[exact value to enter]" into that field
- Click [specific button, e.g., "Search button" or "magnifying glass icon"]
- Wait 1 second for results to load
- [CRITICAL: Include ALL remaining steps to complete the goal]
- Find and click on [specific result element, e.g., "first video result with title X"]
- Task complete when [SPECIFIC completion criteria, e.g., "video player is visible and playing"]

CRITICAL RULES:
- START_URL must be the HOMEPAGE or main domain (e.g., https://www.example.com/ or https://www.example.com)
- DO NOT guess sub-paths like /booking-domestic.jsp or /flights/search - these often don't exist
- Modern websites have booking/search forms directly on the homepage
- Be specific about field names, placeholders, button text you expect to see
- Include ALL steps needed to FULLY complete the task - don't stop halfway
- For "play video" tasks: must include clicking on the video after searching
- For "book" tasks: must include all form fields and submission
- The automation will ONLY navigate ONCE to your START_URL, then work with that page only
- Completion criteria must describe the FINAL state, not an intermediate step

Example for "Play 'The Winning Speech' on YouTube":
START_URL: https://www.youtube.com/
APPROACH:
- Navigate to https://www.youtube.com/ (homepage with search bar)
- Wait 1 second for page to load
- Find and click on "Search" box or the magnifying glass icon in the top right corner of the homepage
- Type "The Winning Speech" into the search box
- Press Enter or click the Search button next to the search box
- Wait 1 second for search results to load
- Click on the video titled "The Winning Speech" from the search results (it should be the first result)
- Task complete when the video starts playing (video player is visible with play controls)

Example for "Search flights from Delhi to Mumbai on Indigo":
START_URL: https://www.goindigo.in/
APPROACH:
- Navigate to https://www.goindigo.in/ (homepage has booking widget)
- Wait 1 second for booking form to load
- Find departure city field (placeholder "From" or "Origin")
- Type "Delhi" and select from dropdown
- Find arrival city field (placeholder "To" or "Destination")  
- Type "Mumbai" and select from dropdown
- Click "Search Flights" button
- Wait 1 second for results to load
- Task complete when flight list is visible with prices and times

Now provide the COMPLETE plan for: ${task}`;

	try {
		const response = await planWithLLM(prompt);
		
		// Parse response
		const urlMatch = response.match(/START_URL:\s*(https?:\/\/[^\s\n]+)/i);
		const approachMatch = response.match(/APPROACH:\s*([\s\S]+)/i);
		
		const startUrl = urlMatch?.[1]?.trim() || '';
		const approach = approachMatch?.[1]?.trim() || response;
		
		return { startUrl, approach };
	} catch (e) {
		console.error('Failed to get site approach from LLM:', e);
		return { startUrl: '', approach: '' };
	}
}

/**
 * Optimize snapshot for token efficiency (60% reduction)
 */
export function optimizeSnapshot(snapshot: any): any {
	if (!snapshot || !snapshot.elements) return snapshot;
	
	const optimized = {
		url: snapshot.url,
		title: snapshot.title,
		metadata: snapshot.metadata || {}, // Include page metadata (input count, button count, etc.)
		elements: snapshot.elements
			.slice(0, 100) // Limit to top 100 elements
			.map((el: any) => ({
				tag: el.tag,
				// Only include non-null attributes
				attrs: Object.fromEntries(
					Object.entries(el.attrs || {}).filter(([, v]) => v !== null && v !== '')
				),
				// Truncate text to first 50 chars
				text: (el.text || '').slice(0, 50),
				// Include position only if relevant
				...(el.rect && el.rect.w > 0 ? { rect: el.rect } : {}),
				// Include guess selector
				guess: el.guess
			}))
	};
	
	return optimized;
}

/**
 * Validate LLM response
 */
export function validateLLMResponse(response: string): { valid: boolean; steps: string[]; errors: string[] } {
	const lines = response.split('\n').map(l => l.trim()).filter(Boolean);
	const validActions = new Set(['NAVIGATE', 'FIND', 'TYPE', 'CLICK', 'SELECT', 'WAIT', 'UPLOAD']);
	const steps: string[] = [];
	const errors: string[] = [];
	
	for (const line of lines) {
		// Skip comments or explanations
		if (line.startsWith('//') || line.startsWith('#') || line.toLowerCase().startsWith('step')) {
			continue;
		}
		
		// Check if line matches ACTION:TARGET:VALUE format
		const match = line.match(/^(NAVIGATE|FIND|TYPE|CLICK|SELECT|WAIT|UPLOAD):/i);
		if (match) {
			const action = match[1].toUpperCase();
			if (validActions.has(action)) {
				steps.push(line);
			} else {
				errors.push(`Invalid action: ${action}`);
			}
		}
	}
	
	return {
		valid: steps.length > 0 && errors.length === 0,
		steps,
		errors
	};
}

/**
 * Clean up LLM output that includes thinking tags or special markers
 * Handles formats from GLM-4.6V-Flash, DeepSeek, and other reasoning models
 */
export function cleanLLMOutput(text: string): string {
	if (!text) return '';
	
	let cleaned = text;
	
	// Remove <think>...</think> blocks (GLM-4.6V-Flash reasoning)
	cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
	
	// Remove <|begin_of_box|> and <|end_of_box|> markers (GLM output format)
	cleaned = cleaned.replace(/<\|begin_of_box\|>/gi, '');
	cleaned = cleaned.replace(/<\|end_of_box\|>/gi, '');
	
	// Remove <reasoning>...</reasoning> blocks (some models)
	cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
	
	// Remove other common thinking/reasoning patterns
	cleaned = cleaned.replace(/<\|startofthink\|>[\s\S]*?<\|endofthink\|>/gi, '');
	cleaned = cleaned.replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi, '');
	
	// Trim whitespace
	cleaned = cleaned.trim();
	
	return cleaned;
}

/**
 * Model tier configuration for cascade
 */
interface ModelTier {
	name: string;
	endpoint: string;
	cost: number;
	description: string;
}

/**
 * Get model tiers for cascade (local → local larger → cloud fallback)
 */
function getModelTiers(baseUrl: string, cloudEndpoint?: string): ModelTier[] {
	const tiers: ModelTier[] = [
		{
			name: 'qwen2.5:14b',
			endpoint: baseUrl || 'http://localhost:11434',
			cost: 0,
			description: 'Local (fast, 14B params)'
		},
		{
			name: 'qwen2.5:32b',
			endpoint: baseUrl || 'http://localhost:11434',
			cost: 0,
			description: 'Local (slower, 32B params, higher quality)'
		}
	];

	// Add cloud fallback if configured
	if (cloudEndpoint) {
		tiers.push({
			name: 'gpt-4o-mini',
			endpoint: cloudEndpoint,
			cost: 0.0001,
			description: 'Cloud (OpenAI, ~$0.0001/req)'
		});
	}

	return tiers;
}

/**
 * Plan with model cascade (try progressively larger models on failure)
 */
export async function planWithCascade(
	prompt: string,
	failureCount: number,
	baseUrl: string,
	apiKey?: string,
	cloudEndpoint?: string
): Promise<{ text: string; modelUsed: string }> {
	const tiers = getModelTiers(baseUrl, cloudEndpoint);
	const tierIndex = Math.min(failureCount, tiers.length - 1);
	const tier = tiers[tierIndex];

	console.log(`Model cascade: using tier ${tierIndex} (${tier.name}) after ${failureCount} failures`);

	try {
		const text = await planWithLLMInternal(prompt, tier.name, tier.endpoint, apiKey);
		return { text, modelUsed: tier.name };
	} catch (error) {
		// If at last tier, throw
		if (tierIndex === tiers.length - 1) {
			throw new Error(`All model tiers exhausted. Last error: ${error}`);
		}

		// Try next tier
		return planWithCascade(prompt, failureCount + 1, baseUrl, apiKey, cloudEndpoint);
	}
}

/**
 * Internal LLM call with specific model config
 */
async function planWithLLMInternal(
	prompt: string,
	modelName: string,
	endpoint: string,
	apiKey?: string
): Promise<string> {
	const modelConfig = getModelConfig(modelName);
	const promptFormat = formatPrompt(prompt, modelConfig.systemPromptStyle || 'instruct');

	const requestBody: any = {
		model: modelName,
		messages: promptFormat.messages,
		temperature: modelConfig.temperature,
		max_tokens: modelConfig.maxTokens
	};

	if (modelConfig.stopSequences) {
		requestBody.stop = modelConfig.stopSequences;
	}

	const res = await fetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
		},
		body: JSON.stringify(requestBody),
	});

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`LLM error ${res.status}: ${errorText}`);
	}

	const data = await res.json();
	const rawContent = data.choices?.[0]?.message?.content || '';
	
	// Clean up GLM-style output (removes <think>...</think>, <|begin_of_box|>, etc.)
	const content = cleanLLMOutput(rawContent);

	// Validate response
	const validation = validateLLMResponse(content);
	if (!validation.valid && validation.errors.length > 0) {
		console.warn('LLM response validation errors:', validation.errors);
	}

	return content;
}

/**
 * Enhanced LLM planning with model-specific optimization
 */
export async function planWithLLM(prompt: string): Promise<string> {
	const cfg = await loadLlmConfig();
	if (cfg.mode !== 'llm' || !cfg.baseUrl) throw new Error('LLM not configured');
	
	const modelName = cfg.model || 'llama-3.3-70b-instruct';
	return planWithLLMInternal(prompt, modelName, cfg.baseUrl, cfg.apiKey);
}



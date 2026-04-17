import { loadLlmConfig } from './storage';
import { conversation } from './conversation';
import { loadUserProfile, type UserProfile } from './userProfile';

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
		const cfg = MODEL_CONFIGS[partial];
		if (cfg) return cfg;
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
/**
 * Normalize conversational task text into an imperative command.
 * e.g. "can you send the mail" → "send the mail"
 */
export function normalizeTaskText(task: string): string {
	// Strip leading politeness phrases / question prefixes
	const stripped = task
		.replace(/^(can\s+you\s+|could\s+you\s+|please\s+|would\s+you\s+|i\s+want\s+(you\s+to\s+)?|i\s+need\s+(you\s+to\s+)?|help\s+me\s+|could\s+you\s+please\s+)/i, '')
		.trim();
	// Capitalize first letter for cleaner display
	return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export function createOptimizedPrompt(snapshot: any, task: string): string {
	// Normalize the task from conversational to imperative form
	const normalizedTask = normalizeTaskText(task);

	const isNavigationOnly = /^\s*(open|go to|navigate to|visit|launch|show)\s+/i.test(normalizedTask);
	const navWarning = isNavigationOnly ?
		`CRITICAL: The user ONLY asked to open the site.
- If the URL satisfies the request, output DONE.
- Do NOT output interaction steps (TYPE, CLICK, SEARCH) unless explicitly asked.
- Do NOT invent parameters (e.g. do not type "Delhi" if user didn't say it).` : '';

	// Extra guidance for email send tasks
	const lowerTask = normalizedTask.toLowerCase();
	const emailSendHint = (lowerTask.includes('send') && (lowerTask.includes('mail') || lowerTask.includes('email') || lowerTask.includes('message') || lowerTask.includes('button'))) ?
		`IMPORTANT: This is an email send task. Look for a "Send" button in the snapshot (e.g. div[aria-label="Send"], .aoO, [data-tooltip="Send"]). Output a single CLICK action for that element.` : '';

	return `You are a precise web automation planner. Analyze this page snapshot and generate a deterministic action plan.

RULES:
1. Output ONLY actions, no explanations
2. Output format is action lines. Use EXACTLY these patterns:
   - NAVIGATE:https://example.com/path
   - FIND:description->cssSelector
   - TYPE:cssSelector:text
   - PRESS_ENTER:cssSelector
   - CLICK:cssSelector
   - SELECT:cssSelector:value
   - WAIT:milliseconds
   Notes: For NAVIGATE, DO NOT write "url=" and DO NOT add extra fields.
3. Use stable selectors (id > aria-label > role > name > class). **CRITICAL: Use the "guess" property from the element in the snapshot as your CSS selector whenever possible.**
4. For FIND, include selector hint: FIND:description->selector
5. Keep steps minimal and deterministic
${navWarning}
${emailSendHint}

ACTIONS:
- NAVIGATE:https://... - Navigate to an absolute URL (must include https://)
- FIND:description->selector - Find element (provide CSS selector after ->)
- TYPE:selector:text - Type text into element
- PRESS_ENTER:selector - Press Enter on an input field or submit its nearest form
- CLICK:selector - Click element
- SELECT:selector:value - Select dropdown option
- WAIT:milliseconds - Wait for specified time

SNAPSHOT (top 100 interactive elements):
${JSON.stringify(snapshot).slice(0, 7000)}

TASK: ${normalizedTask}

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
- You MUST click the search button (button with magnifying glass icon) OR use PRESS_ENTER action on the search box
- DO NOT click the YouTube logo or any other navigation element
- The search button selector is usually: button#search-icon-legacy
- After clicking search, WAIT for results page to load (URL will change to /results)

`;
	}

	// Detect visible autocomplete dropdown suggestions
	const justTyped = recentActions.slice(-2).some(a => a.action === 'TYPE' && a.ok === true);
	if (justTyped) {
		guidance += `🔽 AUTOCOMPLETE/DROPDOWN AWARENESS:
- You just typed into a field. Check if dropdown suggestions appeared.
- If you see elements with role="option" or li items in a listbox, you MUST CLICK the correct suggestion.
- Do NOT type again into the same field - click the matching dropdown suggestion instead.
- The field is NOT properly filled until you click a suggestion from the dropdown.
- Look for selectors like: [role="option"], li[role="option"], [data-value], ul[role="listbox"] li

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

	// Detect if this is a simple navigation/open task (no further interaction needed)
	const isNavigationOnlyTask = /^\s*(open|go to|navigate to|visit|launch|show)\s+/i.test(task);

	if (meta.totalInteractive === 0) {
		pageAssessment = '⚠️ Page appears EMPTY (0 elements). It is likely still loading after navigation.\n' +
			'Output WAIT:2000 to wait for the page to finish loading. Do NOT output DONE yet.\n\n';
	} else if (meta.totalInteractive < 15) {
		pageAssessment = '⚠️ PAGE MAY BE LOADING: Only ' + meta.totalInteractive + ' interactive elements found. Output WAIT:2000 to wait for content to load. Do NOT output DONE yet.\n';
	} else if (isNavigationOnlyTask) {
		// For simple "open X" tasks, if the page has loaded (>= 15 elements), the task is done.
		pageAssessment = '✅ Page has loaded with ' + meta.totalInteractive + ' interactive elements. For a navigation/open task, this means the task is COMPLETE. Output DONE.\n';
	} else if (meta.inputCount === 0 && (task.toLowerCase().includes('search') || task.toLowerCase().includes('type') || task.toLowerCase().includes('fill'))) {
		pageAssessment = '⚠️ NO INPUT FIELDS FOUND: Page may still be loading. Output WAIT:2000 to wait. Do NOT output DONE until you have actually attempted the task.\n';
	}

	// Detect task type for completion guidance
	const lowerTask = task.toLowerCase();
	const isVideoPlayback = lowerTask.includes('play') && (lowerTask.includes('video') || lowerTask.includes('youtube') || lowerTask.includes('watch'));
	const isSearch = lowerTask.includes('search') && !isVideoPlayback;
	const hasTypedSearch = recentSteps.some(s => s.action === 'TYPE' && s.ok === true);
	const hasClickedSearchButton = recentSteps.some(s => s.action === 'CLICK' && s.ok === true && hasTypedSearch);
	const isOnResultsPage = (snapshot.url || '').includes('/results') || (snapshot.url || '').includes('/search');

	let completionGuidance = '';

	// Search task guidance
	if (isSearch) {
		if (!hasTypedSearch) {
			completionGuidance = `\n🔍 SEARCH TASK: First, find and type in the search box. Do NOT output DONE yet.`;
		} else if (!hasClickedSearchButton) {
			completionGuidance = `\n🔍 SEARCH TASK: You typed the search query. Now you MUST click the search button (magnifying glass icon) or use PRESS_ENTER on the search box.
CRITICAL: The task is NOT complete until you submit the search and results are displayed.
Do NOT output DONE yet - you must submit the search!`;
		} else if (!isOnResultsPage) {
			completionGuidance = `\n🔍 SEARCH TASK: You clicked the search button. Wait for results page to load (URL should change to /results or /search).`;
		} else {
			completionGuidance = `\n🔍 SEARCH TASK: Results page loaded. Task is complete. Output DONE.`;
		}
	}

	// Video playback task guidance (higher priority than search)
	if (isVideoPlayback) {
		if (!hasTypedSearch) {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: You must search for the video first. Do NOT output DONE yet.`;
		} else if (!hasClickedSearchButton) {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: You typed the search query. Now you MUST click the search button to get results. Do NOT output DONE yet.`;
		} else if (!isOnResultsPage) {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: Wait for search results page to load.`;
		} else {
			completionGuidance = `\n🎬 VIDEO PLAYBACK TASK: Search results loaded. Now CLICK on the video thumbnail/title to start playing. Do NOT output DONE until video player is visible.`;
		}
	}

	// Info query guidance
	const isInfoQuery = /\b(what\s+is|what's|how\s+much|price|cost|weather|time\s+in|cheapest|best|check)\b/.test(lowerTask);
	if (isInfoQuery && !hasTypedSearch) {
		completionGuidance += `\n📝 INFO QUERY: You MUST type your search query into the search box first. Do NOT output DONE until search results are visible on the page.`;
	} else if (isInfoQuery && hasTypedSearch && !isOnResultsPage) {
		completionGuidance += `\n📝 INFO QUERY: You typed the query. Now submit the search by clicking the search button or pressing Enter. Wait for results.`;
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
- CRITICAL: "Search for X" means:
  1. Type query in search box
  2. Click search button (magnifying glass icon)
  3. Wait for results page to load
  4. Only THEN output DONE
- CRITICAL: "Play video X" means the video must be PLAYING (not just searched). Click on the video before saying DONE.
- CRITICAL: "Book/Submit X" means submit the form, not just type values.
- CRITICAL: AUTOCOMPLETE/DROPDOWN FIELDS (e.g., city pickers, search suggestions):
  1. After typing into an autocomplete field, you MUST output WAIT:1000 to let dropdown suggestions appear
  2. Then CLICK on the correct suggestion from the dropdown list (look for li, div, or option elements with matching text)
  3. Do NOT consider a field "filled" until the dropdown suggestion has been clicked
  4. If the field already has text (e.g., auto-detected location), clear it first by clicking the field, then typing the new value
- CRITICAL: For flight/travel search forms, ALL these steps are needed before saying DONE:
  1. Fill departure city (type + select from dropdown)
  2. Fill destination city (type + select from dropdown)
  3. Set correct date(s)
  4. Click Search button
  5. Wait for results to load
  6. Only DONE when prices/results are visible
- Otherwise output ONE action line, using one of these forms:
  NAVIGATE:https://example.com/path
  FIND:description->cssSelector
  TYPE:cssSelector:text
  PRESS_ENTER:cssSelector
  CLICK:cssSelector
  SELECT:cssSelector:value
  WAIT:milliseconds
- Use stable selectors (id > aria-label > role > name > class). **CRITICAL: Use the "guess" property from the element in the snapshot as your CSS selector whenever possible.**
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
	const isInfoQuery = lowerTask.match(/\b(what\s+is|what's|how\s+much|price\s+of|cost\s+of|weather|cheapest|best|find\s+me|check|compare)\b/) !== null;

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
	} else if (isInfoQuery || isBooking) {
		taskSpecificGuidance = `
SPECIAL INSTRUCTIONS FOR INFORMATION/RESEARCH QUERIES:
- The user is asking a QUESTION that needs web research
- You MUST choose an appropriate website to find the answer
- For flight prices: use Google Flights (https://www.google.com/travel/flights) or a travel site
- For product prices: use the relevant store (Amazon, Flipkart, etc.) or Google Shopping
- For weather: use Google (https://www.google.com/)
- For general questions: use Google Search (https://www.google.com/)
- Steps: navigate to the right site → search/fill form → wait for results → task complete when information is visible
- Task complete when the ANSWER/DATA is visible on screen (prices shown, results loaded, etc.)
- For booking/flight forms: include all field interactions (from/to, dates, passengers)
- Use Google as a fallback if no specific site is obvious
`;
	} else if (isSearch && !isVideoPlayback) {
		taskSpecificGuidance = `
SPECIAL INSTRUCTIONS FOR SEARCH TASKS:
- Search tasks are complete when search results are displayed
- Include: type query → press Enter or click search button → wait for results
- Task complete when results page loads
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
- Press Enter using PRESS_ENTER OR click the Search button next to the search box
- Wait 1 second for search results to load
- Click on the video titled "The Winning Speech" from the search results (it should be the first result)
- Task complete when the video starts playing (video player is visible with play controls)

Example for "What is the flight price from Delhi to Hyderabad today":
START_URL: https://www.google.com/travel/flights
APPROACH:
- Navigate to https://www.google.com/travel/flights (Google Flights homepage)
- Wait 1 second for page to load
- Click on the departure city field (labeled "Where from?" - it may already have an auto-detected city)
- Clear any existing text, then type "Delhi"
- Wait 1 second for autocomplete dropdown suggestions to appear
- Click on "Delhi" or "New Delhi (DEL)" from the dropdown list
- Click on the destination city field (labeled "Where to?")
- Type "Hyderabad"
- Wait 1 second for autocomplete dropdown suggestions to appear
- Click on "Hyderabad (HYD)" from the dropdown list
- Click the departure date field to open the calendar
- Select the correct date (today or tomorrow as specified)
- Click "Done" in the calendar if needed
- Click "Search" button
- Wait 2 seconds for flight results to load
- Task complete when flight prices and times are visible on the results page

Example for "How much does iPhone 16 cost on Amazon":
START_URL: https://www.amazon.com/
APPROACH:
- Navigate to https://www.amazon.com/ (homepage with search bar)
- Wait 1 second for page to load
- Find the search box (id="twotabsearchtextbox" or similar)
- Type "iPhone 16" into the search box
- Use PRESS_ENTER on the search box OR click the search button
- Wait 1 second for search results to load
- Task complete when product listings with prices are visible

IMPORTANT FOR ALL PLANS:
- Autocomplete/dropdown fields (city pickers, address fields) need: TYPE → WAIT for dropdown → CLICK the suggestion
- Do NOT assume typing alone fills the field - dropdowns MUST be selected by clicking
- If a field already has text (auto-detected location), click it first to focus, then type the new value

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
		throw e;
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
	const validActions = new Set(['NAVIGATE', 'FIND', 'TYPE', 'CLICK', 'SELECT', 'WAIT', 'UPLOAD', 'PRESS_ENTER']);
	const steps: string[] = [];
	const errors: string[] = [];

	for (const line of lines) {
		// Skip comments or explanations
		if (line.startsWith('//') || line.startsWith('#') || line.toLowerCase().startsWith('step')) {
			continue;
		}

		// Check if line matches ACTION:TARGET:VALUE format
		const match = line.match(/^(NAVIGATE|FIND|TYPE|CLICK|SELECT|WAIT|UPLOAD|PRESS_ENTER):/i);
		if (match && match[1]) {
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
			endpoint: baseUrl || 'https://api.together.ai/v1',
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
	if (!tier) throw new Error(`Model tier not found for index ${tierIndex}`);

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

	const normalizedEndpoint = endpoint.replace(/\/$/, '');
	const chatUrl = normalizedEndpoint.endsWith('/v1')
		? `${normalizedEndpoint}/chat/completions`
		: `${normalizedEndpoint}/v1/chat/completions`;

	const res = await fetch(chatUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
		},
		body: JSON.stringify(requestBody),
	});

	if (!res.ok) {
		const errorText = await res.text();

		// Check for HTML error response (common with 404/500 from web servers)
		if (errorText.trim().startsWith('<!DOCTYPE html>') || errorText.includes('<html>')) {
			let hint = 'The API URL may be incorrect.';
			if (res.status === 404) {
				hint = 'The model name may be invalid or deprecated, or the API URL is wrong.';
			}
			if (chatUrl.includes('together.xyz')) {
				hint += ' Try changing "api.together.xyz" to "api.together.ai".';
			}
			throw new Error(
				`LLM API returned HTML (${res.status}): ${hint} URL: ${chatUrl}`
			);
		}

		throw new Error(`LLM error ${res.status}: ${errorText.substring(0, 200)}`);
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

/**
 * Simple chat with the LLM
 */
export async function chatWithLLM(userInput: string, context?: string): Promise<string> {
	const prompt = `You are ARIA, a helpful web automation assistant.
The user's goal is general conversation, not automation. Respond in a friendly, helpful, and concise manner.
Do NOT generate any automation actions or JSON. Just reply with text.

CONTEXT:
${context || 'No previous context'}

USER: ${userInput}

ARIA:`;

	return planWithLLM(prompt);
}

/**
 * Conversational Mode - Enhanced prompt with conversation context
 */
export async function createConversationalPrompt(params: {
	snapshot: any;
	task: string;
	recentSteps: Array<{ action: string; target?: string; value?: string; url?: string; ok?: boolean; error?: string }>;
	conversationContext?: string;
	userProfile?: UserProfile;
}): Promise<string> {
	const { snapshot, task, recentSteps, conversationContext, userProfile } = params;

	// Build conversation context
	let contextSection = '';
	if (conversationContext) {
		contextSection = `\nRECENT CONVERSATION:\n${conversationContext}\n`;
	}

	// Build user profile context
	let profileSection = '';
	if (userProfile) {
		const profile = userProfile;
		profileSection = `\nUSER PROFILE (for form filling):
Name: ${profile.personal.fullName || `${profile.personal.firstName} ${profile.personal.lastName}`.trim()}
Email: ${profile.personal.email || '(not provided)'}
Phone: ${profile.personal.phone || '(not provided)'}
Location: ${profile.personal.location || `${profile.address.city}, ${profile.address.state}`.trim() || '(not provided)'}
`;
	}

	// Build history
	const history = recentSteps
		.slice(-10)
		.map((s, idx) => {
			const status = s.ok === false ? `ERROR:${s.error || 'unknown'}` : s.ok === true ? 'OK' : 'UNKNOWN';
			const detail = s.action === 'NAVIGATE' ? s.url : s.value || s.target || '';
			return `${idx + 1}. ${s.action} ${detail} => ${status}`;
		})
		.join('\n');

	const currentUrl = snapshot.url || '';
	const meta = snapshot.metadata || {};

	return `You are ARIA, a helpful personal AI assistant that helps users complete web tasks.

USER'S GOAL: ${task}
${contextSection}${profileSection}
CURRENT PAGE: ${currentUrl}
PAGE STATS: ${meta.totalInteractive || 0} interactive elements, ${meta.inputCount || 0} inputs, ${meta.buttonCount || 0} buttons

CONVERSATIONAL GUIDELINES:
1. If you need information from the user (missing form data, unclear instructions), output: QUESTION: <your question>
2. If an action requires confirmation (purchases, deletions, submissions), output: CONFIRM: <action description>
3. If you can proceed with the next step, output ONE action line
4. If the goal is FULLY complete, output: DONE
5. Be conversational - explain what you're doing in THOUGHT: lines

RESPONSE FORMAT:
THOUGHT: <brief explanation of what you're thinking>
[QUESTION: <question> OR CONFIRM: <action> OR ACTION: <action line> OR DONE]

ACTION TYPES:
- NAVIGATE:https://example.com/path
- FIND:description->cssSelector
- TYPE:cssSelector:text
- CLICK:cssSelector
- SELECT:cssSelector:value
- WAIT:milliseconds

EXAMPLES:
Example 1 (Need information):
THOUGHT: I found a form but email field is missing from user profile
QUESTION: What email address should I use for this form?

Example 2 (Need confirmation):
THOUGHT: Ready to submit purchase for $25.99
CONFIRM: Purchase wireless mouse for $25.99 from Amazon

Example 3 (Can proceed):
THOUGHT: I'll search for the video by typing in the search box
ACTION: TYPE:input#search:funny cat videos

Example 4 (Task complete):
THOUGHT: Video is now playing, goal accomplished
DONE

RECENT ACTIONS (for context):
${history || '(none)'}

CURRENT SNAPSHOT (top interactive elements):
${JSON.stringify(snapshot).slice(0, 6500)}

Now decide: Do you need to ask the user something, confirm an action, take the next step, or are you done?`;
}

/**
 * Parse conversational LLM response
 */
export interface ConversationalResponse {
	type: 'question' | 'confirm' | 'action' | 'done';
	thought?: string;
	content?: string; // Question text, confirmation text, or action line
	data?: any;
}

export function parseConversationalResponse(response: string): ConversationalResponse {
	const lines = response.trim().split('\n').map(l => l.trim()).filter(Boolean);

	let thought: string | undefined;
	let type: 'question' | 'confirm' | 'action' | 'done' = 'action';
	let content: string | undefined;

	for (const line of lines) {
		if (line.startsWith('THOUGHT:')) {
			thought = line.replace('THOUGHT:', '').trim();
		} else if (line.startsWith('QUESTION:')) {
			type = 'question';
			content = line.replace('QUESTION:', '').trim();
		} else if (line.startsWith('CONFIRM:')) {
			type = 'confirm';
			content = line.replace('CONFIRM:', '').trim();
		} else if (line === 'DONE') {
			type = 'done';
		} else if (line.startsWith('ACTION:')) {
			type = 'action';
			content = line.replace('ACTION:', '').trim();
		} else if (line.match(/^(NAVIGATE|FIND|TYPE|CLICK|SELECT|WAIT):/)) {
			// Direct action line without ACTION: prefix
			type = 'action';
			content = line;
		}
	}

	return {
		type,
		...(thought ? { thought } : {}),
		...(content ? { content } : {})
	};
}

/**
 * Get conversational context from recent messages
 */
export function getConversationalContext(maxMessages: number = 5): string {
	return conversation.getConversationContext(maxMessages);
}

/**
 * Create prompt for detecting missing form information
 */
export async function createFormAnalysisPrompt(params: {
	formFields: Array<{ label: string; type: string; required: boolean }>;
	userProfile?: UserProfile;
}): Promise<string> {
	const { formFields, userProfile } = params;

	let profileData = '(no profile data)';
	if (userProfile) {
		const p = userProfile;
		profileData = `Name: ${p.personal.fullName}
Email: ${p.personal.email}
Phone: ${p.personal.phone}
Address: ${p.address.street}, ${p.address.city}, ${p.address.state} ${p.address.zipCode}`;
	}

	const fieldsText = formFields
		.map(f => `- ${f.label} (${f.type})${f.required ? ' [REQUIRED]' : ''}`)
		.join('\n');

	return `Analyze which form fields can be auto-filled from user profile and which need user input.

FORM FIELDS:
${fieldsText}

USER PROFILE:
${profileData}

For each REQUIRED field that cannot be auto-filled from the profile, output:
MISSING: <field label>

If all required fields can be auto-filled, output:
ALL_AVAILABLE

Response:`;
}



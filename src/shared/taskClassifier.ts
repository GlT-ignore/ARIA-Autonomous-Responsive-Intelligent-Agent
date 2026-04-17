/**
 * Task Classifier
 * 
 * Analyzes user input to determine task type and intent
 */

import { planWithLLM, normalizeTaskText } from './llmClient';

export type TaskType = 'form_filling' | 'summarization' | 'data_extraction' | 'navigation' | 'chat' | 'general_automation' | 'information_query';

export interface ClassifiedTask {
    type: TaskType;
    originalInput: string;
    extractedIntent: string;
    parameters?: Record<string, any>;
}

/**
 * Classify user task input to determine what type of workflow to use
 */
export async function classifyTask(userInput: string): Promise<ClassifiedTask> {
    const prompt = `You are a task classifier for a web automation system. Analyze the user's input and determine what type of task they want to perform.

USER INPUT: "${userInput}"

TASK TYPES:
1. FORM_FILLING - User wants to fill out a form (e.g., "fill the form", "complete this application", "fill out the contact form")
2. SUMMARIZATION - User wants a summary of the current page content (e.g., "summarize this page", "what is this about", "give me a summary")
3. DATA_EXTRACTION - User wants to extract specific data from the current page (e.g., "extract all prices", "get all product names", "list all emails")
4. NAVIGATION - User wants to simply navigate or open a site (e.g., "go to YouTube", "open Google", "visit Amazon")
5. CHAT - User is greeting, asking a general question, or engaging in small talk (e.g., "hi", "how are you", "who are you", "tell me a joke", "what is the capital of France", "write a python script")
6. INFORMATION_QUERY - User is asking a question that requires REAL-TIME web research or specific data not in your training set. Examples: "flight price from Delhi to Hyderabad", "cheapest hotel in Mumbai", "weather in London", "iPhone 16 price", "search for dog videos on YouTube", "who won the game last night"
7. GENERAL_AUTOMATION - Any other automation task (clicking, typing specific things, scrolling, booking, purchasing, sending email, filling forms, etc.)
   Examples: "send the mail", "click send button", "send the composed email", "submit the form"

IMPORTANT DISTINCTION:
- INFORMATION_QUERY = user is ASKING A QUESTION that needs REAL-TIME web research (current events, prices, weather)
- CHAT = user is asking about STATIC KNOWLEDGE, coding, or general conversation (history, science, definitions, "how to" guides)
- DATA_EXTRACTION = user wants to extract data from the CURRENT page they are already on
- NAVIGATION = user just wants to OPEN a site, not find specific information

Respond with ONLY the task type and extracted intent in this exact format:
TASK_TYPE: [one of: FORM_FILLING, SUMMARIZATION, DATA_EXTRACTION, NAVIGATION, CHAT, INFORMATION_QUERY, GENERAL_AUTOMATION]
INTENT: [one sentence describing what the user wants to do]
PARAMETERS: [optional JSON object with extracted parameters like {field: "price", target: "all products"}]

Example 0:
TASK_TYPE: GENERAL_AUTOMATION
INTENT: Click the Send button to send the composed email
PARAMETERS: {}

Example 1:
TASK_TYPE: FORM_FILLING
INTENT: Fill out the contact form on this page
PARAMETERS: {}

Example 2:
TASK_TYPE: INFORMATION_QUERY
INTENT: Find flight prices from Delhi to Hyderabad
PARAMETERS: {"query": "flight price Delhi to Hyderabad", "site": "google.com"}

Example 3:
TASK_TYPE: CHAT
INTENT: User is greeting the assistant
PARAMETERS: {}

Example 4:
TASK_TYPE: INFORMATION_QUERY
INTENT: Search for dog videos on YouTube
PARAMETERS: {"query": "dog videos", "site": "youtube.com"}

Example 5:
TASK_TYPE: NAVIGATION
INTENT: Open YouTube homepage
PARAMETERS: {}

Now classify: "${normalizeTaskText(userInput)}"`;

    try {
        const response = await planWithLLM(prompt);

        // Parse response
        const typeMatch = response.match(/TASK_TYPE:\s*(FORM_FILLING|SUMMARIZATION|DATA_EXTRACTION|NAVIGATION|CHAT|INFORMATION_QUERY|GENERAL_AUTOMATION)/i);
        const intentMatch = response.match(/INTENT:\s*(.+?)(?:\n|$)/i);
        const paramsMatch = response.match(/PARAMETERS:\s*(\{[^}]*\})/i);

        const taskTypeMap: Record<string, TaskType> = {
            'FORM_FILLING': 'form_filling',
            'SUMMARIZATION': 'summarization',
            'DATA_EXTRACTION': 'data_extraction',
            'NAVIGATION': 'navigation',
            'CHAT': 'chat',
            'INFORMATION_QUERY': 'information_query',
            'GENERAL_AUTOMATION': 'general_automation'
        };

        const rawType = typeMatch?.[1] || 'GENERAL_AUTOMATION';
        const type = taskTypeMap[rawType.toUpperCase()] || 'general_automation';
        const intent = intentMatch?.[1]?.trim() || userInput || '';

        let parameters: Record<string, any> = {};
        if (paramsMatch) {
            try {
                parameters = JSON.parse(paramsMatch[1] || '{}');
            } catch {
                parameters = {};
            }
        }

        return {
            type: type as TaskType,
            originalInput: userInput,
            extractedIntent: intent,
            parameters
        };
    } catch (error) {
        console.error('Task classification failed:', error);
        // Fallback to general automation
        return {
            type: 'general_automation',
            originalInput: userInput,
            extractedIntent: userInput,
            parameters: {}
        };
    }
}

/**
 * Quick heuristic-based classification (faster, no LLM call)
 */
export function quickClassifyTask(userInput: string): TaskType {
    const lower = userInput.toLowerCase();

    // Form filling keywords
    if (lower.match(/\b(fill|complete|submit|enter)\s+(the\s+)?(form|application|survey|questionnaire)/i)) {
        return 'form_filling';
    }

    // Summarization keywords
    if (lower.match(/\b(summarize|summary|explain|what\s+is\s+this|tldr|give\s+me\s+(a\s+)?summary)/i)) {
        return 'summarization';
    }

    // Data extraction keywords
    if (lower.match(/\b(extract|get|list|collect|scrape|find\s+all|show\s+all)\s+(all\s+)?(prices?|names?|emails?|links?|products?|data|items?)/i)) {
        return 'data_extraction';
    }

    // Information query keywords (questions that need web research - strictly limiting common "what is" to avoid chat capture)
    if (lower.match(/\b(price\s+of|cost\s+of|weather\s+in|flights?\s+(from|to|between|price)|cheapest|best|current\s+status|news\s+about)\b/i)) {
        return 'information_query';
    }

    // Search on a specific site (e.g., "search for X on YouTube")
    if (lower.match(/\b(search\s+for|search|find)\b.+\b(on|in|at)\s+\w+/i)) {
        return 'information_query';
    }

    // Navigation keywords (just opening a site, not searching for info)
    if (lower.match(/\b(go\s+to|open|navigate\s+to|visit)\b/i)) {
        return 'navigation';
    }

    // Default to general automation
    return 'general_automation';
}










/**
 * Task Classifier
 * 
 * Analyzes user input to determine task type and intent
 */

import { planWithLLM } from './llmClient';

export type TaskType = 'form_filling' | 'summarization' | 'data_extraction' | 'navigation' | 'general_automation';

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
2. SUMMARIZATION - User wants a summary of the page content (e.g., "summarize this page", "what is this about", "give me a summary")
3. DATA_EXTRACTION - User wants to extract specific data from the page (e.g., "extract all prices", "get all product names", "list all emails")
4. NAVIGATION - User wants to navigate or search (e.g., "go to YouTube", "search for cats", "open Google")
5. GENERAL_AUTOMATION - Any other automation task (clicking, typing specific things, scrolling, etc.)

Respond with ONLY the task type and extracted intent in this exact format:
TASK_TYPE: [one of: FORM_FILLING, SUMMARIZATION, DATA_EXTRACTION, NAVIGATION, GENERAL_AUTOMATION]
INTENT: [one sentence describing what the user wants to do]
PARAMETERS: [optional JSON object with extracted parameters like {field: "price", target: "all products"}]

Example 1:
TASK_TYPE: FORM_FILLING
INTENT: Fill out the contact form on this page
PARAMETERS: {}

Example 2:
TASK_TYPE: SUMMARIZATION
INTENT: Summarize the article content
PARAMETERS: {}

Example 3:
TASK_TYPE: DATA_EXTRACTION
INTENT: Extract all product prices from the page
PARAMETERS: {"target": "prices", "scope": "all products"}

Now classify: "${userInput}"`;

    try {
        const response = await planWithLLM(prompt);

        // Parse response
        const typeMatch = response.match(/TASK_TYPE:\s*(FORM_FILLING|SUMMARIZATION|DATA_EXTRACTION|NAVIGATION|GENERAL_AUTOMATION)/i);
        const intentMatch = response.match(/INTENT:\s*(.+?)(?:\n|$)/i);
        const paramsMatch = response.match(/PARAMETERS:\s*(\{[^}]*\})/i);

        const taskTypeMap: Record<string, TaskType> = {
            'FORM_FILLING': 'form_filling',
            'SUMMARIZATION': 'summarization',
            'DATA_EXTRACTION': 'data_extraction',
            'NAVIGATION': 'navigation',
            'GENERAL_AUTOMATION': 'general_automation'
        };

        const rawType = typeMatch?.[1] || 'GENERAL_AUTOMATION';
        const type = taskTypeMap[rawType] || 'general_automation';
        const intent = intentMatch?.[1]?.trim() || userInput;

        let parameters: Record<string, any> = {};
        if (paramsMatch) {
            try {
                parameters = JSON.parse(paramsMatch[1]);
            } catch {
                parameters = {};
            }
        }

        return {
            type,
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

    // Navigation keywords
    if (lower.match(/\b(go\s+to|open|navigate\s+to|visit|search\s+for)\b/i)) {
        return 'navigation';
    }

    // Default to general automation
    return 'general_automation';
}










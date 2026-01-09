/**
 * Summarization Workflow
 * 
 * Extracts page content and generates a concise summary using LLM
 */

import { planWithLLM } from '../shared/llmClient';
import type { BusRequest, BusResponse } from '../shared/types';

export interface PageContent {
    title: string;
    url: string;
    mainText: string;
    headings: string[];
    keyPoints: string[];
    wordCount: number;
}

export interface Summary {
    content: string;
    keyTakeaways: string[];
    timestamp: number;
    sourceUrl: string;
    sourceTitle: string;
}

/**
 * Send message to content script
 */
async function sendToActive(type: string, payload: any): Promise<BusResponse> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) throw new Error('No active tab');
    
    const req: BusRequest = { type, payload, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    const response = await chrome.tabs.sendMessage(tabs[0].id, req);
    return response as BusResponse;
}

/**
 * Extract page content for summarization
 */
export async function extractPageContent(): Promise<PageContent> {
    try {
        const response = await sendToActive('EXTRACT_CONTENT', {});
        
        if (response.success && response.data) {
            return response.data as PageContent;
        }
        
        throw new Error('Failed to extract content from page');
    } catch (error) {
        console.error('Content extraction failed:', error);
        
        // Fallback: try to get basic info from current tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        
        return {
            title: tab?.title || 'Unknown',
            url: tab?.url || '',
            mainText: '',
            headings: [],
            keyPoints: [],
            wordCount: 0
        };
    }
}

/**
 * Generate summary using LLM
 */
export async function summarizeWithLLM(content: PageContent): Promise<Summary> {
    const prompt = `You are a helpful assistant that summarizes web page content concisely and accurately.

PAGE TITLE: ${content.title}
PAGE URL: ${content.url}
WORD COUNT: ${content.wordCount}

HEADINGS:
${content.headings.slice(0, 10).join('\n')}

MAIN CONTENT (truncated to first 4000 chars):
${content.mainText.slice(0, 4000)}

Please provide:
1. A concise summary (2-3 paragraphs)
2. Key takeaways (3-5 bullet points)

Format your response as:
SUMMARY:
[Your summary here]

KEY_TAKEAWAYS:
- [Takeaway 1]
- [Takeaway 2]
- [Takeaway 3]`;

    try {
        const response = await planWithLLM(prompt);
        
        // Parse response
        const summaryMatch = response.match(/SUMMARY:\s*([\s\S]+?)(?=KEY_TAKEAWAYS:|$)/i);
        const takeawaysMatch = response.match(/KEY_TAKEAWAYS:\s*([\s\S]+)/i);
        
        const summaryText = summaryMatch?.[1]?.trim() || response;
        const takeawaysText = takeawaysMatch?.[1]?.trim() || '';
        
        // Extract bullet points
        const keyTakeaways = takeawaysText
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.trim().replace(/^-\s*/, ''))
            .filter(Boolean);
        
        return {
            content: summaryText,
            keyTakeaways,
            timestamp: Date.now(),
            sourceUrl: content.url,
            sourceTitle: content.title
        };
    } catch (error) {
        console.error('Summarization failed:', error);
        
        return {
            content: `Failed to generate summary: ${String(error)}`,
            keyTakeaways: [],
            timestamp: Date.now(),
            sourceUrl: content.url,
            sourceTitle: content.title
        };
    }
}

/**
 * Generate HTML for summary display
 */
export function generateSummaryHTML(summary: Summary): string {
    const takeawaysHTML = summary.keyTakeaways.length > 0 ? `
        <div style="margin-top:16px;">
            <h4 style="margin:0 0 8px 0; font-size:14px; color:#374151;">Key Takeaways:</h4>
            <ul style="margin:0; padding-left:20px; color:#4b5563; font-size:13px;">
                ${summary.keyTakeaways.map(item => `<li style="margin-bottom:4px;">${item}</li>`).join('')}
            </ul>
        </div>
    ` : '';
    
    const date = new Date(summary.timestamp).toLocaleString();
    
    return `
        <div id="summary-result" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px;">
                <h3 style="margin:0; font-size:16px; color:#111827;">📄 Summary</h3>
                <button id="copy-summary" style="background:#fff; border:1px solid #d1d5db; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:12px;">
                    Copy
                </button>
            </div>
            
            <div style="font-size:13px; color:#6b7280; margin-bottom:8px;">
                <strong>${summary.sourceTitle}</strong>
            </div>
            
            <div style="color:#374151; font-size:14px; line-height:1.6; white-space:pre-wrap;">
                ${summary.content}
            </div>
            
            ${takeawaysHTML}
            
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:11px; color:#9ca3af;">
                Generated on ${date}
            </div>
        </div>
    `;
}

/**
 * Execute full summarization workflow
 */
export async function executeSummarizationWorkflow(log: (msg: any) => void): Promise<Summary> {
    log({ status: 'Extracting page content...' });
    const content = await extractPageContent();
    
    log({ 
        status: 'Content extracted', 
        title: content.title,
        wordCount: content.wordCount,
        headings: content.headings.length
    });
    
    if (content.wordCount === 0) {
        log({ warning: 'Page has no readable content' });
        throw new Error('Page has no readable content to summarize');
    }
    
    log({ status: 'Generating summary with LLM...' });
    const summary = await summarizeWithLLM(content);
    
    log({ status: 'Summary generated', keyTakeaways: summary.keyTakeaways.length });
    
    return summary;
}










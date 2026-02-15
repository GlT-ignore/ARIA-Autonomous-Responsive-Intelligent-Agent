/**
 * Data Extraction Workflow
 * 
 * Identifies and extracts specific data from web pages based on user intent
 */

import { planWithLLM } from '../shared/llmClient';
import type { BusRequest, BusResponse } from '../shared/types';

export interface ExtractionTarget {
    description: string;
    selectors: string[];
    dataType: 'text' | 'number' | 'url' | 'email' | 'price';
}

export interface ExtractedData {
    items: Array<Record<string, any>>;
    count: number;
    extractedAt: number;
    sourceUrl: string;
}

/**
 * Send message to content script
 */
async function sendToActive(type: string, payload: any): Promise<BusResponse> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) throw new Error('No active tab');

    const req: BusRequest = { type, payload, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, target: 'activeTab' };
    const response = await chrome.tabs.sendMessage(tabs[0].id, req);
    return response as BusResponse;
}

/**
 * Identify what data to extract using LLM
 */
export async function identifyExtractionTargets(userInput: string, snapshot: any): Promise<ExtractionTarget[]> {
    const elements = snapshot.elements || [];
    const sampleElements = elements.slice(0, 50).map((el: any) => ({
        tag: el.tag,
        text: el.text?.slice(0, 100),
        attrs: el.attrs
    }));

    const prompt = `You are a data extraction specialist. The user wants to extract data from a web page.

USER REQUEST: "${userInput}"

SAMPLE PAGE ELEMENTS (first 50):
${JSON.stringify(sampleElements, null, 2).slice(0, 3000)}

Analyze the page structure and determine:
1. What type of data the user wants to extract (e.g., prices, names, emails, links)
2. What CSS selectors would match those elements
3. What data type each field is (text, number, url, email, price)

Respond in this format:
TARGET_1:
DESCRIPTION: [what this data represents]
SELECTORS: [CSS selector 1], [CSS selector 2], [CSS selector 3]
DATA_TYPE: [text|number|url|email|price]

TARGET_2:
DESCRIPTION: [what this data represents]
SELECTORS: [CSS selector 1], [CSS selector 2]
DATA_TYPE: [text|number|url|email|price]

Example for "extract all product prices":
TARGET_1:
DESCRIPTION: Product prices
SELECTORS: .price, .product-price, span[class*="price"], [data-price]
DATA_TYPE: price

Now analyze for: "${userInput}"`;

    try {
        const response = await planWithLLM(prompt);

        // Parse response
        const targets: ExtractionTarget[] = [];
        const targetBlocks = response.split(/TARGET_\d+:/i).filter(Boolean);

        for (const block of targetBlocks) {
            const descMatch = block.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
            const selectorsMatch = block.match(/SELECTORS:\s*(.+?)(?:\n|$)/i);
            const dataTypeMatch = block.match(/DATA_TYPE:\s*(text|number|url|email|price)/i);

            if (descMatch && selectorsMatch && descMatch[1] && selectorsMatch[1]) {
                const selectors = selectorsMatch[1]
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);

                targets.push({
                    description: descMatch[1].trim(),
                    selectors,
                    dataType: (dataTypeMatch?.[1] as any) || 'text'
                });
            }
        }

        // Fallback: use heuristics if LLM didn't return good results
        if (targets.length === 0) {
            targets.push(...heuristicExtractionTargets(userInput));
        }

        return targets;
    } catch (error) {
        console.error('Target identification failed:', error);
        return heuristicExtractionTargets(userInput);
    }
}

/**
 * Heuristic-based extraction targets (fallback)
 */
function heuristicExtractionTargets(userInput: string): ExtractionTarget[] {
    const lower = userInput.toLowerCase();
    const targets: ExtractionTarget[] = [];

    if (lower.includes('price')) {
        targets.push({
            description: 'Prices',
            selectors: ['.price', '.product-price', '[class*="price"]', '[data-price]', 'span[class*="Price"]'],
            dataType: 'price'
        });
    }

    if (lower.includes('name') || lower.includes('title')) {
        targets.push({
            description: 'Names/Titles',
            selectors: ['h1', 'h2', 'h3', '.title', '.product-title', '[class*="title"]', 'a[class*="Title"]'],
            dataType: 'text'
        });
    }

    if (lower.includes('email')) {
        targets.push({
            description: 'Email addresses',
            selectors: ['a[href^="mailto:"]', '[type="email"]'],
            dataType: 'email'
        });
    }

    if (lower.includes('link') || lower.includes('url')) {
        targets.push({
            description: 'Links',
            selectors: ['a[href]'],
            dataType: 'url'
        });
    }

    // If no specific match, try generic text extraction
    if (targets.length === 0) {
        targets.push({
            description: 'Text content',
            selectors: ['p', 'span', 'div[class*="content"]', 'article'],
            dataType: 'text'
        });
    }

    return targets;
}

/**
 * Extract data from page using identified targets
 */
export async function extractDataFromPage(targets: ExtractionTarget[]): Promise<ExtractedData> {
    try {
        const response = await sendToActive('EXTRACT_DATA', { targets });

        if (response.success && response.data) {
            return response.data as ExtractedData;
        }

        throw new Error('Data extraction failed');
    } catch (error) {
        console.error('Data extraction failed:', error);

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

        return {
            items: [],
            count: 0,
            extractedAt: Date.now(),
            sourceUrl: tabs[0]?.url || ''
        };
    }
}

/**
 * Format extracted data as HTML table
 */
export function generateExtractionHTML(data: ExtractedData, targets: ExtractionTarget[]): string {
    if (data.items.length === 0) {
        return `
            <div id="extraction-result" style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:16px; margin-top:12px;">
                <h3 style="margin:0 0 8px 0; font-size:16px; color:#991b1b;">⚠️ No Data Found</h3>
                <p style="margin:0; color:#7f1d1d; font-size:13px;">
                    Could not find any matching data on this page. The selectors may need to be adjusted.
                </p>
            </div>
        `;
    }

    // Determine columns from first item
    const firstItem = data.items[0];
    const columns = firstItem ? Object.keys(firstItem) : [];

    const tableRows = data.items.slice(0, 100).map((item, idx) => {
        const cells = columns.map(col => {
            let value = item[col];
            if (typeof value === 'string' && value.length > 100) {
                value = value.slice(0, 100) + '...';
            }
            return `<td style="padding:8px; border-bottom:1px solid #e5e7eb; font-size:13px;">${value || '-'}</td>`;
        }).join('');

        return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'}">${cells}</tr>`;
    }).join('');

    const headerCells = columns.map(col =>
        `<th style="padding:8px; text-align:left; background:#f3f4f6; font-weight:600; font-size:13px; border-bottom:2px solid #d1d5db;">${col}</th>`
    ).join('');

    const date = new Date(data.extractedAt).toLocaleString();
    const showingText = data.items.length > 100 ? ` (showing first 100 of ${data.items.length})` : '';

    return `
        <div id="extraction-result" style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#111827;">📊 Extracted Data</h3>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#6b7280;">
                        Found ${data.count} items${showingText}
                    </p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="copy-extraction-json" style="background:#fff; border:1px solid #d1d5db; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:12px;">
                        Copy JSON
                    </button>
                    <button id="copy-extraction-csv" style="background:#fff; border:1px solid #d1d5db; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:12px;">
                        Copy CSV
                    </button>
                </div>
            </div>
            
            <div style="overflow-x:auto; max-height:400px;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr>${headerCells}</tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:11px; color:#9ca3af;">
                Extracted on ${date}
            </div>
        </div>
    `;
}

/**
 * Convert extracted data to CSV format
 */
export function dataToCSV(data: ExtractedData): string {
    if (data.items.length === 0) return '';

    const firstItem = data.items[0];
    if (!firstItem) return '';
    const columns = Object.keys(firstItem);
    const header = columns.join(',');

    const rows = data.items.map(item => {
        return columns.map(col => {
            let value = item[col];
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

/**
 * Execute full data extraction workflow
 */
export async function executeDataExtractionWorkflow(userInput: string, snapshot: any, log: (msg: any) => void): Promise<ExtractedData> {
    log({ status: 'Identifying extraction targets...' });
    const targets = await identifyExtractionTargets(userInput, snapshot);

    log({
        status: 'Targets identified',
        targets: targets.map(t => t.description)
    });

    if (targets.length === 0) {
        throw new Error('Could not identify what data to extract from the page');
    }

    log({ status: 'Extracting data from page...' });
    const data = await extractDataFromPage(targets);

    log({
        status: 'Data extracted',
        itemsFound: data.count
    });

    return data;
}










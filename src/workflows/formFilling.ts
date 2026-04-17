/**
 * Form Filling Workflow
 *
 * Detects form fields on a page, matches them to user profile, and fills the form.
 * Supports auto-fill from saved profile and intelligent field matching.
 */

import type { BusRequest, BusResponse } from '../shared/types';
import { type UserProfile, getProfileValue, matchEmploymentType, matchWorkArrangement } from '../shared/userProfile';

export interface FormField {
    selector: string;
    type: 'text' | 'email' | 'tel' | 'password' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'number';
    label: string;
    placeholder?: string;
    required: boolean;
    value?: string;
    options?: string[]; // For select/radio
}

export interface DetectedForm {
    formSelector?: string;
    fields: FormField[];
    submitButton?: string;
}

export interface FormData {
    [selector: string]: string | boolean;
}

/**
 * Parse a name/id attribute into a human-readable label.
 * Handles: camelCase, snake_case, JotForm's q3_name[first], kebab-case.
 * e.g. "q3_name[first]" → "First Name", "phoneNumber" → "Phone Number"
 */
function nameAttrToLabel(name: string): string {
    if (!name) return '';
    // Strip JotForm-style prefixes like "q3_", "input_"
    let cleaned = name.replace(/^q\d+_/i, '').replace(/^input_/i, '');
    // Extract bracket content: "name[first]" → "name first"
    cleaned = cleaned.replace(/\[([^\]]+)\]/g, ' $1');
    // Split camelCase: "phoneNumber" → "phone Number"
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Replace underscores/hyphens with spaces
    cleaned = cleaned.replace(/[_-]+/g, ' ');
    // Capitalise each word
    return cleaned
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/** Placeholder strings that are not useful as labels */
const GENERIC_PLACEHOLDERS = new Set([
    'your answer', 'your-answer', 'text', 'enter text', 'type here',
    '(000) 000-0000', '000-000-0000', 'mm/dd/yyyy', 'dd/mm/yyyy',
    'example@example.com', 'example@mail.com', 'select', 'choose',
    'enter value', 'enter your answer',
]);

/**
 * Detect all form fields on the current page
 */
export function detectFormFields(snapshot: any): DetectedForm {
    const fields: FormField[] = [];
    const elements = snapshot.elements || [];

    // Track seen selectors to avoid duplicates
    const seenSelectors = new Set<string>();

    // Build index of label-like text elements: { text, index, forAttr }
    const textElements: Array<{ text: string; index: number; forAttr?: string }> = [];
    // Also build a map from id → label text for <label for="id"> matching
    const labelForMap: Record<string, string> = {};

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const isLabelLike = el.tag === 'label' || el.tag === 'div' || el.tag === 'span' ||
            el.tag === 'h1' || el.tag === 'h2' || el.tag === 'h3' || el.tag === 'p' ||
            el.tag === 'li' || el.tag === 'dt';
        if (isLabelLike && el.text && el.text.trim().length > 0) {
            const text = el.text.trim();
            const forAttr = el.attrs?.for || el.attrs?.htmlFor || '';
            textElements.push({ text, index: i, forAttr });
            if (forAttr) labelForMap[forAttr] = text;
        }
    }

    /**
     * Given an element and its snapshot index, return the best human-readable label.
     * Priority:
     *   1. <label for="id"> association
     *   2. aria-label attribute
     *   3. placeholder (if not generic)
     *   4. title attribute
     *   5. name/id attribute parsed to English
     *   6. Nearby preceding text (up to 25 elements back)
     *   7. defaultLabel
     */
    const findBetterLabel = (el: any, elIndex: number, defaultLabel: string): string => {
        const attrs = el.attrs || {};

        // 1. Associated <label for="id">
        const elId = attrs.id || '';
        if (elId && labelForMap[elId]) return labelForMap[elId];

        // 2. aria-label
        if (attrs.ariaLabel) {
            const v = attrs.ariaLabel.trim();
            if (v && !GENERIC_PLACEHOLDERS.has(v.toLowerCase())) return v;
        }

        // 3. placeholder (only if it reads like a label, not a format hint)
        if (attrs.placeholder) {
            const v = attrs.placeholder.trim();
            if (v && !GENERIC_PLACEHOLDERS.has(v.toLowerCase()) &&
                !v.match(/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/) && // phone format
                !v.match(/^[\d\/\-]+$/)) { // date format
                return v;
            }
        }

        // 4. title
        if (attrs.title) {
            const v = attrs.title.trim();
            if (v && !GENERIC_PLACEHOLDERS.has(v.toLowerCase())) return v;
        }

        // 5. name or id attribute parsed to readable label
        const nameLabel = nameAttrToLabel(attrs.name || '') || nameAttrToLabel(elId);
        if (nameLabel && nameLabel.length > 1) {
            // Filter out meaningless parsed names
            const lower = nameLabel.toLowerCase();
            if (!lower.match(/^(input|field|text|q\d+|form|widget|element)$/)) {
                return nameLabel;
            }
        }

        // 6. Nearby preceding text (look back up to 25 elements — covers JotForm's deep nesting)
        const nearby = textElements
            .filter(t => t.index < elIndex && t.index >= elIndex - 25)
            .map(t => t.text)
            .filter(text => {
                const lower = text.toLowerCase();
                return text.length > 1 &&
                    text.length < 120 &&
                    !lower.match(/^\s*\*\s*$/) &&          // asterisk-only
                    !lower.includes('required') &&
                    !lower.includes('optional') &&
                    !lower.match(/^https?:\/\//) &&        // URLs
                    !lower.match(/^\d{4}[-\/]\d{2}/) &&   // dates
                    !lower.match(/^[a-z0-9._%+-]+@/);     // email addresses in text
            });

        if (nearby.length > 0) {
            // Prefer shorter strings (actual label text vs. paragraph prose)
            const sorted = [...nearby].sort((a, b) => a.length - b.length);
            // Use the shortest reasonable one that still has content
            const best = sorted.find(t => t.length >= 2 && t.length <= 60) || nearby[nearby.length - 1];
            return best;
        }

        return defaultLabel;
    };

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const tag = el.tag;
        const attrs = el.attrs || {};
        const selector = el.guess || (attrs.name ? `${tag}[name="${attrs.name}"]` : '') || (attrs.id ? `#${attrs.id}` : '');

        if (!selector) continue;
        if (seenSelectors.has(selector)) continue;

        if (tag === 'input') {
            const inputType = (attrs.type || 'text').toLowerCase();
            if (['submit', 'button', 'hidden', 'file', 'image', 'reset'].includes(inputType)) continue;

            const label = findBetterLabel(el, i, 'Text field');
            fields.push({
                selector,
                type: inputType as any,
                label,
                placeholder: attrs.placeholder || undefined,
                required: attrs.required === 'true' || attrs.ariaRequired === 'true',
                value: attrs.value || undefined,
            });
            seenSelectors.add(selector);
        }

        if (tag === 'textarea') {
            const label = findBetterLabel(el, i, 'Text area');
            fields.push({
                selector,
                type: 'textarea',
                label,
                placeholder: attrs.placeholder || undefined,
                required: attrs.required === 'true' || attrs.ariaRequired === 'true',
                value: attrs.value || undefined,
            });
            seenSelectors.add(selector);
        }

        if (tag === 'select') {
            const label = findBetterLabel(el, i, 'Dropdown');
            // Collect option text from nearby elements
            const optionEls = elements.slice(i + 1, i + 30).filter((e: any) => e.tag === 'option' && e.text);
            const options = optionEls.map((e: any) => e.text.trim()).filter(Boolean);
            fields.push({
                selector,
                type: 'select',
                label,
                required: attrs.required === 'true' || attrs.ariaRequired === 'true',
                value: attrs.value || undefined,
                options,
            });
            seenSelectors.add(selector);
        }
    }

    // Try to find submit button
    const submitButton = elements.find((el: any) =>
        (el.tag === 'button' && el.attrs?.type === 'submit') ||
        (el.tag === 'input' && el.attrs?.type === 'submit') ||
        (el.tag === 'button' && /\b(submit|apply|send|continue|next)\b/i.test(el.text || ''))
    );

    return {
        fields,
        submitButton: submitButton?.guess || undefined,
    };
}

/**
 * Generate HTML for form data input dialog (with pre-filled values)
 */
export function generateFormInputHTML(form: DetectedForm, extractedData: FormData = {}): string {
    const autoFilledCount = Object.keys(extractedData).length;
    const missingRequired = form.fields.filter(f => f.required && !extractedData[f.selector]).length;
    
    const fieldsHTML = form.fields.map((field, idx) => {
        const required = field.required ? ' <span style="color:red">*</span>' : '';
        const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : '';
        const preFilledValue = extractedData[field.selector];
        const valueAttr = preFilledValue ? ` value="${preFilledValue}"` : '';
        const autoFilledBadge = preFilledValue ? ' <span style="color:#10b981; font-size:11px;">✓ Auto-filled</span>' : '';
        
        let inputHTML = '';
        
        if (field.type === 'textarea') {
            inputHTML = `<textarea id="form-field-${idx}" data-selector="${field.selector}"${placeholder} style="width:100%; height:60px;">${preFilledValue || ''}</textarea>`;
        } else if (field.type === 'select') {
            inputHTML = `<select id="form-field-${idx}" data-selector="${field.selector}" style="width:100%;">
                <option value="">-- Select --</option>
            </select>`;
        } else if (field.type === 'checkbox') {
            const checked = preFilledValue === true ? ' checked' : '';
            inputHTML = `<input type="checkbox" id="form-field-${idx}" data-selector="${field.selector}"${checked}>`;
        } else {
            inputHTML = `<input type="${field.type}" id="form-field-${idx}" data-selector="${field.selector}"${placeholder}${valueAttr} style="width:100%;">`;
        }
        
        return `
            <div style="margin-bottom:12px;">
                <label style="display:block; margin-bottom:4px; font-weight:500;">
                    ${field.label}${required}${autoFilledBadge}
                </label>
                ${inputHTML}
            </div>
        `;
    }).join('\n');
    
    const summaryHTML = autoFilledCount > 0 
        ? `<p style="color:#10b981; font-size:13px; margin-bottom:12px; padding:8px; background:#f0fdf4; border-radius:4px;">
            ✓ ${autoFilledCount} field(s) auto-filled from your prompt!
            ${missingRequired > 0 ? `Please fill ${missingRequired} remaining required field(s).` : 'Review and submit.'}
           </p>`
        : `<p style="color:#f59e0b; font-size:13px; margin-bottom:12px; padding:8px; background:#fffbeb; border-radius:4px;">
            ⚠️ Could not extract values from prompt. Please fill manually.
           </p>`;
    
    return `
        <div id="form-filling-dialog" style="background:#fff; padding:20px; border-radius:8px; max-height:400px; overflow-y:auto;">
            <h3 style="margin-top:0;">Review Form Data</h3>
            ${summaryHTML}
            ${fieldsHTML}
            <div style="margin-top:16px; display:flex; gap:8px;">
                <button id="form-submit-data" style="flex:1; padding:10px; background:#4f46e5; color:#fff; border:none; border-radius:4px; cursor:pointer;">
                    ${autoFilledCount > 0 ? 'Review & Fill Form' : 'Fill Form'}
                </button>
                <button id="form-cancel-data" style="padding:10px; background:#6b7280; color:#fff; border:none; border-radius:4px; cursor:pointer;">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

/**
 * Extract form data from user's task prompt using intelligent parsing
 */
export async function extractFormDataFromPrompt(
    taskPrompt: string,
    form: DetectedForm
): Promise<FormData> {
    const data: FormData = {};
    
    // Use LLM to extract structured data from the prompt
    try {
        const { planWithLLM } = await import('../shared/llmClient.js');
        
        const fieldsList = form.fields.map(f => `- ${f.label} (${f.type}${f.required ? ', required' : ''})`).join('\n');
        
        const prompt = `Extract form field values from the user's task description and match them to the form fields.

USER'S TASK: ${taskPrompt}

FORM FIELDS:
${fieldsList}

Your job: Extract any values mentioned in the task that match these fields.

Output format (JSON only, no explanations):
{
  "field_label_1": "extracted_value_1",
  "field_label_2": "extracted_value_2",
  ...
}

CRITICAL RULES:
- Each field gets ONLY ONE specific value (never combine multiple values)
- Match values to fields based on semantic meaning (e.g., "sender name" matches "Sender's Name")
- Separate different data types: email goes in email field, phone in phone field, name in name field
- NEVER put "email + phone" together - extract them separately
- If a value is not mentioned, omit that field from the JSON
- Output ONLY valid JSON, nothing else

Example:
Task: "Fill form with name John Doe, email john@test.com, phone 1234567890"
Fields: Name, Email, Phone
Output:
{
  "Name": "John Doe",
  "Email": "john@test.com",
  "Phone": "1234567890"
}

BAD Example (DO NOT DO THIS):
{
  "Name": "john@test.com, phone 1234567890"
}

Now extract from the user's task:`;

        const response = await planWithLLM(prompt);
        
        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0]);
            
            // Match extracted data to form field selectors
            for (const field of form.fields) {
                const extractedValue = extracted[field.label];
                if (extractedValue !== undefined && extractedValue !== null && extractedValue !== '') {
                    // Validate the extracted value makes sense for the field type
                    const valueStr = String(extractedValue).trim();
                    
                    // Skip if value looks like combined data (has comma + multiple data types)
                    if (valueStr.includes('@') && valueStr.includes('phone')) continue;
                    if (valueStr.includes(',') && valueStr.split(',').length > 2) continue;
                    
                    data[field.selector] = valueStr;
                }
            }
        }
    } catch (error) {
        console.error('LLM extraction failed, falling back to basic parsing:', error);
        // Fallback to basic keyword matching
        return extractFormDataBasic(taskPrompt, form);
    }
    
    return data;
}

/**
 * Fallback: Basic keyword-based extraction without LLM
 */
function extractFormDataBasic(taskPrompt: string, form: DetectedForm): FormData {
    const data: FormData = {};
    
    // Extract ALL data from the prompt (structured extraction)
    const extractedData: Record<string, string> = {};
    
    // Extract email
    const emailMatch = taskPrompt.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (emailMatch) extractedData.email = emailMatch[1];
    
    // Extract phone numbers (10 digits or formatted)
    const phoneMatches = taskPrompt.match(/\b(\d{10}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/g);
    if (phoneMatches) {
        extractedData.phone1 = phoneMatches[0]?.replace(/[-.\s]/g, '');
        if (phoneMatches[1]) extractedData.phone2 = phoneMatches[1].replace(/[-.\s]/g, '');
    }
    
    // Extract names (capitalized words)
    const nameMatches = taskPrompt.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
    if (nameMatches && nameMatches.length > 0) {
        extractedData.name1 = nameMatches[0];
        if (nameMatches[1]) extractedData.name2 = nameMatches[1];
    }
    
    // Extract addresses/locations (words after from/to/pickup/address keywords)
    const addressPatterns = [
        /(?:from|pickup|origin|start).*?(?:is|:)?\s*([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)?)/i,
        /(?:to|destination|delivery|drop).*?(?:is|:)?\s*([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)?)/i,
        /(?:address).*?(?:is|:)?\s*([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)?)/i
    ];
    let addrIdx = 0;
    for (const pattern of addressPatterns) {
        const match = taskPrompt.match(pattern);
        if (match && match[1]) {
            extractedData[`address${++addrIdx}`] = match[1].trim();
        }
    }
    
    // Now intelligently assign extracted data to form fields
    // Match based on field label semantic meaning
    for (const field of form.fields) {
        const fieldLower = field.label.toLowerCase();
        let value = null;
        
        // Match by field type and label keywords
        if (fieldLower.includes('email') || fieldLower.includes('mail')) {
            value = extractedData.email;
        } 
        else if (fieldLower.includes('phone') || fieldLower.includes('contact') || 
                 fieldLower.includes('mobile') || fieldLower.includes('whatsapp')) {
            // If field label has "receiver" or is second phone field, use phone2
            if (fieldLower.includes('receiver') && extractedData.phone2) {
                value = extractedData.phone2;
            } else {
                value = extractedData.phone1;
            }
        } 
        else if (fieldLower.includes('sender') && fieldLower.includes('name')) {
            value = extractedData.name1;
        } 
        else if (fieldLower.includes('receiver') && fieldLower.includes('name')) {
            value = extractedData.name2 || extractedData.name1;
        } 
        else if (fieldLower.includes('name')) {
            // Generic name field - use first name
            value = extractedData.name1;
        } 
        else if (fieldLower.includes('pickup') || fieldLower.includes('from') || 
                 (fieldLower.includes('address') && !fieldLower.includes('receiver'))) {
            value = extractedData.address1;
        } 
        else if (fieldLower.includes('receiver') || fieldLower.includes('destination') ||
                 fieldLower.includes('delivery')) {
            value = extractedData.address2 || extractedData.address1;
        }
        // For completely generic fields (text field, text area), assign remaining data
        else if (fieldLower === 'text field' || fieldLower === 'text area') {
            // Try to assign any unused extracted data in order
            const unused = [
                extractedData.name1,
                extractedData.email,
                extractedData.phone1,
                extractedData.address1,
                extractedData.name2,
                extractedData.phone2,
                extractedData.address2
            ].filter(v => v && !Object.values(data).includes(v));
            
            if (unused.length > 0) {
                value = unused[0];
            }
        }
        
        if (value && !data[field.selector]) { // Don't overwrite already assigned values
            data[field.selector] = value;
        }
    }
    
    return data;
}

/**
 * Check if the user's task prompt indicates they want to use their saved profile
 */
export function isProfileFillIntent(taskPrompt: string): boolean {
    const lower = taskPrompt.toLowerCase();
    return /\b(my\s+(details?|info(rmation)?|profile|data|saved)|with\s+my|from\s+my\s+profile|auto[\s-]?fill|use\s+my)\b/i.test(lower) ||
        /\b(fill\s+(out|in|this|the)\s+.*(form|application))\b/i.test(lower);
}

/**
 * Match form fields to user profile data using intelligent field-label matching
 */
export function matchProfileToForm(profile: UserProfile, form: DetectedForm): FormData {
    const data: FormData = {};

    for (const field of form.fields) {
        // Skip password fields - never auto-fill passwords
        if (field.type === 'password') continue;

        // For select fields, try employment type / work arrangement matching
        if (field.type === 'select' && field.options && field.options.length > 0) {
            const lower = field.label.toLowerCase();
            if (/employment|job\s*type|work\s*type/i.test(lower)) {
                const match = matchEmploymentType(profile, field.options);
                if (match) data[field.selector] = match;
                continue;
            }
            if (/work\s*arrangement|remote|hybrid|on[\s-]?site|work\s*mode/i.test(lower)) {
                const match = matchWorkArrangement(profile, field.options);
                if (match) data[field.selector] = match;
                continue;
            }
        }

        // For checkbox fields
        if (field.type === 'checkbox') {
            const lower = field.label.toLowerCase();
            if (/relocat/i.test(lower)) {
                data[field.selector] = profile.preferences.willingToRelocate;
                continue;
            }
            if (/sponsor/i.test(lower)) {
                data[field.selector] = profile.preferences.requiresSponsorship;
                continue;
            }
            continue;
        }

        // Use getProfileValue — try label first, then placeholder as fallback
        const value = getProfileValue(profile, field.label) ||
            (field.placeholder ? getProfileValue(profile, field.placeholder) : undefined);
        if (value && value.trim()) {
            data[field.selector] = value;
        }
    }

    return data;
}

/**
 * Generate a summary of auto-filled fields for chat display
 */
export function generateFillSummary(form: DetectedForm, data: FormData): string {
    const filled: string[] = [];
    const skipped: string[] = [];

    for (const field of form.fields) {
        if (data[field.selector] !== undefined && data[field.selector] !== '') {
            const val = String(data[field.selector]);
            // Mask sensitive values
            const display = field.type === 'password' ? '••••••••' :
                /email/i.test(field.label) ? val :
                /phone|mobile|tel/i.test(field.label) ? val.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2') :
                /ssn|social|card|cvv|cvc/i.test(field.label) ? '••••••••' :
                val;
            filled.push(`  ${field.label}: ${display}`);
        } else {
            skipped.push(`  ${field.label} (no match)`);
        }
    }

    let summary = `Form Auto-Fill Summary:\n`;
    summary += `Filled ${filled.length}/${form.fields.length} fields:\n`;
    if (filled.length > 0) summary += filled.join('\n') + '\n';
    if (skipped.length > 0) summary += `\nSkipped:\n` + skipped.join('\n');
    return summary;
}

/**
 * Collect form data from the dialog (for missing fields only)
 */
export function collectFormData(form: DetectedForm): FormData | null {
    const data: FormData = {};
    
    for (let i = 0; i < form.fields.length; i++) {
        const field = form.fields[i];
        const input = document.getElementById(`form-field-${i}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        
        if (!input) continue;
        
        if (field.type === 'checkbox') {
            data[field.selector] = (input as HTMLInputElement).checked;
        } else {
            const value = input.value.trim();
            if (value || !field.required) {
                data[field.selector] = value;
            } else if (field.required && !value) {
                alert(`Please fill required field: ${field.label}`);
                return null;
            }
        }
    }
    
    return data;
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
 * Execute form filling with collected data
 */
export async function fillFormWithData(form: DetectedForm, data: FormData, log: (msg: any) => void): Promise<void> {
    log({ status: 'Starting form filling', fieldsCount: Object.keys(data).length });

    for (const [selector, value] of Object.entries(data)) {
        const field = form.fields.find(f => f.selector === selector);
        if (!field) continue;

        try {
            if (field.type === 'checkbox') {
                if (value === true) {
                    log({ action: 'CLICK', selector, field: field.label });
                    await sendToActive('CLICK', { selector });
                    await new Promise(r => setTimeout(r, 300));
                }
            } else if (field.type === 'select') {
                log({ action: 'SELECT', selector, value, field: field.label });
                await sendToActive('SELECT', { selector, value: value as string });
                await new Promise(r => setTimeout(r, 300));
            } else {
                log({ action: 'TYPE', selector, value, field: field.label });
                await sendToActive('TYPE', { selector, text: value as string });
                await new Promise(r => setTimeout(r, 300));
            }
        } catch (error) {
            log({ error: `Failed to fill ${field.label}`, details: String(error) });
        }
    }

    log({ status: 'Form filling complete - pausing before submit (destructive action detected)' });

    // Use the safety confirmation system instead of confirm()
    if (form.submitButton) {
        try {
            const { conversation } = await import('../shared/conversation.js');
            const { requestConfirmation, createConfirmationRequest } = await import('../shared/confirmations.js');

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = tabs[0]?.url || '';

            const confirmRequest = createConfirmationRequest(
                'Submit form',
                currentUrl,
                form.submitButton,
                {},
                { formData: data }
            );
            // Override to submit type with medium severity for proper safety messaging
            confirmRequest.actionType = 'submit';
            confirmRequest.severity = 'medium';
            confirmRequest.description = 'Submit the filled form';

            conversation.addAssistantMessage(
                'Form filled successfully. Pausing before submit — this is a destructive action that cannot be undone.'
            );

            const confirmed = await requestConfirmation(confirmRequest);

            if (confirmed) {
                log({ action: 'CLICK', selector: form.submitButton, purpose: 'Submit form (confirmed)' });
                await sendToActive('CLICK', { selector: form.submitButton });
                log({ status: 'Form submitted' });
            } else {
                log({ status: 'Form submission cancelled by user' });
            }
        } catch (error) {
            log({ error: 'Failed during submit confirmation', details: String(error) });
        }
    }
}



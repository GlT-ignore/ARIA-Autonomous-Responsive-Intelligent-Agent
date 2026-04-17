/**
 * Confirmation System
 *
 * Handles user confirmations for critical actions (purchases, deletions, form submissions).
 * Per user preference: ALWAYS confirm before purchases/deletions - no auto-approval.
 */

import { conversation } from './conversation';

export type ActionType = 'purchase' | 'delete' | 'submit' | 'message' | 'payment' | 'other';
export type ActionSeverity = 'high' | 'medium' | 'low';

export interface ConfirmationRequest {
    actionType: ActionType;
    description: string;
    elementText: string;
    url: string;
    selector?: string;
    severity: ActionSeverity;
    details?: {
        price?: string;
        recipient?: string;
        itemCount?: number;
        formData?: Record<string, any>;
    };
}

export interface ConfirmationSettings {
    alwaysConfirmPurchases: boolean;
    alwaysConfirmDeletions: boolean;
    alwaysConfirmSubmissions: boolean;
    alwaysConfirmMessages: boolean;
    maxAutoApproveAmount?: number; // Not used per user preference
}

const DEFAULT_SETTINGS: ConfirmationSettings = {
    alwaysConfirmPurchases: true, // User preference: always confirm
    alwaysConfirmDeletions: true, // User preference: always confirm
    alwaysConfirmSubmissions: true, // Confirm form submissions with sensitive data
    alwaysConfirmMessages: true, // Confirm before sending messages
};

/**
 * Determine if an action requires user confirmation
 */
export function requiresConfirmation(request: ConfirmationRequest, settings: ConfirmationSettings = DEFAULT_SETTINGS): boolean {
    // Per user preference: ALWAYS confirm high severity actions
    if (request.severity === 'high') {
        return true;
    }

    // Check specific action types
    switch (request.actionType) {
        case 'purchase':
        case 'payment':
            return settings.alwaysConfirmPurchases;

        case 'delete':
            return settings.alwaysConfirmDeletions;

        case 'submit':
            return settings.alwaysConfirmSubmissions;

        case 'message':
            return settings.alwaysConfirmMessages;

        case 'other':
            // Medium severity: confirm
            // Low severity: auto-approve
            return request.severity !== 'low';

        default:
            return true; // Safe default
    }
}

/**
 * Request confirmation from user via conversation interface
 */
export async function requestConfirmation(request: ConfirmationRequest, settings?: ConfirmationSettings): Promise<boolean> {
    // Check if confirmation needed
    if (!requiresConfirmation(request, settings)) {
        conversation.addSystemMessage(`Auto-approved: ${request.description}`);
        return true;
    }

    // Build confirmation message
    let message = `${getActionEmoji(request.actionType)} **${request.description}**\n\n`;
    message += `Element: "${request.elementText}"\n`;
    message += `URL: ${request.url}\n`;

    if (request.details) {
        if (request.details.price) {
            message += `\nPrice: ${request.details.price}`;
        }
        if (request.details.recipient) {
            message += `\nRecipient: ${request.details.recipient}`;
        }
        if (request.details.itemCount) {
            message += `\nItems: ${request.details.itemCount}`;
        }
    }

    message += `\n\n**Do you want to proceed?**`;

    // Request confirmation via conversation
    const confirmed = await conversation.requestConfirmation(
        message,
        request.severity,
        {
            action: request.actionType,
            data: request,
        }
    );

    // Log the result
    if (confirmed) {
        conversation.addAssistantMessage(`✓ Confirmed: ${request.description}`);
    } else {
        conversation.addAssistantMessage(`✗ Cancelled: ${request.description}`);
    }

    return confirmed;
}

/**
 * Get emoji for action type
 */
function getActionEmoji(actionType: ActionType): string {
    switch (actionType) {
        case 'purchase':
        case 'payment':
            return '💳';
        case 'delete':
            return '🗑️';
        case 'submit':
            return '📤';
        case 'message':
            return '💬';
        default:
            return '⚠️';
    }
}

/**
 * Detect action type from element text and attributes
 */
export function detectActionType(elementText: string, elementAttributes: Record<string, string> = {}): ActionType {
    const text = elementText.toLowerCase();
    const attrs = Object.values(elementAttributes).join(' ').toLowerCase();
    const combined = `${text} ${attrs}`;

    // Purchase/Payment actions
    if (
        /buy now|purchase|checkout|place order|complete order|pay now|add to cart|proceed to checkout/i.test(combined)
    ) {
        return 'purchase';
    }

    // Delete actions
    if (
        /delete|remove|clear|cancel account|close account|unsubscribe/i.test(combined)
    ) {
        return 'delete';
    }

    // Message/Send actions
    if (
        /send|post|publish|share|reply|comment/i.test(combined)
    ) {
        return 'message';
    }

    // Submit actions (forms)
    if (
        /submit|continue|next|confirm|save|update/i.test(combined)
    ) {
        return 'submit';
    }

    return 'other';
}

/**
 * Determine action severity based on type and context
 */
export function determineActionSeverity(
    actionType: ActionType,
    elementText: string,
    url: string
): ActionSeverity {
    // High severity: purchases, deletions, payments
    if (actionType === 'purchase' || actionType === 'payment' || actionType === 'delete') {
        return 'high';
    }

    // Medium severity: form submissions, messages
    if (actionType === 'submit' || actionType === 'message') {
        return 'medium';
    }

    // Check for irreversible keywords
    if (/permanent|cannot be undone|irreversible/i.test(elementText)) {
        return 'high';
    }

    // Default to low for other actions
    return 'low';
}

/**
 * Create a confirmation request from element data
 */
export function createConfirmationRequest(
    elementText: string,
    url: string,
    selector?: string,
    elementAttributes?: Record<string, string>,
    details?: ConfirmationRequest['details']
): ConfirmationRequest {
    const actionType = detectActionType(elementText, elementAttributes);
    const severity = determineActionSeverity(actionType, elementText, url);

    return {
        actionType,
        description: `Click "${elementText}"`,
        elementText,
        url,
        selector,
        severity,
        details,
    };
}

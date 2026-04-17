/**
 * Action Risk Classifier
 *
 * Classifies actions by risk level for safety and confirmation purposes.
 * Uses heuristics and pattern matching to determine action risk.
 */

import type { ActionType, ActionSeverity } from './confirmations';

export interface ActionClassification {
    type: ActionType;
    severity: ActionSeverity;
    confidence: number; // 0-1
    reasons: string[];
    requiresConfirmation: boolean;
}

/**
 * High-risk patterns (purchases, payments, deletions)
 */
const HIGH_RISK_PATTERNS = {
    purchase: [
        /buy\s+now/i,
        /purchase/i,
        /checkout/i,
        /place\s+order/i,
        /complete\s+order/i,
        /confirm\s+purchase/i,
        /add\s+to\s+(cart|basket)/i,
        /proceed\s+to\s+checkout/i,
        /complete\s+checkout/i,
    ],
    payment: [
        /pay\s+now/i,
        /submit\s+payment/i,
        /confirm\s+payment/i,
        /complete\s+payment/i,
        /pay\s+\$\d+/i,
    ],
    delete: [
        /delete/i,
        /remove/i,
        /cancel\s+account/i,
        /close\s+account/i,
        /deactivate/i,
        /unsubscribe/i,
        /permanently\s+delete/i,
        /clear\s+all/i,
    ],
};

/**
 * Medium-risk patterns (form submissions, messaging)
 */
const MEDIUM_RISK_PATTERNS = {
    submit: [
        /submit/i,
        /continue/i,
        /next\s+step/i,
        /confirm/i,
        /save\s+changes/i,
        /update/i,
        /apply/i,
    ],
    message: [
        /send/i,
        /post/i,
        /publish/i,
        /share/i,
        /reply/i,
        /comment/i,
        /tweet/i,
    ],
};

/**
 * Irreversible action keywords
 */
const IRREVERSIBLE_KEYWORDS = [
    /permanent/i,
    /cannot\s+be\s+undone/i,
    /irreversible/i,
    /final/i,
    /no\s+turning\s+back/i,
];

/**
 * Price detection patterns
 */
const PRICE_PATTERNS = [
    /\$\d+/,
    /\d+\.\d{2}/,
    /USD\s*\d+/,
    /EUR\s*\d+/,
    /£\d+/,
    /€\d+/,
];

/**
 * Classify an action based on element text and attributes
 */
export function classifyAction(
    elementText: string,
    elementAttributes: Record<string, string> = {},
    contextText: string = ''
): ActionClassification {
    const combined = `${elementText} ${Object.values(elementAttributes).join(' ')} ${contextText}`.toLowerCase();
    const reasons: string[] = [];
    let actionType: ActionType = 'other';
    let severity: ActionSeverity = 'low';
    let confidence = 0;

    // Check high-risk patterns first
    for (const [type, patterns] of Object.entries(HIGH_RISK_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(combined)) {
                actionType = type as ActionType;
                severity = 'high';
                confidence = Math.max(confidence, 0.9);
                reasons.push(`Matched high-risk pattern: ${pattern.source}`);
            }
        }
    }

    // Check medium-risk patterns
    if (confidence < 0.5) {
        for (const [type, patterns] of Object.entries(MEDIUM_RISK_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.test(combined)) {
                    actionType = type as ActionType;
                    severity = 'medium';
                    confidence = Math.max(confidence, 0.7);
                    reasons.push(`Matched medium-risk pattern: ${pattern.source}`);
                }
            }
        }
    }

    // Check for irreversible keywords (upgrades severity)
    for (const pattern of IRREVERSIBLE_KEYWORDS) {
        if (pattern.test(combined)) {
            severity = 'high';
            confidence = Math.max(confidence, 0.95);
            reasons.push('Contains irreversible action keyword');
        }
    }

    // Check for price (indicates purchase)
    for (const pattern of PRICE_PATTERNS) {
        if (pattern.test(combined)) {
            if (actionType === 'other') {
                actionType = 'purchase';
                severity = 'high';
            }
            confidence = Math.max(confidence, 0.85);
            reasons.push('Contains price information');
        }
    }

    // Check element attributes for additional context
    if (elementAttributes.type === 'submit') {
        if (actionType === 'other') {
            actionType = 'submit';
            severity = 'medium';
            confidence = Math.max(confidence, 0.6);
            reasons.push('Form submit button');
        }
    }

    // Check for payment-related attributes
    if (
        elementAttributes.class?.includes('payment') ||
        elementAttributes.id?.includes('payment') ||
        elementAttributes.name?.includes('payment')
    ) {
        actionType = 'payment';
        severity = 'high';
        confidence = Math.max(confidence, 0.9);
        reasons.push('Payment-related element');
    }

    // Determine if confirmation is required
    const requiresConfirmation = severity === 'high' || severity === 'medium';

    // Default confidence if no patterns matched
    if (confidence === 0) {
        confidence = 0.3;
        reasons.push('No specific patterns matched');
    }

    return {
        type: actionType,
        severity,
        confidence,
        reasons,
        requiresConfirmation,
    };
}

/**
 * Extract price from text
 */
export function extractPrice(text: string): string | null {
    for (const pattern of PRICE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            return match[0];
        }
    }
    return null;
}

/**
 * Check if action is reversible
 */
export function isReversible(elementText: string, actionType: ActionType): boolean {
    // Check for irreversible keywords
    for (const pattern of IRREVERSIBLE_KEYWORDS) {
        if (pattern.test(elementText)) {
            return false;
        }
    }

    // Certain action types are inherently irreversible
    if (actionType === 'delete' || actionType === 'purchase' || actionType === 'payment') {
        return false;
    }

    // Default to reversible
    return true;
}

/**
 * Get action risk score (0-10, 10 = highest risk)
 */
export function getActionRiskScore(classification: ActionClassification): number {
    let score = 0;

    // Base score from severity
    switch (classification.severity) {
        case 'high':
            score = 8;
            break;
        case 'medium':
            score = 5;
            break;
        case 'low':
            score = 2;
            break;
    }

    // Adjust by confidence
    score = score * classification.confidence;

    // Cap at 10
    return Math.min(10, score);
}

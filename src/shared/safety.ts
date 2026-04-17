/**
 * Safety Guardrails System
 *
 * Enforces safety checks and limits to protect users from:
 * - Excessive spending
 * - Irreversible actions
 * - Sensitive data leaks
 * - Untrusted domains
 * - Rapid-fire errors
 */

import { conversation } from './conversation';
import { extractPrice } from './actionClassifier';

export interface SafetySettings {
    maxPurchaseAmount: number; // Warn if detected price exceeds this (default: $100)
    trustedDomains: string[]; // Domains trusted for sensitive data
    sensitiveFieldProtection: boolean; // Encrypt/protect sensitive fields
    requireConfirmationFor: string[]; // Action types requiring confirmation
    enableRateLimiting: boolean; // Prevent rapid-fire actions
    emergencyStop: boolean; // One-click stop all actions
}

export interface SafetyCheckResult {
    allowed: boolean;
    warning?: string;
    severity: 'low' | 'medium' | 'high';
    requiresConfirmation: boolean;
}

const DEFAULT_SETTINGS: SafetySettings = {
    maxPurchaseAmount: 100, // $100 default limit
    trustedDomains: [
        'amazon.com',
        'ebay.com',
        'paypal.com',
        'stripe.com',
        'google.com',
        'github.com',
        'linkedin.com'
    ],
    sensitiveFieldProtection: true,
    requireConfirmationFor: ['purchase', 'payment', 'delete', 'submit'],
    enableRateLimiting: true,
    emergencyStop: false
};

// Storage key for settings
const SAFETY_SETTINGS_KEY = 'aria_safety_settings';

/**
 * Load safety settings
 */
export async function loadSafetySettings(): Promise<SafetySettings> {
    try {
        const data = await chrome.storage.local.get(SAFETY_SETTINGS_KEY);
        const stored = data[SAFETY_SETTINGS_KEY];
        if (stored) {
            return { ...DEFAULT_SETTINGS, ...stored };
        }
    } catch (error) {
        console.error('Failed to load safety settings:', error);
    }
    return DEFAULT_SETTINGS;
}

/**
 * Save safety settings
 */
export async function saveSafetySettings(settings: Partial<SafetySettings>): Promise<void> {
    try {
        const current = await loadSafetySettings();
        const updated = { ...current, ...settings };
        await chrome.storage.local.set({ [SAFETY_SETTINGS_KEY]: updated });
    } catch (error) {
        console.error('Failed to save safety settings:', error);
    }
}

/**
 * Check if price exceeds safety limit
 */
export async function checkPurchaseLimit(priceText: string): Promise<SafetyCheckResult> {
    const settings = await loadSafetySettings();

    // Extract numeric value from price
    const numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));

    if (isNaN(numericPrice)) {
        return {
            allowed: true,
            severity: 'low',
            requiresConfirmation: true
        };
    }

    if (numericPrice > settings.maxPurchaseAmount) {
        return {
            allowed: false,
            warning: `Purchase amount $${numericPrice} exceeds your safety limit of $${settings.maxPurchaseAmount}`,
            severity: 'high',
            requiresConfirmation: true
        };
    }

    if (numericPrice > settings.maxPurchaseAmount * 0.5) {
        return {
            allowed: true,
            warning: `Purchase amount $${numericPrice} is close to your limit of $${settings.maxPurchaseAmount}`,
            severity: 'medium',
            requiresConfirmation: true
        };
    }

    return {
        allowed: true,
        severity: 'low',
        requiresConfirmation: true
    };
}

/**
 * Check if action is irreversible
 */
export function checkIrreversibility(actionType: string, elementText: string): SafetyCheckResult {
    const irreversibleKeywords = [
        /permanent/i,
        /cannot.*undo/i,
        /irreversible/i,
        /delete.*forever/i,
        /no.*turning.*back/i,
        /final/i
    ];

    const isIrreversible =
        actionType === 'delete' ||
        actionType === 'purchase' ||
        actionType === 'payment' ||
        irreversibleKeywords.some(pattern => pattern.test(elementText));

    if (isIrreversible) {
        return {
            allowed: false,
            warning: 'This action is irreversible and cannot be undone',
            severity: 'high',
            requiresConfirmation: true
        };
    }

    return {
        allowed: true,
        severity: 'low',
        requiresConfirmation: false
    };
}

/**
 * Check if domain is trusted for sensitive data
 */
export async function checkDomainTrust(url: string, isSensitiveData: boolean): Promise<SafetyCheckResult> {
    if (!isSensitiveData) {
        return {
            allowed: true,
            severity: 'low',
            requiresConfirmation: false
        };
    }

    const settings = await loadSafetySettings();
    const domain = new URL(url).hostname.replace(/^www\./, '');

    const isTrusted = settings.trustedDomains.some(trusted =>
        domain === trusted || domain.endsWith(`.${trusted}`)
    );

    if (!isTrusted) {
        return {
            allowed: false,
            warning: `Warning: ${domain} is not in your trusted domains list`,
            severity: 'high',
            requiresConfirmation: true
        };
    }

    return {
        allowed: true,
        severity: 'low',
        requiresConfirmation: false
    };
}

/**
 * Detect sensitive field types
 */
export function isSensitiveField(fieldLabel: string, fieldType: string): boolean {
    const lower = fieldLabel.toLowerCase();
    const typeLower = fieldType.toLowerCase();

    const sensitivePatterns = [
        /password/i,
        /credit.*card/i,
        /card.*number/i,
        /cvv/i,
        /cvc/i,
        /security.*code/i,
        /ssn/i,
        /social.*security/i,
        /bank.*account/i,
        /routing.*number/i,
        /pin/i
    ];

    return (
        typeLower === 'password' ||
        sensitivePatterns.some(pattern => pattern.test(lower))
    );
}

/**
 * Rate limiting to prevent rapid-fire errors
 */
class RateLimiter {
    private actionTimestamps: number[] = [];
    private failureCount: number = 0;
    private lastFailureTime: number = 0;

    /**
     * Check if action should be rate-limited
     */
    checkRateLimit(): SafetyCheckResult {
        const now = Date.now();

        // Clean old timestamps (older than 1 minute)
        this.actionTimestamps = this.actionTimestamps.filter(t => now - t < 60000);

        // Check if too many actions in short time (more than 10 in 1 minute)
        if (this.actionTimestamps.length > 10) {
            return {
                allowed: false,
                warning: 'Too many actions in short time. Please slow down.',
                severity: 'medium',
                requiresConfirmation: false
            };
        }

        // Check if too many recent failures (more than 5 in last minute)
        if (this.failureCount > 5 && now - this.lastFailureTime < 60000) {
            return {
                allowed: false,
                warning: 'Too many consecutive failures. Stopping for safety.',
                severity: 'high',
                requiresConfirmation: false
            };
        }

        return {
            allowed: true,
            severity: 'low',
            requiresConfirmation: false
        };
    }

    /**
     * Record successful action
     */
    recordAction(): void {
        this.actionTimestamps.push(Date.now());
        this.failureCount = 0; // Reset failure count on success
    }

    /**
     * Record failed action
     */
    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
    }

    /**
     * Reset rate limiter
     */
    reset(): void {
        this.actionTimestamps = [];
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }
}

export const rateLimiter = new RateLimiter();

/**
 * Comprehensive safety check before action
 */
export async function performSafetyCheck(params: {
    actionType: string;
    elementText: string;
    url: string;
    fieldLabel?: string;
    fieldType?: string;
}): Promise<SafetyCheckResult> {
    const { actionType, elementText, url, fieldLabel, fieldType } = params;

    // Check emergency stop
    const settings = await loadSafetySettings();
    if (settings.emergencyStop) {
        return {
            allowed: false,
            warning: 'Emergency stop is active. All actions are blocked.',
            severity: 'high',
            requiresConfirmation: false
        };
    }

    // Check rate limiting
    if (settings.enableRateLimiting) {
        const rateCheck = rateLimiter.checkRateLimit();
        if (!rateCheck.allowed) {
            return rateCheck;
        }
    }

    // Check purchase limits
    if (actionType === 'purchase' || actionType === 'payment') {
        const price = extractPrice(elementText);
        if (price) {
            const purchaseCheck = await checkPurchaseLimit(price);
            if (!purchaseCheck.allowed) {
                return purchaseCheck;
            }
        }
    }

    // Check irreversibility
    const irreversibleCheck = checkIrreversibility(actionType, elementText);
    if (!irreversibleCheck.allowed) {
        return irreversibleCheck;
    }

    // Check domain trust for sensitive data
    if (fieldLabel && fieldType && isSensitiveField(fieldLabel, fieldType)) {
        const domainCheck = await checkDomainTrust(url, true);
        if (!domainCheck.allowed) {
            return domainCheck;
        }
    }

    // All checks passed
    return {
        allowed: true,
        severity: 'low',
        requiresConfirmation: settings.requireConfirmationFor.includes(actionType)
    };
}

/**
 * Request confirmation with safety warning
 */
export async function requestSafetyConfirmation(
    description: string,
    safetyCheck: SafetyCheckResult
): Promise<boolean> {
    let message = description;

    if (safetyCheck.warning) {
        message = `⚠️ ${safetyCheck.warning}\n\n${description}`;
    }

    return conversation.requestConfirmation(message, safetyCheck.severity);
}

/**
 * Emergency stop - blocks all actions
 */
export async function enableEmergencyStop(): Promise<void> {
    await saveSafetySettings({ emergencyStop: true });
    conversation.addSystemMessage('🛑 Emergency stop activated. All actions are blocked.');
}

/**
 * Disable emergency stop
 */
export async function disableEmergencyStop(): Promise<void> {
    await saveSafetySettings({ emergencyStop: false });
    conversation.addSystemMessage('✓ Emergency stop deactivated. Normal operation resumed.');
}

/**
 * Add domain to trusted list
 */
export async function addTrustedDomain(domain: string): Promise<void> {
    const settings = await loadSafetySettings();
    if (!settings.trustedDomains.includes(domain)) {
        settings.trustedDomains.push(domain);
        await saveSafetySettings(settings);
        conversation.addSystemMessage(`✓ Added ${domain} to trusted domains`);
    }
}

/**
 * Remove domain from trusted list
 */
export async function removeTrustedDomain(domain: string): Promise<void> {
    const settings = await loadSafetySettings();
    settings.trustedDomains = settings.trustedDomains.filter(d => d !== domain);
    await saveSafetySettings(settings);
    conversation.addSystemMessage(`✓ Removed ${domain} from trusted domains`);
}

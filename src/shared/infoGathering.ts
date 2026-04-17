/**
 * Information Gathering System
 *
 * Handles scenarios where the assistant needs information from the user:
 * - Missing form data
 * - Ambiguous tasks
 * - User choice required
 * - Verification needed
 * - Error recovery
 */

import { conversation } from './conversation';
import { loadUserProfile, type UserProfile } from './userProfile';

export type QuestionType = 'missing_data' | 'clarification' | 'choice' | 'verification' | 'error_recovery';
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'email' | 'phone' | 'password' | 'url';

export interface InformationRequest {
    id: string;
    questionType: QuestionType;
    question: string;
    context: string;
    fieldType?: FieldType;
    options?: string[];
    required: boolean;
    defaultValue?: string;
    fieldName?: string; // For profile updates
}

export interface GatheredInformation {
    requestId: string;
    value: string;
    updateProfile?: boolean; // Should this be saved to user profile?
}

/**
 * Detect missing fields that need user input
 */
export function detectMissingFields(
    fields: Array<{ label: string; type: string; required: boolean }>,
    profile: UserProfile
): InformationRequest[] {
    const missing: InformationRequest[] = [];

    for (const field of fields) {
        if (!field.required) continue;

        // Check if we have this data in profile
        const value = getProfileValueForField(field.label, profile);
        if (!value) {
            missing.push({
                id: `field_${Date.now()}_${Math.random()}`,
                questionType: 'missing_data',
                question: `What should I enter for "${field.label}"?`,
                context: `This is a required field in the form.`,
                fieldType: mapFieldType(field.type),
                required: true,
                fieldName: field.label
            });
        }
    }

    return missing;
}

/**
 * Map form field type to our field type
 */
function mapFieldType(type: string): FieldType {
    const lower = type.toLowerCase();
    if (lower.includes('email')) return 'email';
    if (lower.includes('phone') || lower.includes('tel')) return 'phone';
    if (lower.includes('password')) return 'password';
    if (lower.includes('number')) return 'number';
    if (lower.includes('date')) return 'date';
    if (lower.includes('url') || lower.includes('website')) return 'url';
    if (lower.includes('select') || lower.includes('dropdown')) return 'select';
    return 'text';
}

/**
 * Get profile value for a field label
 */
function getProfileValueForField(label: string, profile: UserProfile): string | undefined {
    const lower = label.toLowerCase();

    // Personal info
    if (/first.*name/i.test(lower)) return profile.personal.firstName;
    if (/last.*name/i.test(lower)) return profile.personal.lastName;
    if (/full.*name|^name$/i.test(lower)) return profile.personal.fullName;
    if (/email/i.test(lower)) return profile.personal.email;
    if (/phone/i.test(lower)) return profile.personal.phone;

    // Address
    if (/street|address.*line/i.test(lower)) return profile.address.street;
    if (/city/i.test(lower)) return profile.address.city;
    if (/state/i.test(lower)) return profile.address.state;
    if (/zip|postal/i.test(lower)) return profile.address.zipCode;
    if (/country/i.test(lower)) return profile.address.country;

    // Professional
    if (/title|position/i.test(lower)) return profile.professional.currentTitle;
    if (/company|employer/i.test(lower)) return profile.professional.currentCompany;

    // Check custom fields
    for (const [key, value] of Object.entries(profile.customFields)) {
        if (lower.includes(key.toLowerCase())) {
            return value;
        }
    }

    return undefined;
}

/**
 * Ask user for missing information
 */
export async function askForInformation(request: InformationRequest): Promise<string> {
    const response = await conversation.askQuestion(
        request.question,
        request.options,
        {
            data: {
                fieldType: request.fieldType,
                required: request.required,
                defaultValue: request.defaultValue,
                context: request.context
            }
        }
    );

    return response;
}

/**
 * Batch ask for multiple pieces of information
 */
export async function batchAskForInformation(requests: InformationRequest[]): Promise<GatheredInformation[]> {
    const results: GatheredInformation[] = [];

    if (requests.length === 0) return results;

    if (requests.length === 1) {
        // Single question
        const value = await askForInformation(requests[0]);
        results.push({
            requestId: requests[0].id,
            value,
            updateProfile: requests[0].questionType === 'missing_data'
        });
    } else {
        // Multiple questions - ask one by one for now
        // TODO: Could enhance to show all questions at once
        for (const request of requests) {
            const value = await askForInformation(request);
            results.push({
                requestId: request.id,
                value,
                updateProfile: request.questionType === 'missing_data'
            });
        }
    }

    return results;
}

/**
 * Ask for clarification on ambiguous task
 */
export async function askForClarification(
    task: string,
    ambiguity: string,
    options?: string[]
): Promise<string> {
    const question = `I need clarification about your task: "${task}". ${ambiguity}`;

    return conversation.askQuestion(question, options, {
        data: {
            questionType: 'clarification',
            originalTask: task
        }
    });
}

/**
 * Ask user to choose from options
 */
export async function askForChoice(
    prompt: string,
    options: string[],
    context?: string
): Promise<string> {
    const question = context ? `${prompt}\n\n${context}` : prompt;

    return conversation.askQuestion(question, options, {
        data: {
            questionType: 'choice'
        }
    });
}

/**
 * Ask for verification
 */
export async function askForVerification(
    description: string,
    details: Record<string, any>
): Promise<boolean> {
    let message = `Please verify: ${description}\n\n`;
    message += Object.entries(details)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

    return conversation.requestConfirmation(message, 'medium', {
        data: {
            questionType: 'verification',
            details
        }
    });
}

/**
 * Detect when task is ambiguous and needs clarification
 */
export function isTaskAmbiguous(task: string, snapshot: any): InformationRequest | null {
    const lower = task.toLowerCase();

    // Multiple products/items available
    if (snapshot.elements?.length > 10 &&
        (lower.includes('buy') || lower.includes('select') || lower.includes('choose'))) {

        const items = snapshot.elements
            .filter((el: any) => el.tag === 'a' && el.text && el.text.length > 10)
            .slice(0, 5);

        if (items.length > 1) {
            return {
                id: `ambiguous_${Date.now()}`,
                questionType: 'choice',
                question: 'I found multiple options. Which one would you like?',
                context: `Available options:\n${items.map((item: any, i: number) => `${i + 1}. ${item.text.slice(0, 50)}`).join('\n')}`,
                options: items.map((item: any, i: number) => `Option ${i + 1}`),
                required: true
            };
        }
    }

    // Unclear search intent
    if ((lower.includes('search') || lower.includes('find')) &&
        !lower.includes('for') && !lower.includes('about')) {

        return {
            id: `ambiguous_${Date.now()}`,
            questionType: 'clarification',
            question: 'What would you like me to search for?',
            context: 'Please provide more details about what you want to find.',
            required: true
        };
    }

    return null;
}

/**
 * Handle error recovery by asking user for help
 */
export async function askForErrorRecovery(
    error: string,
    context: string,
    suggestions?: string[]
): Promise<string> {
    let question = `I encountered an issue: ${error}\n\n${context}`;

    if (suggestions && suggestions.length > 0) {
        question += '\n\nHow would you like me to proceed?';
        return conversation.askQuestion(question, suggestions, {
            data: {
                questionType: 'error_recovery',
                error,
                context
            }
        });
    } else {
        question += '\n\nWhat would you like me to do?';
        return conversation.askQuestion(question, undefined, {
            data: {
                questionType: 'error_recovery',
                error,
                context
            }
        });
    }
}

/**
 * Smart question timing - should we ask now or wait?
 */
export function shouldAskNow(request: InformationRequest, currentStep: number, totalSteps: number): boolean {
    // Always ask immediately for required data
    if (request.required && request.questionType === 'missing_data') {
        return true;
    }

    // Ask for clarification before starting
    if (request.questionType === 'clarification' && currentStep === 0) {
        return true;
    }

    // Ask for choices when encountered
    if (request.questionType === 'choice') {
        return true;
    }

    // Ask for error recovery immediately
    if (request.questionType === 'error_recovery') {
        return true;
    }

    // Default: wait and batch questions
    return false;
}

/**
 * Predict if information will be needed before starting task
 */
export async function predictMissingInfo(task: string): Promise<InformationRequest[]> {
    const missing: InformationRequest[] = [];
    const lower = task.toLowerCase();
    const profile = await loadUserProfile();

    // Check for form-filling tasks
    if (lower.includes('fill') || lower.includes('form') || lower.includes('apply')) {
        // Predict common missing fields
        const commonFields = [
            { label: 'email', key: 'email' },
            { label: 'phone', key: 'phone' },
            { label: 'name', key: 'fullName' }
        ];

        for (const field of commonFields) {
            const value = getProfileValueForField(field.label, profile);
            if (!value) {
                missing.push({
                    id: `predict_${Date.now()}_${field.key}`,
                    questionType: 'missing_data',
                    question: `I notice your profile is missing a ${field.label}. Would you like to provide it now?`,
                    context: 'This will help me fill forms automatically in the future.',
                    fieldType: field.key as FieldType,
                    required: false
                });
            }
        }
    }

    return missing;
}

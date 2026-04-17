/**
 * Session Memory & Context Manager
 *
 * Maintains conversation context and learns from user behavior:
 * - Session history and context
 * - User preferences and patterns
 * - Task success/failure tracking
 * - Behavioral adaptation
 */

import { conversation, type ConversationMessage } from './conversation';
import type { TaskStep } from './types';

export interface SessionContext {
    sessionId: string;
    startTime: number;
    endTime?: number;
    messages: ConversationMessage[];
    completedTasks: TaskExecution[];
    failedTasks: TaskExecution[];
    userPreferences: UserPreferences;
    currentTask?: CurrentTask;
}

export interface TaskExecution {
    task: string;
    startTime: number;
    endTime: number;
    success: boolean;
    steps: Array<{
        action: string;
        target?: string;
        value?: string;
        success: boolean;
        error?: string;
    }>;
    url: string;
    domain: string;
}

export interface UserPreferences {
    // Learned preferences
    preferredSearchEngines: Record<string, number>; // domain -> usage count
    commonFormValues: Record<string, string>; // field name -> value
    frequentTasks: Record<string, number>; // task description -> execution count
    domainPatterns: Record<string, DomainPattern>; // domain -> learned patterns

    // Behavioral preferences
    confirmationThreshold: 'always' | 'medium' | 'low'; // When to ask for confirmation
    autoFillPreference: boolean; // Auto-fill forms without asking
    verbosity: 'detailed' | 'normal' | 'minimal'; // How much to explain
    rememberChoices: boolean; // Remember user's choices for similar situations
}

export interface DomainPattern {
    domain: string;
    successfulSelectors: Record<string, string>; // description -> selector
    failedSelectors: string[]; // Selectors that didn't work
    commonActions: string[]; // Frequently performed actions
    lastVisit: number;
    visitCount: number;
}

export interface CurrentTask {
    description: string;
    subtasks: Subtask[];
    currentSubtask: number;
    startTime: number;
}

export interface Subtask {
    id: string;
    description: string;
    steps: TaskStep[];
    completed: boolean;
    dependencies: string[];
}

const SESSION_STORAGE_KEY = 'aria_session_memory';
const PREFERENCES_STORAGE_KEY = 'aria_user_preferences';

/**
 * Generate session ID
 */
function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get default user preferences
 */
function getDefaultPreferences(): UserPreferences {
    return {
        preferredSearchEngines: {},
        commonFormValues: {},
        frequentTasks: {},
        domainPatterns: {},
        confirmationThreshold: 'always', // Per user preference: always confirm
        autoFillPreference: true,
        verbosity: 'normal',
        rememberChoices: true
    };
}

/**
 * Session Manager Class
 */
class SessionManager {
    private currentSession: SessionContext | null = null;
    private preferences: UserPreferences;

    constructor() {
        this.preferences = getDefaultPreferences();
        this.loadPreferences();
    }

    /**
     * Start new session
     */
    startSession(): SessionContext {
        this.currentSession = {
            sessionId: generateSessionId(),
            startTime: Date.now(),
            messages: [],
            completedTasks: [],
            failedTasks: [],
            userPreferences: this.preferences
        };

        this.saveSession();
        return this.currentSession;
    }

    /**
     * End current session
     */
    endSession(): void {
        if (this.currentSession) {
            this.currentSession.endTime = Date.now();
            this.saveSession();
            this.currentSession = null;
        }
    }

    /**
     * Get current session
     */
    getCurrentSession(): SessionContext | null {
        return this.currentSession;
    }

    /**
     * Add task execution to session
     */
    addTaskExecution(task: TaskExecution): void {
        if (!this.currentSession) return;

        if (task.success) {
            this.currentSession.completedTasks.push(task);
            this.learnFromSuccess(task);
        } else {
            this.currentSession.failedTasks.push(task);
            this.learnFromFailure(task);
        }

        this.saveSession();
    }

    /**
     * Learn from successful task execution
     */
    private learnFromSuccess(task: TaskExecution): void {
        // Track frequent tasks
        const taskKey = task.task.toLowerCase();
        this.preferences.frequentTasks[taskKey] = (this.preferences.frequentTasks[taskKey] || 0) + 1;

        // Track domain patterns
        const domain = task.domain;
        if (!this.preferences.domainPatterns[domain]) {
            this.preferences.domainPatterns[domain] = {
                domain,
                successfulSelectors: {},
                failedSelectors: [],
                commonActions: [],
                lastVisit: Date.now(),
                visitCount: 0
            };
        }

        const pattern = this.preferences.domainPatterns[domain];
        pattern.lastVisit = Date.now();
        pattern.visitCount++;

        // Learn successful selectors
        for (const step of task.steps) {
            if (step.success && step.target) {
                if (step.action === 'FIND' && step.value) {
                    pattern.successfulSelectors[step.value] = step.target;
                }
                pattern.commonActions.push(step.action);
            }
        }

        // Track search engine usage
        if (task.task.toLowerCase().includes('search') && domain) {
            this.preferences.preferredSearchEngines[domain] =
                (this.preferences.preferredSearchEngines[domain] || 0) + 1;
        }

        this.savePreferences();
    }

    /**
     * Learn from failed task execution
     */
    private learnFromFailure(task: TaskExecution): void {
        const domain = task.domain;
        if (!this.preferences.domainPatterns[domain]) {
            this.preferences.domainPatterns[domain] = {
                domain,
                successfulSelectors: {},
                failedSelectors: [],
                commonActions: [],
                lastVisit: Date.now(),
                visitCount: 0
            };
        }

        const pattern = this.preferences.domainPatterns[domain];

        // Track failed selectors
        for (const step of task.steps) {
            if (!step.success && step.target) {
                if (!pattern.failedSelectors.includes(step.target)) {
                    pattern.failedSelectors.push(step.target);
                }
            }
        }

        this.savePreferences();
    }

    /**
     * Get learned selector for domain + description
     */
    getLearnedSelector(domain: string, description: string): string | undefined {
        const pattern = this.preferences.domainPatterns[domain];
        return pattern?.successfulSelectors[description];
    }

    /**
     * Check if selector has failed before
     */
    hasFailedBefore(domain: string, selector: string): boolean {
        const pattern = this.preferences.domainPatterns[domain];
        return pattern?.failedSelectors.includes(selector) || false;
    }

    /**
     * Get most frequent tasks
     */
    getFrequentTasks(limit: number = 5): Array<{ task: string; count: number }> {
        return Object.entries(this.preferences.frequentTasks)
            .map(([task, count]) => ({ task, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Get preferred search engine
     */
    getPreferredSearchEngine(): string | undefined {
        const engines = Object.entries(this.preferences.preferredSearchEngines)
            .sort((a, b) => b[1] - a[1]);

        return engines[0]?.[0];
    }

    /**
     * Learn form field value
     */
    learnFormValue(fieldName: string, value: string): void {
        this.preferences.commonFormValues[fieldName.toLowerCase()] = value;
        this.savePreferences();
    }

    /**
     * Get learned form value
     */
    getLearnedFormValue(fieldName: string): string | undefined {
        return this.preferences.commonFormValues[fieldName.toLowerCase()];
    }

    /**
     * Update preference setting
     */
    updatePreference(key: keyof UserPreferences, value: any): void {
        (this.preferences as any)[key] = value;
        this.savePreferences();
    }

    /**
     * Get user preferences
     */
    getPreferences(): UserPreferences {
        return { ...this.preferences };
    }

    /**
     * Save session to storage
     */
    private async saveSession(): Promise<void> {
        if (!this.currentSession) return;

        try {
            await chrome.storage.local.set({
                [SESSION_STORAGE_KEY]: this.currentSession
            });
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    /**
     * Load session from storage
     */
    async loadSession(): Promise<SessionContext | null> {
        try {
            const data = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = data[SESSION_STORAGE_KEY];

            if (session) {
                this.currentSession = session;
                return session;
            }
        } catch (error) {
            console.error('Failed to load session:', error);
        }

        return null;
    }

    /**
     * Save preferences to storage
     */
    private async savePreferences(): Promise<void> {
        try {
            await chrome.storage.local.set({
                [PREFERENCES_STORAGE_KEY]: this.preferences
            });
        } catch (error) {
            console.error('Failed to save preferences:', error);
        }
    }

    /**
     * Load preferences from storage
     */
    async loadPreferences(): Promise<void> {
        try {
            const data = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY);
            const stored = data[PREFERENCES_STORAGE_KEY];

            if (stored) {
                this.preferences = { ...getDefaultPreferences(), ...stored };
            }
        } catch (error) {
            console.error('Failed to load preferences:', error);
        }
    }

    /**
     * Clear all session data
     */
    async clearAllSessions(): Promise<void> {
        this.currentSession = null;
        await chrome.storage.local.remove(SESSION_STORAGE_KEY);
    }

    /**
     * Clear learned preferences (reset learning)
     */
    async resetLearning(): Promise<void> {
        this.preferences = getDefaultPreferences();
        await this.savePreferences();
        conversation.addSystemMessage('🔄 Learning data has been reset');
    }

    /**
     * Export session data for debugging/backup
     */
    exportSessionData(): string {
        return JSON.stringify({
            currentSession: this.currentSession,
            preferences: this.preferences
        }, null, 2);
    }

    /**
     * Import session data from backup
     */
    async importSessionData(jsonData: string): Promise<void> {
        try {
            const data = JSON.parse(jsonData);

            if (data.preferences) {
                this.preferences = data.preferences;
                await this.savePreferences();
            }

            if (data.currentSession) {
                this.currentSession = data.currentSession;
                await this.saveSession();
            }

            conversation.addSystemMessage('✓ Session data imported successfully');
        } catch (error) {
            console.error('Failed to import session data:', error);
            conversation.addSystemMessage('✗ Failed to import session data: Invalid format');
        }
    }
}

// Singleton instance
export const sessionManager = new SessionManager();

/**
 * Get context for LLM (session history + preferences)
 */
export function getSessionContextForLLM(): string {
    const session = sessionManager.getCurrentSession();
    const prefs = sessionManager.getPreferences();

    if (!session) {
        return 'No active session';
    }

    let context = '';

    // Add recent successful tasks
    if (session.completedTasks.length > 0) {
        const recentTasks = session.completedTasks.slice(-3);
        context += `Recently completed tasks:\n${recentTasks.map(t => `- ${t.task}`).join('\n')}\n\n`;
    }

    // Add frequent tasks
    const frequentTasks = sessionManager.getFrequentTasks(3);
    if (frequentTasks.length > 0) {
        context += `Frequent tasks:\n${frequentTasks.map(t => `- ${t.task} (${t.count} times)`).join('\n')}\n\n`;
    }

    // Add preferred search engine
    const preferredEngine = sessionManager.getPreferredSearchEngine();
    if (preferredEngine) {
        context += `Preferred search engine: ${preferredEngine}\n\n`;
    }

    return context.trim() || 'No significant context';
}

/**
 * Initialize session manager
 */
export async function initializeSession(): Promise<void> {
    await sessionManager.loadPreferences();
    const existingSession = await sessionManager.loadSession();

    if (!existingSession) {
        sessionManager.startSession();
        conversation.addSystemMessage('✓ New session started');
    } else {
        conversation.addSystemMessage('✓ Session restored');
    }
}

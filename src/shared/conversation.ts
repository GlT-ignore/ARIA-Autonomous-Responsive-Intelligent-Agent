/**
 * Conversation Management System
 *
 * Handles bidirectional communication between user and assistant during task execution.
 * Provides message queue, state management, and conversation history.
 */

import { createId } from './types';

export type MessageType = 'user' | 'assistant' | 'system' | 'confirmation' | 'question';

export interface ConversationMessage {
    id: string;
    type: MessageType;
    content: string;
    timestamp: number;
    metadata?: {
        action?: string;
        requiresResponse?: boolean;
        options?: string[];
        severity?: 'low' | 'medium' | 'high';
        data?: any;
        isHtml?: boolean;
    };
}

export interface ConversationState {
    messages: ConversationMessage[];
    pendingResponse: boolean;
    currentQuestion?: ConversationMessage;
    currentConfirmation?: ConversationMessage;
}

class ConversationManager {
    private state: ConversationState;
    private listeners: Array<(state: ConversationState) => void>;
    private responseResolvers: Map<string, (response: any) => void>;

    constructor() {
        this.state = {
            messages: [],
            pendingResponse: false,
        };
        this.listeners = [];
        this.responseResolvers = new Map();
    }

    /**
     * Add a message to the conversation
     */
    addMessage(type: MessageType, content: string, metadata?: ConversationMessage['metadata']): ConversationMessage {
        const message: ConversationMessage = {
            id: createId(),
            type,
            content,
            timestamp: Date.now(),
            metadata,
        };

        this.state.messages.push(message);
        this.notifyListeners();

        return message;
    }

    /**
     * Add a user message
     */
    addUserMessage(content: string): ConversationMessage {
        return this.addMessage('user', content);
    }

    /**
     * Add an assistant message
     */
    addAssistantMessage(content: string, metadata?: ConversationMessage['metadata']): ConversationMessage {
        return this.addMessage('assistant', content, metadata);
    }

    /**
     * Add a system message (informational, low priority)
     */
    addSystemMessage(content: string): ConversationMessage {
        return this.addMessage('system', content);
    }

    /**
     * Ask the user a question and wait for response
     */
    async askQuestion(
        question: string,
        options?: string[],
        metadata?: ConversationMessage['metadata']
    ): Promise<string> {
        const message = this.addMessage('question', question, {
            ...metadata,
            requiresResponse: true,
            options,
        });

        this.state.pendingResponse = true;
        this.state.currentQuestion = message;
        this.notifyListeners();

        return new Promise((resolve) => {
            this.responseResolvers.set(message.id, resolve);
        });
    }

    /**
     * Request confirmation from user
     */
    async requestConfirmation(
        description: string,
        severity: 'low' | 'medium' | 'high',
        metadata?: ConversationMessage['metadata']
    ): Promise<boolean> {
        const message = this.addMessage('confirmation', description, {
            ...metadata,
            requiresResponse: true,
            severity,
        });

        this.state.pendingResponse = true;
        this.state.currentConfirmation = message;
        this.notifyListeners();

        return new Promise((resolve) => {
            this.responseResolvers.set(message.id, (response: boolean) => {
                resolve(response);
            });
        });
    }

    /**
     * Respond to a question or confirmation
     */
    respondToMessage(messageId: string, response: any): void {
        const resolver = this.responseResolvers.get(messageId);
        if (resolver) {
            resolver(response);
            this.responseResolvers.delete(messageId);
        }

        this.state.pendingResponse = false;
        this.state.currentQuestion = undefined;
        this.state.currentConfirmation = undefined;
        this.notifyListeners();

        // Add user's response as a message
        if (typeof response === 'string') {
            this.addUserMessage(response);
        } else if (typeof response === 'boolean') {
            this.addUserMessage(response ? 'Yes' : 'No');
        }
    }

    /**
     * Get conversation history
     */
    getMessages(): ConversationMessage[] {
        return [...this.state.messages];
    }

    /**
     * Get recent messages (last N)
     */
    getRecentMessages(count: number = 10): ConversationMessage[] {
        return this.state.messages.slice(-count);
    }

    /**
     * Get conversation context for LLM (formatted)
     */
    getConversationContext(maxMessages: number = 5): string {
        const recent = this.getRecentMessages(maxMessages);
        return recent
            .map((msg) => {
                const role = msg.type === 'user' ? 'User' : 'Assistant';
                return `${role}: ${msg.content}`;
            })
            .join('\n');
    }

    /**
     * Clear conversation history
     */
    clearHistory(): void {
        this.state.messages = [];
        this.notifyListeners();
    }

    /**
     * Get current state
     */
    getState(): ConversationState {
        return { ...this.state };
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: (state: ConversationState) => void): () => void {
        this.listeners.push(listener);

        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        this.listeners.forEach((listener) => listener(this.getState()));
    }

    /**
     * Check if waiting for user response
     */
    isPendingResponse(): boolean {
        return this.state.pendingResponse;
    }

    /**
     * Export conversation for debugging/logging
     */
    exportConversation(): string {
        return JSON.stringify(this.state.messages, null, 2);
    }

    /**
     * Import conversation from export
     */
    importConversation(json: string): void {
        try {
            const messages = JSON.parse(json);
            if (Array.isArray(messages)) {
                this.state.messages = messages;
                this.notifyListeners();
            }
        } catch (error) {
            console.error('Failed to import conversation:', error);
        }
    }
}

// Singleton instance
export const conversation = new ConversationManager();

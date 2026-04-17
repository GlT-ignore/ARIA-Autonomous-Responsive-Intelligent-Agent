/**
 * Chat Interface Component
 *
 * Reusable UI component for displaying and managing conversation messages.
 * Renders messages, handles user input, and manages confirmation/question dialogs.
 */

import { conversation, type ConversationMessage, type MessageType } from '../shared/conversation';

export class ChatInterface {
    private container: HTMLElement;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private unsubscribe?: () => void;

    constructor(containerId: string) {
        const element = document.getElementById(containerId);
        if (!element) {
            throw new Error(`Container element #${containerId} not found`);
        }
        this.container = element;
        this.messagesContainer = document.createElement('div');
        this.inputContainer = document.createElement('div');
        this.initialize();
    }

    /**
     * Initialize the chat interface
     */
    private initialize(): void {
        this.container.innerHTML = '';
        this.container.className = 'chat-interface';

        // Messages container
        this.messagesContainer.className = 'chat-messages';
        this.messagesContainer.id = 'chat-messages';
        this.container.appendChild(this.messagesContainer);

        // Input container (for questions/confirmations)
        this.inputContainer.className = 'chat-input-container';
        this.inputContainer.id = 'chat-input-container';
        this.inputContainer.style.display = 'none';
        this.container.appendChild(this.inputContainer);

        // Subscribe to conversation updates
        this.unsubscribe = conversation.subscribe((state) => {
            this.render(state.messages);
            this.handlePendingResponse(state);
        });

        // Initial render
        this.render(conversation.getMessages());
    }

    /**
     * Render messages
     */
    private render(messages: ConversationMessage[]): void {
        this.messagesContainer.innerHTML = '';

        // Show empty state when only system greeting exists
        const hasUserMessages = messages.some(m => m.type === 'user' || m.type === 'assistant');
        if (!hasUserMessages) {
            const emptyState = document.createElement('div');
            emptyState.className = 'chat-empty-state';
            emptyState.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--text-muted,#94a3b8);font-size:13px;opacity:0.7;">
                    <div style="font-size:32px;margin-bottom:12px;">&#x1F30D;</div>
                    <div>Type a task or press the mic to get started</div>
                    <div style="font-size:11px;margin-top:8px;">Try: "Search for cats on YouTube"</div>
                </div>
            `;
            this.messagesContainer.appendChild(emptyState);
        }

        messages.forEach((message) => {
            const messageEl = this.createMessageElement(message);
            this.messagesContainer.appendChild(messageEl);
        });

        // Auto-scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Create a message element
     */
    private createMessageElement(message: ConversationMessage): HTMLElement {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message chat-message-${message.type}`;
        messageEl.setAttribute('data-message-id', message.id);

        // Message content
        const contentEl = document.createElement('div');
        contentEl.className = 'chat-message-content';
        // Content (handle HTML if specified in metadata)
        if (message.metadata?.isHtml) {
            contentEl.innerHTML = message.content;
            // Delegate Copy button clicks inside rendered HTML (summary, extraction, etc.)
            // render() rebuilds all DOM on every update, so listeners must live here.
            contentEl.addEventListener('click', (e) => {
                const btn = (e.target as HTMLElement).closest('button[id^="copy-"]') as HTMLButtonElement | null;
                if (!btn) return;
                let text = '';
                if (btn.id === 'copy-summary') {
                    const summaryDiv = contentEl.querySelector('#summary-result') as HTMLElement | null;
                    text = summaryDiv?.innerText || summaryDiv?.textContent || '';
                }
                if (!text) return;
                navigator.clipboard.writeText(text).then(() => {
                    const prev = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = prev; }, 2000);
                }).catch(() => { });
            });
        } else {
            contentEl.textContent = message.content;
        }

        // Timestamp
        const timeEl = document.createElement('span');
        timeEl.className = 'chat-message-time';
        timeEl.textContent = new Date(message.timestamp).toLocaleTimeString();

        messageEl.appendChild(contentEl);
        messageEl.appendChild(timeEl);

        // Add icon based on type
        const icon = this.getMessageIcon(message.type);
        if (icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'chat-message-icon';
            iconEl.textContent = icon;
            messageEl.insertBefore(iconEl, contentEl);
        }

        return messageEl;
    }

    /**
     * Get icon for message type
     */
    private getMessageIcon(type: MessageType): string {
        switch (type) {
            case 'user':
                return '👤';
            case 'assistant':
                return '🤖';
            case 'system':
                return 'ℹ️';
            case 'confirmation':
                return '⚠️';
            case 'question':
                return '❓';
            default:
                return '';
        }
    }

    /**
     * Handle pending response (question or confirmation)
     */
    private handlePendingResponse(state: any): void {
        if (state.currentQuestion) {
            this.showQuestionInput(state.currentQuestion);
        } else if (state.currentConfirmation) {
            this.showConfirmationDialog(state.currentConfirmation);
        } else {
            this.inputContainer.style.display = 'none';
        }
    }

    /**
     * Show question input
     */
    private showQuestionInput(question: ConversationMessage): void {
        this.inputContainer.innerHTML = '';
        this.inputContainer.style.display = 'block';

        const formEl = document.createElement('div');
        formEl.className = 'chat-question-form';

        // If options provided, show as buttons
        if (question.metadata?.options && question.metadata.options.length > 0) {
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'chat-question-options';

            question.metadata.options.forEach((option) => {
                const btn = document.createElement('button');
                btn.className = 'btn-outline';
                btn.textContent = option;
                btn.onclick = () => {
                    conversation.respondToMessage(question.id, option);
                };
                optionsContainer.appendChild(btn);
            });

            formEl.appendChild(optionsContainer);
        } else {
            // Free-form text input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'chat-question-input';
            input.placeholder = 'Type your answer...';
            input.id = 'chat-response-input';

            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn-primary';
            submitBtn.textContent = 'Send';
            submitBtn.onclick = () => {
                const value = input.value.trim();
                if (value) {
                    conversation.respondToMessage(question.id, value);
                }
            };

            // Submit on Enter
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    submitBtn.click();
                }
            });

            formEl.appendChild(input);
            formEl.appendChild(submitBtn);

            // Auto-focus
            setTimeout(() => input.focus(), 100);
        }

        this.inputContainer.appendChild(formEl);
    }

    /**
     * Show confirmation dialog
     */
    private showConfirmationDialog(confirmation: ConversationMessage): void {
        this.inputContainer.innerHTML = '';
        this.inputContainer.style.display = 'block';

        const dialogEl = document.createElement('div');
        dialogEl.className = `chat-confirmation chat-confirmation-${confirmation.metadata?.severity || 'medium'}`;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'chat-confirmation-buttons';

        // Yes button
        const yesBtn = document.createElement('button');
        yesBtn.className = 'btn-primary';
        yesBtn.textContent = '✓ Confirm';
        yesBtn.onclick = () => {
            conversation.respondToMessage(confirmation.id, true);
        };

        // No button
        const noBtn = document.createElement('button');
        noBtn.className = 'btn-outline';
        noBtn.textContent = '✗ Cancel';
        noBtn.onclick = () => {
            conversation.respondToMessage(confirmation.id, false);
        };

        buttonsContainer.appendChild(yesBtn);
        buttonsContainer.appendChild(noBtn);
        dialogEl.appendChild(buttonsContainer);

        this.inputContainer.appendChild(dialogEl);
    }

    /**
     * Destroy the chat interface
     */
    destroy(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.container.innerHTML = '';
    }
}

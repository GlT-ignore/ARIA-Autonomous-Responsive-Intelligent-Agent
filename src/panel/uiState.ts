/**
 * UI State Module
 * Manages panel UI state: logging, progress, running state, chat initialization
 */

import { conversation } from '../shared/conversation';
import { ChatInterface } from '../components/ChatInterface';

export let stopRequested = false;

export const setStopRequested = (val: boolean) => {
	stopRequested = val;
};

export const log = (msg: unknown) => {
	const el = document.getElementById('log');
	if (el) el.textContent = `${el.textContent ?? ''}\n${JSON.stringify(msg)}`;
};

const progressEl = document.getElementById('progress');
export const updateProgress = (msg: string, percent?: number) => {
	if (progressEl) progressEl.textContent = msg;
	if (typeof percent === 'number') {
		const fill = document.getElementById('progress-fill');
		const pct = Math.max(0, Math.min(100, percent));
		if (fill) {
			fill.style.width = `${pct}%`;
			fill.setAttribute('aria-valuenow', String(Math.round(pct)));
		}
	}
};

export const setRunningUi = (running: boolean) => {
	const runBtn = document.getElementById('btn-run-task') as HTMLButtonElement | null;
	const stopBtn = document.getElementById('btn-stop') as HTMLButtonElement | null;
	const sendBtn = document.getElementById('btn-send') as HTMLButtonElement | null;
	const progressContainer = document.getElementById('progress-container');
	if (runBtn) runBtn.disabled = running;
	if (stopBtn) {
		stopBtn.disabled = !running;
		stopBtn.style.display = running ? 'flex' : 'none';
	}
	if (sendBtn) {
		sendBtn.style.display = running ? 'none' : 'flex';
	}
	if (progressContainer) progressContainer.style.display = running ? 'block' : 'none';
	if (!running) {
		const fill = document.getElementById('progress-fill');
		if (fill) fill.style.width = '0%';
		// Return focus to chat input after task completes
		(document.getElementById('chat-input') as HTMLInputElement | null)?.focus();
	}
};

export function initStopButton() {
	document.getElementById('btn-stop')?.addEventListener('click', (e) => {
		const btn = e.currentTarget as HTMLButtonElement | null;
		if (btn) btn.disabled = true;
		stopRequested = true;
		updateProgress('Stopping...');
	});
}

export function initChat(): ChatInterface | null {
	let chatInterface: ChatInterface | null = null;
	try {
		chatInterface = new ChatInterface('chat-container');
		conversation.addSystemMessage('ARIA Assistant ready. How can I help you today?');
	} catch (error) {
		console.error('Failed to initialize chat interface:', error);
	}
	return chatInterface;
}

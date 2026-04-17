/**
 * Panel Entry Point
 * Wires up all panel modules: UI state, settings, history, profile, task executor
 */

import { initStopButton, initChat, setStopRequested, updateProgress } from './uiState';
import { initSettings, initSaveButton } from './settingsManager';
import { updateHistoryStats, initHistoryButtons } from './historyManager';
import { initProfileButtons, autoLoadProfile } from './profileManager';
import { initDevControls, runTask, sendToActive } from './taskExecutor';
import { VoiceInput, registerQuickCommand, matchQuickCommand, speak } from './voice';

// Initialize UI
initStopButton();
initChat();

// Initialize dev/advanced controls
initDevControls();

// Task execution - wire up both the button and chat input
document.getElementById('btn-run-task')?.addEventListener('click', () => {
	const taskEl = document.getElementById('task') as HTMLInputElement;
	const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
	const taskText = taskEl?.value || chatInput?.value || '';
	if (taskText) {
		runTask(taskText);
		// Clear input after submission
		if (taskEl) taskEl.value = '';
		if (chatInput) {
			chatInput.value = '';
			chatInput.style.height = 'auto';
		}
	}
});

// Chat input submission (Enter key)
const mainChatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
mainChatInput?.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const start = mainChatInput.selectionStart;
			const end = mainChatInput.selectionEnd;
			mainChatInput.value = mainChatInput.value.substring(0, start) + '\n' + mainChatInput.value.substring(end);
			mainChatInput.selectionStart = mainChatInput.selectionEnd = start + 1;
			mainChatInput.dispatchEvent(new Event('input'));
		} else if (!e.shiftKey) {
			e.preventDefault();
			const text = mainChatInput.value.trim();
			if (text) {
				runTask(text);
				mainChatInput.value = '';
				mainChatInput.style.height = 'auto';
			}
		}
	}
});

mainChatInput?.addEventListener('input', function () {
	this.style.height = 'auto';
	this.style.height = `${this.scrollHeight}px`;
});

// Also support Enter on the legacy task input
document.getElementById('task')?.addEventListener('keypress', (e) => {
	if (e.key === 'Enter') {
		const input = e.target as HTMLInputElement;
		const text = input.value.trim();
		if (text) {
			runTask(text);
			input.value = '';
		}
	}
});

// Send button for chat
document.getElementById('btn-send')?.addEventListener('click', () => {
	const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
	const text = chatInput?.value?.trim();
	if (text) {
		runTask(text);
		chatInput.value = '';
		chatInput.style.height = 'auto';
	}
});

// Settings
(async () => {
	await initSettings();
})();
initSaveButton();

// History
updateHistoryStats();
initHistoryButtons();

// Profile
initProfileButtons();
(async () => {
	await autoLoadProfile();
})();

// Open options page via gear icon
document.getElementById('btn-settings')?.addEventListener('click', () => {
	chrome.runtime.openOptionsPage();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
	if (e.ctrlKey || e.metaKey) {
		switch (e.key) {
			case '.':
				e.preventDefault();
				document.getElementById('btn-stop')?.click();
				break;
			case 'm':
			case 'M':
				e.preventDefault();
				voiceInput?.toggle();
				break;
		}
	}
});

// ---- Voice Input (Phase 6) ----
const voiceBtnEl = document.getElementById('btn-voice') as HTMLButtonElement | null;
let ttsEnabled = false;

// Load TTS preference
chrome.storage.local.get('tts_enabled', (data) => {
	ttsEnabled = !!data['tts_enabled'];
});

// Register quick voice commands
registerQuickCommand('stop', () => {
	setStopRequested(true);
	updateProgress('Stopping...');
	speak('Stopping task.');
});

registerQuickCommand('scroll down', () => {
	sendToActive('SCROLL', { direction: 'down' });
	speak('Scrolling down.');
});

registerQuickCommand('scroll up', () => {
	sendToActive('SCROLL', { direction: 'up' });
	speak('Scrolling up.');
});

registerQuickCommand('go back', () => {
	sendToActive('GO_BACK');
	speak('Going back.');
});

const voiceInput = new VoiceInput(
	(transcript, isFinal) => {
		const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
		if (!chatInput) return;

		if (isFinal) {
			// Check for quick commands first
			const qc = matchQuickCommand(transcript);
			if (qc) {
				qc();
				chatInput.value = '';
				chatInput.style.height = 'auto';
				return;
			}

			// Submit as task
			chatInput.value = transcript;
			runTask(transcript);
			chatInput.value = '';
			chatInput.style.height = 'auto';
			if (ttsEnabled) speak(`Running: ${transcript.slice(0, 40)}`);
		} else {
			// Show interim results
			chatInput.value = transcript;
			chatInput.dispatchEvent(new Event('input'));
		}
	},
	(listening) => {
		if (voiceBtnEl) {
			voiceBtnEl.classList.toggle('listening', listening);
			voiceBtnEl.title = listening ? 'Listening...' : 'Voice input (Ctrl+M)';
		}
	}
);

voiceBtnEl?.addEventListener('click', () => voiceInput.toggle());

// ---- Settings Sync (Phase 3) ----
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local') {
		if (changes['llm_config'] || changes['agent_loop_config']) {
			initSettings(); // Re-load settings from storage
		}
		if (changes['tts_enabled']) {
			ttsEnabled = !!changes['tts_enabled'].newValue;
		}
	}
});

// Auto-focus chat input (Phase 7 - Accessibility)
const chatInputEl = document.getElementById('chat-input') as HTMLTextAreaElement | null;
if (chatInputEl) chatInputEl.focus();

/**
 * Voice Input Module
 * Push-to-talk speech recognition using Web Speech API
 */

// TypeScript declarations for webkitSpeechRecognition
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

declare class webkitSpeechRecognition {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

export type VoiceCallback = (transcript: string, isFinal: boolean) => void;

export class VoiceInput {
    private recognition: webkitSpeechRecognition | null = null;
    private isListening = false;
    private onResult: VoiceCallback;
    private onStateChange: (listening: boolean) => void;

    constructor(
        onResult: VoiceCallback,
        onStateChange: (listening: boolean) => void
    ) {
        this.onResult = onResult;
        this.onStateChange = onStateChange;
        this.init();
    }

    private init() {
        if (typeof webkitSpeechRecognition === 'undefined') {
            console.warn('[Voice] webkitSpeechRecognition not available');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false; // push-to-talk: single utterance
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.onStateChange(true);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.onStateChange(false);
        };

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result && result[0]) {
                    const transcript = result[0].transcript;
                    if (result.isFinal) {
                        final += transcript;
                    } else {
                        interim += transcript;
                    }
                }
            }

            if (final) {
                this.onResult(final.trim(), true);
            } else if (interim) {
                this.onResult(interim, false);
            }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[Voice] Error:', event.error);
            this.isListening = false;
            this.onStateChange(false);
        };
    }

    toggle() {
        if (!this.recognition) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    get listening(): boolean {
        return this.isListening;
    }

    get isSupported(): boolean {
        return this.recognition !== null;
    }
}

// ---- Quick voice commands (bypass LLM) ----
const QUICK_COMMANDS: Record<string, () => void> = {};

export function registerQuickCommand(phrase: string, action: () => void) {
    QUICK_COMMANDS[phrase.toLowerCase()] = action;
}

export function matchQuickCommand(transcript: string): (() => void) | null {
    const lower = transcript.toLowerCase().trim();
    for (const [phrase, action] of Object.entries(QUICK_COMMANDS)) {
        if (lower === phrase || lower.startsWith(phrase + ' ')) {
            return action;
        }
    }
    return null;
}

// ---- TTS ----
export function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    speechSynthesis.speak(utterance);
}

import { createId, type BusRequest, type BusResponse } from './shared/types';

chrome.runtime.onInstalled.addListener(() => {
    console.log('WebPilot installed');
    // Auto-open side panel on toolbar click
    // This avoids gesture timing issues and ensures default_path is used
    if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
    }
});

function getContentScriptFilesFromManifest(): string[] {
    const manifest = chrome.runtime.getManifest();
    const scripts = (manifest as any)?.content_scripts as Array<{ js?: string[] }> | undefined;
    if (!scripts?.length) return [];
    // Most builds have a single content_script entry.
    const firstWithJs = scripts.find((s) => Array.isArray(s.js) && s.js.length > 0);
    return firstWithJs?.js ?? [];
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
    const files = getContentScriptFilesFromManifest();
    if (!files.length) return;
    await chrome.scripting.executeScript({
        target: { tabId },
        files,
    });
}

function isNoReceiverError(err?: string): boolean {
    if (!err) return false;
    return /Receiving end does not exist|Could not establish connection|No receiver/i.test(err);
}

// Message router: panel/background -> active tab content script
chrome.runtime.onMessage.addListener((raw: any, sender: any, sendResponse: (response: any) => void) => {
    const request = raw as BusRequest | { type: string };
    if ((request as any)?.type === 'PING') {
        sendResponse({ ok: true, from: 'background' });
        return true;
    }

    if ((request as BusRequest)?.target === 'activeTab') {
        const id = (request as BusRequest).id ?? createId();
        const forward: BusRequest = { ...(request as BusRequest), id };

        (async () => {
            // Resolve the active tab id (works for sidepanel messages too).
            const tabId: number | undefined =
                sender.tab?.id ??
                (await new Promise<number | undefined>((resolve) => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => resolve(tabs[0]?.id));
                }));

            if (!tabId) {
                sendResponse({ id, success: false, error: 'No active tab' } as BusResponse);
                return;
            }

            // Handle navigation without needing a content script.
            if (forward.type === 'NAVIGATE') {
                const url = String((forward.payload as any)?.url || '');
                try {
                    await chrome.tabs.update(tabId, { url });
                    sendResponse({ id, success: true, data: { navigated: true, url } } as BusResponse);
                } catch (e) {
                    sendResponse({ id, success: false, error: String(e) } as BusResponse);
                }
                return;
            }

            const sendOnce = () =>
                new Promise<BusResponse>((resolve) => {
                    chrome.tabs.sendMessage(tabId, forward, (resp: BusResponse) => {
                        if (chrome.runtime.lastError) {
                            resolve({
                                id,
                                success: false,
                                error: chrome.runtime.lastError?.message || 'No receiver',
                            } as BusResponse);
                            return;
                        }
                        resolve(resp);
                    });
                });

            // First attempt.
            let resp = await sendOnce();

            // If there is no receiver, try to inject the content script and retry once.
            if (!resp.success && isNoReceiverError(resp.error)) {
                try {
                    await ensureContentScriptInjected(tabId);
                    resp = await sendOnce();
                } catch (e) {
                    const hint =
                        'Could not inject content script. If this is a restricted page (chrome://, edge://, Web Store) or site access is disabled, injection is not allowed.';
                    resp = {
                        id,
                        success: false,
                        error: `${resp.error || 'No receiver'} | ${hint} | details: ${String(e)}`,
                    } as BusResponse;
                }
            }

            sendResponse(resp);
        })();

        return true; // keep sendResponse channel open
    }
    return false;
});

// No manual action click handler needed when using openPanelOnActionClick



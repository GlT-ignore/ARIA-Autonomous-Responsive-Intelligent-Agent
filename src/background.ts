import { createId, type BusRequest, type BusResponse } from './shared/types';

chrome.runtime.onInstalled.addListener(() => {
    console.log('WebPilot installed');
    // Auto-open side panel on toolbar click
    // This avoids gesture timing issues and ensures default_path is used
    if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
});

// Message router: panel/background -> active tab content script
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const request = raw as BusRequest | { type: string };
    if ((request as any)?.type === 'PING') {
        sendResponse({ ok: true, from: 'background' });
        return true;
    }

    if ((request as BusRequest)?.target === 'activeTab') {
        const id = (request as BusRequest).id ?? createId();
        const forward: BusRequest = { ...request as BusRequest, id };
        const sendTo = (tabId: number) => {
            chrome.tabs.sendMessage(tabId, forward, (resp: BusResponse) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ id, success: false, error: chrome.runtime.lastError?.message || 'No receiver' } as BusResponse);
                    return;
                }
                sendResponse(resp);
            });
        };
        if (sender.tab?.id) {
            sendTo(sender.tab.id);
            return true;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) {
                sendResponse({ id, success: false, error: 'No active tab' } as BusResponse);
                return;
            }
            sendTo(tabId);
        });
        return true;
    }
    return false;
});

// No manual action click handler needed when using openPanelOnActionClick



/**
 * Options Page Script
 * Handles tab switching, settings save/load, profile management, history display
 */

import { loadLlmConfig, saveLlmConfig, loadAgentLoopConfig, saveAgentLoopConfig } from './shared/storage';
import { getHistoryStats, pruneTaskHistory, clearTaskHistory, loadAllTaskHistory } from './shared/storage';
import { loadUserProfile, saveUserProfile } from './shared/userProfile';

// ---- Tab switching ----
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const tabName = (tab as HTMLElement).dataset.tab;
        const panelId = `tab-${tabName}`;
        document.getElementById(panelId)?.classList.add('active');
        // Refresh history data when switching to history tab
        if (tabName === 'history') loadHistoryView();
    });
});

// ---- AI Settings ----
async function loadAISettings() {
    const cfg = await loadLlmConfig();

    // Auto-correct old Together AI endpoint on load
    if (cfg.baseUrl && cfg.baseUrl.includes('api.together.xyz')) {
        cfg.baseUrl = cfg.baseUrl.replace('api.together.xyz', 'api.together.ai');
        await saveLlmConfig(cfg);
    }

    (document.getElementById('llm-mode') as HTMLSelectElement).value = cfg.mode;
    (document.getElementById('llm-url') as HTMLInputElement).value = cfg.baseUrl || '';
    (document.getElementById('llm-key') as HTMLInputElement).value = cfg.apiKey || '';
    (document.getElementById('llm-model') as HTMLInputElement).value = cfg.model || '';
    (document.getElementById('detection-strategy') as HTMLSelectElement).value = cfg.detectionStrategy || 'dom';
    (document.getElementById('use-vision-fallback') as HTMLInputElement).checked = !!cfg.useVisionFallback;

    const agent = await loadAgentLoopConfig();
    (document.getElementById('agent-loop') as HTMLInputElement).checked = !!agent.enabled;
    (document.getElementById('agent-max') as HTMLInputElement).value = String(agent.maxIterations ?? 20);

    // TTS preference
    chrome.storage.local.get('tts_enabled', (data) => {
        (document.getElementById('tts-enabled') as HTMLInputElement).checked = !!data['tts_enabled'];
    });
}

document.getElementById('save-ai')?.addEventListener('click', async () => {
    const mode = (document.getElementById('llm-mode') as HTMLSelectElement).value as 'heuristic' | 'llm';
    let baseUrl = (document.getElementById('llm-url') as HTMLInputElement).value.trim();

    // Auto-correct old Together AI endpoint
    if (baseUrl.includes('api.together.xyz')) {
        baseUrl = baseUrl.replace('api.together.xyz', 'api.together.ai');
        (document.getElementById('llm-url') as HTMLInputElement).value = baseUrl; // Update UI
    }

    const apiKey = (document.getElementById('llm-key') as HTMLInputElement).value.trim();
    const model = (document.getElementById('llm-model') as HTMLInputElement).value.trim();
    const detectionStrategy = (document.getElementById('detection-strategy') as HTMLSelectElement).value as 'dom' | 'a11y' | 'vision';
    const useVisionFallback = (document.getElementById('use-vision-fallback') as HTMLInputElement).checked;

    await saveLlmConfig({ mode, baseUrl, apiKey, model, detectionStrategy, useVisionFallback });

    const enabled = (document.getElementById('agent-loop') as HTMLInputElement).checked;
    const maxIterations = parseInt((document.getElementById('agent-max') as HTMLInputElement).value || '20', 10);
    await saveAgentLoopConfig({ enabled, maxIterations: Number.isFinite(maxIterations) ? maxIterations : 20 });

    // TTS preference
    const ttsEnabled = (document.getElementById('tts-enabled') as HTMLInputElement).checked;
    await chrome.storage.local.set({ tts_enabled: ttsEnabled });

    // Show save status
    const status = document.getElementById('save-ai-status');
    if (status) { status.style.display = 'block'; setTimeout(() => status.style.display = 'none', 2000); }
});

// Test connection
document.getElementById('test-connection')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-connection') as HTMLButtonElement;
    const resultEl = document.getElementById('test-result');
    if (!resultEl) return;
    btn.disabled = true;
    btn.textContent = 'Testing...';
    resultEl.style.display = 'block';
    resultEl.className = 'test-result';
    resultEl.textContent = 'Testing...';

    const baseUrl = (document.getElementById('llm-url') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('llm-key') as HTMLInputElement).value.trim();
    const model = (document.getElementById('llm-model') as HTMLInputElement).value.trim();

    if (!baseUrl || !apiKey) {
        resultEl.className = 'test-result error';
        resultEl.textContent = 'Please enter API endpoint and key first.';
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model || 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Say "ok"' }],
                max_tokens: 5,
            }),
        });

        if (response.ok) {
            resultEl.className = 'test-result success';
            resultEl.textContent = `Connection successful! (${response.status})`;
        } else {
            const text = await response.text();
            resultEl.className = 'test-result error';
            resultEl.textContent = `Failed: ${response.status} - ${text.slice(0, 100)}`;
        }
    } catch (e) {
        resultEl.className = 'test-result error';
        resultEl.textContent = `Error: ${String(e)}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
    }
});

// ---- Profile ----
function getField(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
}

async function loadProfileForm() {
    const p = await loadUserProfile();
    getField('profile-firstName').value = p.personal.firstName;
    getField('profile-lastName').value = p.personal.lastName;
    getField('profile-email').value = p.personal.email;
    getField('profile-phone').value = p.personal.phone;
    getField('profile-location').value = p.personal.location;
    getField('profile-title').value = p.professional.currentTitle;
    getField('profile-experience').value = String(p.professional.yearsOfExperience || '');
    getField('profile-company').value = p.professional.currentCompany || '';
    getField('profile-degree').value = p.education?.degree || '';
    getField('profile-university').value = p.education?.university || '';
}

document.getElementById('save-profile')?.addEventListener('click', async () => {
    const profile = {
        personal: {
            firstName: getField('profile-firstName').value,
            lastName: getField('profile-lastName').value,
            fullName: `${getField('profile-firstName').value} ${getField('profile-lastName').value}`.trim(),
            email: getField('profile-email').value,
            phone: getField('profile-phone').value,
            location: getField('profile-location').value,
        },
        professional: {
            currentTitle: getField('profile-title').value,
            yearsOfExperience: parseInt(getField('profile-experience').value || '0'),
            currentCompany: getField('profile-company').value,
            resumeFileName: '',
            coverLetter: '',
        },
        preferences: {
            employmentTypes: ['Full-time'],
            workArrangement: ['Remote', 'Hybrid'],
            willingToRelocate: false,
            requiresSponsorship: false,
        },
        education: {
            degree: getField('profile-degree').value,
            fieldOfStudy: '',
            university: getField('profile-university').value,
            graduationYear: new Date().getFullYear(),
        },
    };

    await saveUserProfile(profile);
    const status = document.getElementById('save-profile-status');
    if (status) { status.style.display = 'block'; setTimeout(() => status.style.display = 'none', 2000); }
});

document.getElementById('load-profile')?.addEventListener('click', loadProfileForm);

// ---- History ----
async function loadHistoryView() {
    const stats = await getHistoryStats();
    const statsEl = document.getElementById('history-stats');
    if (statsEl) {
        const sizeMB = (stats.storageSize / 1024 / 1024).toFixed(2);
        statsEl.textContent = `${stats.totalEntries} patterns | ${stats.totalSuccesses} successes | ${sizeMB} MB used`;
    }

    const allHistory = await loadAllTaskHistory();
    const tableEl = document.getElementById('history-table');
    if (tableEl) {
        if (allHistory.length === 0) {
            tableEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No task history yet.</p>';
        } else {
            const rows = allHistory.slice(0, 50).map(entry => `
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 8px 0; font-size: 12px;">${entry.taskDescription.slice(0, 60)}</td>
					<td style="padding: 8px 0; font-size: 12px; text-align: center;">${entry.successCount}</td>
					<td style="padding: 8px 0; font-size: 12px; text-align: center;">${Math.round(entry.confidence * 100)}%</td>
					<td style="padding: 8px 0; font-size: 12px; text-align: right; color: var(--text-muted);">${new Date(entry.lastExecuted).toLocaleDateString()}</td>
				</tr>
			`).join('');
            tableEl.innerHTML = `
				<table style="width: 100%; border-collapse: collapse;">
					<thead><tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 11px;">
						<th style="text-align: left; padding: 8px 0;">Task</th>
						<th style="text-align: center; padding: 8px 0;">Successes</th>
						<th style="text-align: center; padding: 8px 0;">Confidence</th>
						<th style="text-align: right; padding: 8px 0;">Last Run</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			`;
        }
    }
}

document.getElementById('export-history')?.addEventListener('click', async () => {
    const allHistory = await loadAllTaskHistory();
    const blob = new Blob([JSON.stringify(allHistory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aria-history-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
});

document.getElementById('prune-history')?.addEventListener('click', async () => {
    await pruneTaskHistory();
    await loadHistoryView();
});

document.getElementById('clear-history')?.addEventListener('click', async () => {
    if (confirm('Clear ALL task history? This cannot be undone.')) {
        await clearTaskHistory();
        await loadHistoryView();
    }
});

// ---- Init ----
(async () => {
    await loadAISettings();
    await loadProfileForm();
    await loadHistoryView();
})();

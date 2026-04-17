/**
 * History Manager Module
 * Handles task history UI: stats display, view, prune, clear
 */

import { getHistoryStats, pruneTaskHistory, clearTaskHistory, loadAllTaskHistory } from '../shared/storage';
import { log } from './uiState';

export async function updateHistoryStats() {
	try {
		const stats = await getHistoryStats();
		const statsEl = document.getElementById('history-stats');
		if (statsEl) {
			const sizeMB = (stats.storageSize / 1024 / 1024).toFixed(2);
			statsEl.textContent = `${stats.totalEntries} patterns | ${stats.totalSuccesses} successes | ${sizeMB} MB`;
		}
	} catch (error) {
		log({ error: 'Failed to load history stats', details: String(error) });
	}
}

export function initHistoryButtons() {
	document.getElementById('view-history')?.addEventListener('click', async () => {
		try {
			const allHistory = await loadAllTaskHistory();
			log({ historyCount: allHistory.length });
			allHistory.slice(0, 10).forEach(entry => {
				log({
					task: entry.taskDescription,
					successes: entry.successCount,
					confidence: entry.confidence,
					lastUsed: new Date(entry.lastExecuted).toLocaleDateString()
				});
			});
		} catch (error) {
			log({ error: 'Failed to load history', details: String(error) });
		}
	});

	document.getElementById('prune-history')?.addEventListener('click', async () => {
		try {
			const pruned = await pruneTaskHistory();
			log({ pruned: `Removed ${pruned} old patterns` });
			await updateHistoryStats();
		} catch (error) {
			log({ error: 'Failed to prune history', details: String(error) });
		}
	});

	document.getElementById('clear-history')?.addEventListener('click', async () => {
		if (confirm('Clear all task history? This cannot be undone.')) {
			try {
				await clearTaskHistory();
				log({ info: 'All history cleared' });
				await updateHistoryStats();
			} catch (error) {
				log({ error: 'Failed to clear history', details: String(error) });
			}
		}
	});
}

/**
 * Settings Manager Module
 * Settings UI has moved to the Options Page (src/options.ts).
 * This module is kept as a thin wrapper so panel/index.ts imports don't break,
 * and to handle any future panel-side settings sync if needed.
 */

export async function initSettings() {
	// Settings are now managed in the Options page.
	// Nothing to populate in the side panel.
}

export function initSaveButton() {
	// No-op: save button is in the Options page.
}

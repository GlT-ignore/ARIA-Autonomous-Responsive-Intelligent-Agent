import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
	manifest_version: 3,
	name: 'WebPilot',
	description: 'Agentic Task Solver for multi-turn web automation',
	version: '0.0.1',
	permissions: ['storage', 'scripting', 'activeTab', 'sidePanel', 'tabs', 'automation'],
	host_permissions: ['<all_urls>'],
	action: {
		default_title: 'WebPilot',
	},
	background: {
		service_worker: 'src/background.ts',
		type: 'module',
	},
	content_scripts: [
		{
			// Stealth mode injection - runs FIRST (before page scripts)
			matches: ['<all_urls>'],
			js: ['src/stealth-inject.ts'],
			run_at: 'document_start',
			all_frames: false,
			world: 'MAIN' // Inject into page context, not extension context
		},
		{
			// Main content script - runs after page loads
			matches: ['<all_urls>'],
			js: ['src/content.ts'],
			run_at: 'document_idle',
			all_frames: true,
		},
	],
	web_accessible_resources: [
		{
			resources: ['src/panel.html'],
			matches: ['<all_urls>'],
		},
	],
	side_panel: {
		default_path: 'src/panel.html',
	},
};

export default manifest;



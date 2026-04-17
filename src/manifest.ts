import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
	manifest_version: 3,
	name: 'ARIA - Personal AI Assistant',
	description: 'Your intelligent personal assistant for web automation and task management',
	version: '1.1.4',
	permissions: ['storage', 'scripting', 'activeTab', 'sidePanel', 'tabs'],
	host_permissions: ['<all_urls>'],
	action: {
		default_title: 'ARIA Assistant',
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
			resources: ['src/panel.html', 'src/options.html'],
			matches: ['<all_urls>'],
		},
	],
	side_panel: {
		default_path: 'src/panel.html',
	},
	options_page: 'src/options.html',
};

export default manifest;



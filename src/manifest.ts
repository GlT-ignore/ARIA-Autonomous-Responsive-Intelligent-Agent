import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
	manifest_version: 3,
	name: 'WebPilot',
	description: 'Agentic Task Solver for multi-turn web automation',
	version: '0.0.1',
	permissions: ['storage', 'scripting', 'activeTab', 'sidePanel', 'tabs'],
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
			matches: ['<all_urls>'],
			js: ['src/content.ts'],
			run_at: 'document_idle',
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



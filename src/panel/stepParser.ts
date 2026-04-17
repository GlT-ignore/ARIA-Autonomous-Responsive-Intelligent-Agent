/**
 * Step Parser Module
 * Parses LLM output into executable automation steps
 */

export type InternalStep = {
	action: string;
	target?: string | undefined;
	value?: string | undefined;
	url?: string | undefined;
};

const HTML_TAGS = new Set([
	'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
	'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
	'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
	'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend',
	'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object',
	'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp',
	'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong',
	'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
	'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
]);

export const normalizeSelector = (raw: string | undefined | null): string => {
	const s = (raw || '').trim();
	if (!s) return '';
	if (/[#.[\] >,:()"'=]/.test(s)) return s;
	const lower = s.toLowerCase();
	if (HTML_TAGS.has(lower)) return lower;
	if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(s)) {
		// Custom elements always have a hyphen. Treat them as tags, not IDs.
		if (s.includes('-')) return s;
		return `#${s}`;
	}
	return s;
};

export const extractNavigateUrl = (line: string): string | null => {
	const m = line.trim().match(/^NAVIGATE[\s:]+(.+)$/i);
	if (!m || !m[1]) return null;
	let url = m[1].trim();
	url = url.replace(/^url\s*=\s*/i, '').replace(/^url\s*:\s*/i, '').trim();
	if (!url) return null;
	const urlToken =
		url.match(/https?:\/\/\S+/i)?.[0] ??
		url.match(/\/\/\S+/)?.[0] ??
		url.match(/www\.\S+/i)?.[0] ??
		url;
	return urlToken.replace(/[)\],.]+$/g, '').trim();
};

export const normalizeUrl = (raw: string): string | null => {
	let url = (raw || '').trim();
	if (!url) return null;
	if (/^https?:?$/i.test(url) || /^http$/i.test(url)) return null;
	url = url.replace(/^url\s*=\s*/i, '').replace(/^url\s*:\s*/i, '').trim();
	if (/^https?:\/\//i.test(url)) return url;
	if (url.startsWith('//')) return `https:${url}`;
	if (/^www\./i.test(url)) return `https://${url}`;
	if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
	return null;
};

export const parseLineToStep = (line: string): InternalStep | null => {
	const trimmed = (line || '').trim();
	if (!trimmed) return null;
	if (/^DONE\b/i.test(trimmed)) return { action: 'DONE' };

	const navUrl = extractNavigateUrl(trimmed);
	if (navUrl) return { action: 'NAVIGATE', url: navUrl };

	const m = trimmed.match(/^(FIND|TYPE|CLICK|WAIT|SELECT|UPLOAD|PRESS_ENTER)\s*:\s*(.+)$/i);
	if (!m || !m[1]) return null;
	const action = m[1].toUpperCase();
	const rest = (m[2] || '').trim();

	const idx = rest.indexOf(':');
	const target = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
	const value = (idx >= 0 ? rest.slice(idx + 1) : '').trim();

	if (action === 'TYPE') {
		const selector = target?.split('->')[1] || target || 'AUTO';
		return { action, target: normalizeSelector(selector), value };
	}
	if (action === 'FIND') {
		const parts = target.split('->');
		const desc = parts[0]?.trim() || '';
		const selector = parts[1]?.trim() || '';
		return { action, target: selector ? normalizeSelector(selector) : '', value: desc || target };
	}
	if (action === 'SELECT') {
		const selector = target?.split('->')[1] || target || 'AUTO';
		return { action, target: normalizeSelector(selector), value };
	}
	if (action === 'UPLOAD') {
		return { action, target, value };
	}
	if (action === 'PRESS_ENTER') {
		const selector = target?.split('->')[1] || target || 'AUTO';
		return { action, target: normalizeSelector(selector) };
	}
	if (action === 'WAIT') {
		const ms = (/^\d+$/.test(target) ? target : /^\d+$/.test(value) ? value : target || value);
		return { action, value: ms };
	}
	// CLICK
	const selector = target?.split('->')[1] || target || 'AUTO';
	return { action, target: normalizeSelector(selector) };
};

/**
 * Parse multi-line LLM response into steps
 */
export const parseLLMResponse = (text: string): InternalStep[] => {
	const steps: InternalStep[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const navUrl = extractNavigateUrl(trimmed);
		if (navUrl) {
			steps.push({ action: 'NAVIGATE', url: navUrl });
			continue;
		}

		const m = trimmed.match(/^(FIND|TYPE|CLICK|WAIT|SELECT|UPLOAD|PRESS_ENTER)\s*:\s*(.+)$/i);
		if (!m || !m[1]) continue;
		const action = m[1].toUpperCase();
		const rest = (m[2] || '').trim();

		const idx = rest.indexOf(':');
		const target = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
		const value = (idx >= 0 ? rest.slice(idx + 1) : '').trim();

		if (action === 'TYPE') {
			const selector = target?.split('->')[1] || target || 'AUTO';
			steps.push({ action, target: normalizeSelector(selector), value });
		} else if (action === 'FIND') {
			const parts = target.split('->');
			const desc = parts[0]?.trim() || '';
			const selector = parts[1]?.trim() || '';
			steps.push({ action, target: selector ? normalizeSelector(selector) : '', value: desc || target });
		} else if (action === 'SELECT') {
			const selector = target?.split('->')[1] || target || 'AUTO';
			steps.push({ action, target: normalizeSelector(selector), value });
		} else if (action === 'UPLOAD') {
			steps.push({ action, target, value });
		} else if (action === 'PRESS_ENTER') {
			const selector = target?.split('->')[1] || target || 'AUTO';
			steps.push({ action, target: normalizeSelector(selector) });
		} else if (action === 'WAIT') {
			const ms = (/^\d+$/.test(target) ? target : /^\d+$/.test(value) ? value : target || value);
			steps.push({ action, value: ms });
		} else {
			// CLICK
			const selector = target?.split('->')[1] || target || 'AUTO';
			steps.push({ action, target: normalizeSelector(selector) });
		}
	}
	return steps;
};

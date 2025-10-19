import { type BusRequest, type BusResponse } from './shared/types';

(() => {
    console.log('WebPilot content loaded');

    // Recursively find element across all shadow roots
    const queryDeep = (selector: string, root: Document | ShadowRoot = document): Element | null => {
        try {
            const direct = root.querySelector(selector);
            if (direct) return direct;
        } catch (e) {
            // invalid selector
        }
        const all = root.querySelectorAll('*');
        for (const el of all) {
            if (el.shadowRoot) {
                const found = queryDeep(selector, el.shadowRoot);
                if (found) return found;
            }
        }
        return null;
    };

    const click = (selector: string) => {
        const el = queryDeep(selector) as HTMLElement | null;
        if (!el) throw new Error('Element not found');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
    };

    const typeText = async (selector: string, text: string) => {
        await waitFor(selector, 5000);
        const el = queryDeep(selector) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) throw new Error('Input not found');
        el.focus();
        el.value = '';
        for (const ch of text) {
            el.value += ch;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
        }
        return true;
    };

    const waitFor = (selector: string, timeout = 5000) => new Promise<boolean>((resolve, reject) => {
        const start = performance.now();
        const check = () => {
            if (queryDeep(selector)) return resolve(true);
            if (performance.now() - start > timeout) return reject(new Error('Timeout'));
            requestAnimationFrame(check);
        };
        check();
    });

    const highlight = (selector: string) => {
        const el = queryDeep(selector) as HTMLElement | null;
        if (!el) throw new Error('Element not found');
        const rect = el.getBoundingClientRect();
        const overlayId = '__webpilot_overlay__';
        document.getElementById(overlayId)?.remove();
        const box = document.createElement('div');
        box.id = overlayId;
        box.style.position = 'fixed';
        box.style.left = `${Math.max(0, rect.left)}px`;
        box.style.top = `${Math.max(0, rect.top)}px`;
        box.style.width = `${Math.max(0, rect.width)}px`;
        box.style.height = `${Math.max(0, rect.height)}px`;
        box.style.border = '2px solid #4f46e5';
        box.style.borderRadius = '4px';
        box.style.zIndex = '2147483647';
        box.style.pointerEvents = 'none';
        document.body.appendChild(box);
        setTimeout(() => box.remove(), 1000);
        return true;
    };

    const navigate = (url: string) => {
        try {
            if (location.href === url) return true;
            window.location.assign(url);
        } catch {
            window.location.href = url;
        }
        return true;
    };

    // Network-idle + DOM-settle wait (inspired by Playwright)
    const waitForPageReady = (timeout = 8000) => new Promise<boolean>((resolve) => {
        const start = performance.now();
        let pendingFetch = 0;
        let lastMutation = Date.now();
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            pendingFetch++;
            return originalFetch.apply(this, args).finally(() => { pendingFetch--; });
        };
        const obs = new MutationObserver(() => { lastMutation = Date.now(); });
        obs.observe(document.body, { childList: true, subtree: true });
        const check = () => {
            const elapsed = performance.now() - start;
            if (elapsed > timeout) {
                window.fetch = originalFetch;
                obs.disconnect();
                resolve(true);
                return;
            }
            const idle = pendingFetch === 0 && (Date.now() - lastMutation > 500);
            if (idle && document.readyState === 'complete') {
                window.fetch = originalFetch;
                obs.disconnect();
                resolve(true);
                return;
            }
            requestAnimationFrame(check);
        };
        check();
    });

    // Build a simplified DOM snapshot for LLM selector generation
    const allDeep = (root: Document | ShadowRoot): Element[] => {
        const acc: Element[] = [];
        const walk = (node: Document | ShadowRoot | Element) => {
            let iter: Iterable<Element> = [];
            if ((node as Document | ShadowRoot).querySelectorAll) {
                iter = (node as Document | ShadowRoot).querySelectorAll('*');
            }
            for (const el of iter) {
                acc.push(el);
                const sr = (el as HTMLElement).shadowRoot;
                if (sr) walk(sr);
            }
        };
        walk(root);
        return acc;
    };

    const buildSnapshot = () => {
        const candidatesSelector = 'button, a, input, select, textarea, [role="button"], [aria-label], [onclick]';
        const elements = allDeep(document)
            .filter((el) => {
                if (!(el as Element).matches?.(candidatesSelector)) return false;
                const rect = (el as HTMLElement).getBoundingClientRect?.();
                const computed = getComputedStyle(el as HTMLElement);
                return rect && rect.width > 0 && rect.height > 0 && computed.visibility !== 'hidden' && computed.display !== 'none';
            })
            .slice(0, 200)
            .map((el) => {
                const rect = (el as HTMLElement).getBoundingClientRect?.();
                const text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                const attrs: Record<string, string | null> = {
                    id: (el as HTMLElement).id || null,
                    name: (el as HTMLElement).getAttribute('name'),
                    type: (el as HTMLElement).getAttribute('type'),
                    role: (el as HTMLElement).getAttribute('role'),
                    ariaLabel: (el as HTMLElement).getAttribute('aria-label'),
                    placeholder: (el as HTMLInputElement).placeholder || null,
                    value: (el as HTMLInputElement).value || null,
                    title: (el as HTMLElement).title || null,
                    classes: (el as HTMLElement).className?.toString() || null,
                };
                const guess = getUniqueSelector(el) || '';
                return {
                    tag: el.tagName.toLowerCase(),
                    attrs,
                    text,
                    rect: rect ? { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
                    guess,
                };
            });
        return { url: location.href, title: document.title, elements };
    };

    // Multi-strategy element finder
    const isInteractable = (el: Element | null) => {
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect?.();
        return !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(el as Element as HTMLElement).visibility !== 'hidden';
    };

    const findBySemantic = (desc: string): Element | null => {
        const lower = desc.toLowerCase();
        const mapping: Record<string, string[]> = {
            'search box': [
                'ytd-searchbox input.ytSearchboxComponentInput',
                'ytd-searchbox input#search',
                'input[aria-label="Search"]',
                'input[type="search"]',
                'input#twotabsearchtextbox',
                'input#nav-search-bar-input',
                'input[placeholder*="Search" i]',
                'ytd-searchbox input'
            ],
            'search button': [
                'button#search-icon-legacy',
                'button[aria-label="Search"]',
                'input#nav-search-submit-button',
                'button#nav-search-submit-button'
            ],
            'subscribe button': ['ytd-subscribe-button-renderer button', 'tp-yt-paper-button[aria-label*="Subscribe"]'],
        };
        const preferInputs = /(box|input|field|bar)/.test(lower);
        // Site-specific: YouTube search input often lives inside ytd-searchbox shadow root
        if (preferInputs && /search/.test(lower)) {
            const host = document.querySelector('ytd-searchbox') as any;
            const sr: ShadowRoot | null = host?.shadowRoot ?? null;
            if (sr) {
                const ytInput = sr.querySelector('input.ytSearchboxComponentInput, input#search, input[aria-label="Search"], input[type="search"]');
                if (isInteractable(ytInput)) return ytInput as Element;
            }
        }
        // Sort by longest key first to match "search button" before "search box"
        const entries = Object.entries(mapping).sort((a, b) => b[0].length - a[0].length);
        for (const [key, selectors] of entries) {
            if (lower.includes(key)) {
                for (const sel of selectors) {
                    const el = queryDeep(sel);
                    if (!isInteractable(el)) continue;
                    if (preferInputs && (el as HTMLElement).tagName.toLowerCase() !== 'input') continue;
                    return el!;
                }
            }
        }
        return null;
    };

    const findByText = (desc: string): Element | null => {
        const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
        let node: Node | null = walker.currentNode;
        while ((node = walker.nextNode())) {
            const el = node as HTMLElement;
            const text = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (text && text.includes(desc.toLowerCase()) && isInteractable(el)) return el;
        }
        return null;
    };

    const findByProximity = (desc: string): Element | null => {
        const labels = Array.from(document.querySelectorAll('label,span,div,button,a')).filter(el => (el.textContent || '').toLowerCase().includes(desc.toLowerCase()));
        for (const label of labels) {
            const forAttr = (label as HTMLElement).getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (isInteractable(input)) return input!;
            }
            const nearby = (label.parentElement || document.body).querySelector('input,button,select,textarea');
            if (isInteractable(nearby)) return nearby!;
        }
        return null;
    };

    const finderCache = new Map<string, string>();
    const findElementByDescription = (desc: string): string | null => {
        const cached = finderCache.get(desc);
        if (cached && queryDeep(cached)) return cached;
        const strategies = [findBySemantic, findByProximity, findByText];
        const preferInputs = /(box|input|field|bar)/.test(desc.toLowerCase());
        for (const strat of strategies) {
            const el = strat(desc);
            if (isInteractable(el)) {
                if (preferInputs) {
                    const tag = (el as HTMLElement).tagName.toLowerCase();
                    if (tag !== 'input' && tag !== 'textarea') continue;
                }
                const selector = getUniqueSelector(el!);
                if (selector) {
                    finderCache.set(desc, selector);
                    return selector;
                }
            }
        }
        return null;
    };

    // Create a simple unique selector for caching
    const getUniqueSelector = (el: Element): string | null => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const name = (el as HTMLElement).getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        const aria = (el as HTMLElement).getAttribute('aria-label');
        if (aria) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
        // fallback to tag + class
        const cls = (el as HTMLElement).className?.toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
        return null;
    };

    chrome.runtime.onMessage.addListener((raw: BusRequest, _sender, sendResponse) => {
        const { type: msgType, payload } = raw || {} as BusRequest;
        const respond = (ok: boolean, data?: unknown, error?: string) => sendResponse({ id: raw?.id, success: ok, data, error } as BusResponse);

        try {
            if (msgType === 'ANALYZE_PAGE') {
                respond(true, { url: location.href, title: document.title });
                return true;
            }
            if (msgType === 'CLICK') {
                respond(true, click((payload as any).selector));
                return true;
            }
            if (msgType === 'TYPE') {
                typeText((payload as any).selector, (payload as any).text).then((r) => respond(true, r)).catch((e) => respond(false, undefined, String(e)));
                return true;
            }
            if (msgType === 'WAIT') {
                waitFor((payload as any).selector, (payload as any).timeout).then((r) => respond(true, r)).catch((e) => respond(false, undefined, String(e)));
                return true;
            }
            if (msgType === 'HIGHLIGHT') {
                respond(true, highlight((payload as any).selector));
                return true;
            }
            if (msgType === 'NAVIGATE') {
                respond(true, navigate(String((payload as any).url || '')));
                return true;
            }
            if (msgType === 'PAGE_READY') {
                waitForPageReady((payload as any)?.timeout || 8000).then((r) => respond(true, r)).catch((e) => respond(false, undefined, String(e)));
                return true;
            }
            if (msgType === 'PING_CONTENT') {
                respond(true, { ready: true, url: location.href });
                return true;
            }
            if (msgType === 'FIND') {
                const sel = findElementByDescription(String((payload as any).description || ''));
                if (!sel) { respond(false, undefined, 'Not found'); return true; }
                respond(true, { selector: sel });
                return true;
            }
            if (msgType === 'SNAPSHOT') {
                respond(true, buildSnapshot());
                return true;
            }
        } catch (e) {
            respond(false, undefined, String(e));
            return true;
        }
        return false;
    });
})();



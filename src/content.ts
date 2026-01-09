import { type BusRequest, type BusResponse } from './shared/types';
import { enableStealthMode, needsStealthMode } from './shared/stealth';

(() => {
    console.log('WebPilot content loaded');
    
    // Enable stealth mode for sites with anti-bot protection
    if (needsStealthMode(window.location.href)) {
        console.log('[Stealth] Enabling anti-detection for:', window.location.hostname);
        enableStealthMode();
    }

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
        let el = queryDeep(selector) as HTMLElement | null;
        if (!el) {
            // Try self-healing selectors
            el = tryFuzzySelectors(selector) as HTMLElement | null;
        }
        if (!el) throw new Error('Element not found');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
    };

    const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        // Use the native setter so frameworks like React detect the change reliably.
        const proto =
            el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc?.set) desc.set.call(el, value);
        else (el as any).value = value;
    };

    const dispatchInputEvents = (el: HTMLElement) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const typeText = async (selector: string, text: string) => {
        await waitFor(selector, 5000);
        let target = queryDeep(selector) as HTMLElement | null;
        if (!target) {
            // Try self-healing selectors
            target = tryFuzzySelectors(selector) as HTMLElement | null;
        }
        if (!target) throw new Error('Input not found');

        target.focus();

        // Support contenteditable targets too (some sites use div[contenteditable]).
        const isContentEditable =
            (target as any).isContentEditable === true || target.getAttribute('contenteditable') === 'true';

        if (isContentEditable) {
            // Replace content in one shot and fire input/change.
            (target as HTMLElement).textContent = text;
            dispatchInputEvents(target);
            return true;
        }

        const el = target as HTMLInputElement | HTMLTextAreaElement;
        // Clear first (and dispatch), then set value in one shot to avoid mangling/duplication by site listeners.
        setNativeValue(el, '');
        dispatchInputEvents(el);
        setNativeValue(el, text);
        try {
            // Put caret at end for better compatibility with some handlers.
            if (typeof (el as any).setSelectionRange === 'function') {
                (el as any).setSelectionRange(text.length, text.length);
            }
        } catch {
            // ignore
        }
        dispatchInputEvents(el);
        return true;
    };

    const waitFor = (selector: string, timeout = 5000) => new Promise<boolean>((resolve, reject) => {
        const start = performance.now();
        const check = () => {
            if (queryDeep(selector) || tryFuzzySelectors(selector)) return resolve(true);
            if (performance.now() - start > timeout) return reject(new Error('Timeout'));
            requestAnimationFrame(check);
        };
        check();
    });

    const highlight = (selector: string) => {
        let el = queryDeep(selector) as HTMLElement | null;
        if (!el) {
            // Try self-healing selectors
            el = tryFuzzySelectors(selector) as HTMLElement | null;
        }
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

    // Edge case handlers
    
    /**
     * Dismiss modals and popups automatically
     */
    const dismissModals = (): boolean => {
        const dismissSelectors = [
            'button[aria-label*="Close" i]',
            'button[aria-label*="Dismiss" i]',
            'button.close',
            '[data-dismiss="modal"]',
            '[data-dismiss="dialog"]',
            'div[role="dialog"] button:last-child',
            'button[class*="close" i]',
            'button[class*="dismiss" i]',
            '[aria-label*="No thanks" i]',
            'button:has-text("Close")',
            'button:has-text("×")'
        ];

        for (const sel of dismissSelectors) {
            try {
                const btn = queryDeep(sel) || tryFuzzySelectors(sel);
                if (btn && isInteractable(btn)) {
                    (btn as HTMLElement).click();
                    console.log('Dismissed modal/popup using selector:', sel);
                    return true;
                }
            } catch {
                // Continue trying other selectors
            }
        }

        return false;
    };

    /**
     * Ensure element is loaded (handle lazy loading)
     */
    const ensureElementLoaded = async (selector: string, maxScrolls: number = 10): Promise<boolean> => {
        // Check if element already exists
        if (queryDeep(selector) || tryFuzzySelectors(selector)) {
            return true;
        }

        // Scroll down in chunks until found or max scrolls reached
        const viewportHeight = window.innerHeight;
        for (let i = 0; i < maxScrolls; i++) {
            window.scrollBy({
                top: viewportHeight * 0.8,
                behavior: 'smooth'
            });

            // Wait for network idle
            await waitForNetworkIdle(1000);

            // Check if element now exists
            if (queryDeep(selector) || tryFuzzySelectors(selector)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Wait for network idle (no requests for specified duration)
     */
    const waitForNetworkIdle = (idleDuration: number = 1000): Promise<void> => {
        return new Promise((resolve) => {
            let lastActivity = Date.now();
            const originalFetch = window.fetch;
            const originalXHR = window.XMLHttpRequest;

            // Monitor fetch requests
            window.fetch = async (...args) => {
                lastActivity = Date.now();
                return originalFetch(...args);
            };

            // Monitor XHR requests
            const originalOpen = originalXHR.prototype.open;
            originalXHR.prototype.open = function (...args) {
                lastActivity = Date.now();
                return originalOpen.apply(this, args);
            };

            // Check for idle
            const checkIdle = () => {
                const now = Date.now();
                if (now - lastActivity >= idleDuration) {
                    // Restore originals
                    window.fetch = originalFetch;
                    originalXHR.prototype.open = originalOpen;
                    resolve();
                } else {
                    setTimeout(checkIdle, 100);
                }
            };

            setTimeout(checkIdle, idleDuration);
        });
    };

    /**
     * Query element across all frames (including iframes)
     */
    const queryAllFrames = (selector: string): Element | null => {
        // Try in main document first
        const mainEl = queryDeep(selector) || tryFuzzySelectors(selector);
        if (mainEl) return mainEl;

        // Check iframes
        const frames = document.querySelectorAll('iframe');
        for (const frame of frames) {
            try {
                const doc = frame.contentDocument || frame.contentWindow?.document;
                if (doc) {
                    const el = doc.querySelector(selector);
                    if (el && isInteractable(el)) {
                        return el;
                    }
                }
            } catch {
                // Cross-origin iframe, cannot access
                continue;
            }
        }

        return null;
    };

    /**
     * Safe execute with modal dismissal
     */
    const safeExecute = async <T>(fn: () => T | Promise<T>): Promise<T> => {
        // Try to dismiss any modals first
        dismissModals();
        await new Promise(r => setTimeout(r, 100));
        return fn();
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
    const waitForPageReady = (timeout = 15000) => new Promise<boolean>((resolve) => {
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
                console.log(`[WebPilot] Page ready timeout after ${elapsed}ms (network idle: ${pendingFetch === 0}, DOM settled: ${Date.now() - lastMutation}ms ago)`);
                window.fetch = originalFetch;
                obs.disconnect();
                resolve(true);
                return;
            }
            // Wait for 800ms of DOM stability for SPAs (faster execution)
            const idle = pendingFetch === 0 && (Date.now() - lastMutation > 800);
            if (idle && document.readyState === 'complete') {
                console.log(`[WebPilot] Page ready in ${elapsed}ms`);
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
        const allElements = allDeep(document);
        console.log(`[WebPilot] Building snapshot: ${allElements.length} total elements`);
        
        const elements = allElements
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
        
        // Add metadata to help LLM understand if page is loaded/useful
        const inputCount = elements.filter(e => e.tag === 'input').length;
        const buttonCount = elements.filter(e => e.tag === 'button' || e.attrs.role === 'button').length;
        const linkCount = elements.filter(e => e.tag === 'a').length;
        const hasSearchBox = elements.some(e => 
            e.tag === 'input' && 
            (e.attrs.type === 'search' || 
             e.attrs.placeholder?.toLowerCase().includes('search') ||
             e.attrs.ariaLabel?.toLowerCase().includes('search'))
        );
        const hasForm = document.querySelector('form') !== null;
        
        console.log(`[WebPilot] Snapshot: ${elements.length} interactive elements found on ${location.href}`);
        console.log(`[WebPilot] Page stats: ${inputCount} inputs, ${buttonCount} buttons, ${linkCount} links, hasSearchBox=${hasSearchBox}, hasForm=${hasForm}`);
        console.log(`[WebPilot] Sample elements:`, elements.slice(0, 5).map(e => ({
            tag: e.tag,
            id: e.attrs.id,
            placeholder: e.attrs.placeholder,
            text: e.text?.slice(0, 30)
        })));
        
        return { 
            url: location.href, 
            title: document.title, 
            elements,
            metadata: {
                totalInteractive: elements.length,
                inputCount,
                buttonCount,
                linkCount,
                hasSearchBox,
                hasForm,
                readyState: document.readyState
            }
        };
    };

    // Multi-strategy element finder
    const isInteractable = (el: Element | null) => {
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect?.();
        return !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(el as Element as HTMLElement).visibility !== 'hidden';
    };

    // Modern site patterns (2024) - inlined for content script
    const getModernPatterns = (): Record<string, Record<string, string[]>> => {
        const hostname = location.hostname.toLowerCase().replace(/^www\./, '');
        const patterns: Record<string, Record<string, string[]>> = {
            'youtube.com': {
                'video tile': ['ytd-rich-item-renderer a#thumbnail', 'ytd-video-renderer a#thumbnail', 'ytd-grid-video-renderer a.yt-simple-endpoint', 'a#video-title-link'],
                'search box': ['input#search', 'ytd-searchbox input', 'input[aria-label="Search"]', 'input[name="search_query"]'],
                'search button': ['button#search-icon-legacy', 'button[aria-label="Search"]', 'ytd-searchbox button#search-icon-legacy'],
                'subscribe button': ['ytd-subscribe-button-renderer button', 'button[aria-label*="Subscribe"]'],
                'like button': ['button[aria-label*="like"]', 'ytd-toggle-button-renderer button'],
                'play button': ['button.ytp-play-button', 'button[aria-label="Play"]']
            },
            'amazon.com': {
                'product tile': ['div[data-component-type="s-search-result"] h2 a', 'div.s-result-item h2 a', '[data-cy="title-recipe"] a', 'div[data-asin] h2 a'],
                'add to cart': ['input#add-to-cart-button', 'button#add-to-cart-button', 'input[name="submit.add-to-cart"]', 'button[name="submit.add-to-cart"]'],
                'search box': ['input#twotabsearchtextbox', 'input#nav-search-bar-input', 'input[aria-label*="Search"]'],
                'search button': ['input#nav-search-submit-button', 'button#nav-search-submit-button', 'input[value="Go"]'],
                'buy now': ['input#buy-now-button', 'button#buy-now-button']
            },
            'amazon.in': {
                'product tile': ['div[data-component-type="s-search-result"] h2 a', 'div.s-result-item h2 a', 'div[data-asin] h2 a'],
                'add to cart': ['input#add-to-cart-button', 'button#add-to-cart-button', 'input[name="submit.add-to-cart"]'],
                'search box': ['input#twotabsearchtextbox', 'input#nav-search-bar-input'],
                'search button': ['input#nav-search-submit-button', 'button#nav-search-submit-button']
            },
            'linkedin.com': {
                'easy apply': ['button.jobs-apply-button', 'button[aria-label*="Easy Apply"]', 'button[data-control-name="jobdetails_topcard_inapply"]'],
                'search box': ['input[aria-label*="Search"]', 'input.search-global-typeahead__input'],
                'connect button': ['button[aria-label*="Connect"]', 'button[data-control-name="connect"]'],
                'next button': ['button[aria-label*="next step"]', 'button[aria-label*="Review"]', 'button[aria-label*="Submit"]']
            },
            'twitter.com': {
                'tweet button': ['button[data-testid="tweetButtonInline"]', 'a[data-testid="SideNav_NewTweet_Button"]'],
                'search box': ['input[data-testid="SearchBox_Search_Input"]', 'input[aria-label="Search query"]'],
                'like button': ['button[data-testid="like"]', 'div[data-testid="like"]'],
                'retweet button': ['button[data-testid="retweet"]']
            },
            'x.com': {
                'tweet button': ['button[data-testid="tweetButtonInline"]'],
                'search box': ['input[data-testid="SearchBox_Search_Input"]']
            },
            'github.com': {
                'repository link': ['a[data-testid="results-list"] h3', 'h3 a[href*="/"]'],
                'search box': ['input[name="q"]', 'input[placeholder*="Search"]'],
                'star button': ['button[data-ga-click*="star"]', 'button[aria-label*="Star"]']
            },
            'reddit.com': {
                'search box': ['input[name="q"]', 'input[placeholder*="Search"]'],
                'upvote button': ['button[aria-label*="Upvote"]', 'div[aria-label*="upvote"]'],
                'post title': ['h3[slot="title"]', 'a[slot="full-post-link"]']
            },
            'stackoverflow.com': {
                'search box': ['input[name="q"]', 'input[placeholder*="Search"]'],
                'upvote button': ['button[aria-label*="Up vote"]', 'button.js-vote-up-btn']
            }
        };
        
        return patterns[hostname] || patterns[hostname.split('.').slice(-2).join('.')] || {};
    };

    const findBySemantic = (desc: string): Element | null => {
        const lower = desc.toLowerCase();
        const modernPatterns = getModernPatterns();
        
        const preferInputs = /(box|input|field|bar)/.test(lower);
        
        // Site-specific: YouTube search input often lives inside ytd-searchbox shadow root
        if (preferInputs && /search/.test(lower) && location.hostname.includes('youtube')) {
            const host = document.querySelector('ytd-searchbox') as any;
            const sr: ShadowRoot | null = host?.shadowRoot ?? null;
            if (sr) {
                const ytInput = sr.querySelector('input.ytSearchboxComponentInput, input#search, input[aria-label="Search"], input[type="search"]');
                if (isInteractable(ytInput)) return ytInput as Element;
            }
        }
        
        // Try modern patterns first
        for (const [key, selectors] of Object.entries(modernPatterns)) {
            if (lower.includes(key) || key.includes(lower)) {
                for (const sel of selectors) {
                    const el = queryDeep(sel);
                    if (!isInteractable(el)) continue;
                    if (preferInputs && (el as HTMLElement).tagName.toLowerCase() !== 'input' && (el as HTMLElement).tagName.toLowerCase() !== 'textarea') continue;
                    return el!;
                }
            }
        }
        
        // Fallback to generic patterns
        const fallbackMapping: Record<string, string[]> = {
            'search box': ['input[aria-label*="Search" i]', 'input[type="search"]', 'input[placeholder*="Search" i]', 'input[name*="search" i]'],
            'search button': ['button[aria-label*="Search" i]', 'button[type="submit"]', 'input[type="submit"][value*="Search" i]'],
            'submit button': ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Submit")'],
            'login button': ['button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Sign in")'],
            'close button': ['button[aria-label*="Close" i]', 'button.close', '[data-dismiss="modal"]']
        };
        
        const entries = Object.entries(fallbackMapping).sort((a, b) => b[0].length - a[0].length);
        for (const [key, selectors] of entries) {
            if (lower.includes(key)) {
                for (const sel of selectors) {
                    const el = queryDeep(sel);
                    if (!isInteractable(el)) continue;
                    if (preferInputs && (el as HTMLElement).tagName.toLowerCase() !== 'input' && (el as HTMLElement).tagName.toLowerCase() !== 'textarea') continue;
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

    // Self-healing selector system - fuzzy fallback strategies
    const findByPartialId = (selector: string): Element | null => {
        const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
        if (!idMatch) return null;
        const id = idMatch[1];
        const partial = document.querySelector(`[id*="${id}"]`);
        return isInteractable(partial) ? partial : null;
    };

    const findByPartialClass = (selector: string): Element | null => {
        const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
        if (!classMatch) return null;
        const cls = classMatch[1];
        const partial = document.querySelector(`[class*="${cls}"]`);
        return isInteractable(partial) ? partial : null;
    };

    const findByAriaLabel = (selector: string): Element | null => {
        const ariaMatch = selector.match(/\[aria-label[*^$~]?="([^"]+)"\]/);
        if (!ariaMatch) return null;
        const label = ariaMatch[1];
        const partial = document.querySelector(`[aria-label*="${label}"]`);
        return isInteractable(partial) ? partial : null;
    };

    const findByDataTestId = (selector: string): Element | null => {
        const testIdMatch = selector.match(/\[data-test(?:id)?[*^$~]?="([^"]+)"\]/);
        if (!testIdMatch) return null;
        const testId = testIdMatch[1];
        const candidates = [
            `[data-testid*="${testId}"]`,
            `[data-test-id*="${testId}"]`,
            `[data-test*="${testId}"]`
        ];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (isInteractable(el)) return el;
        }
        return null;
    };

    const selectorToXPath = (selector: string): string => {
        if (selector.startsWith('#')) {
            const id = selector.slice(1);
            return `//*[@id="${id}"]`;
        }
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            return `//*[contains(@class, "${cls}")]`;
        }
        const tagMatch = selector.match(/^([a-z]+)/i);
        if (tagMatch) {
            return `//${tagMatch[1]}`;
        }
        return `//*`;
    };

    const findByXPath = (xpath: string): Element | null => {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const el = result.singleNodeValue as Element | null;
            return isInteractable(el) ? el : null;
        } catch {
            return null;
        }
    };

    // Try fuzzy selectors when exact match fails
    const tryFuzzySelectors = (selector: string): Element | null => {
        const strategies = [
            () => queryDeep(selector),
            () => queryDeep(selector.replace(/\s+/g, '')),
            () => findByPartialId(selector),
            () => findByPartialClass(selector),
            () => findByAriaLabel(selector),
            () => findByDataTestId(selector),
            () => findByXPath(selectorToXPath(selector))
        ];

        for (const strategy of strategies) {
            try {
                const el = strategy();
                if (el && isInteractable(el)) return el;
            } catch {
                // Strategy failed, continue
            }
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
    
    // Enhanced form field detection
    const findByFormContext = (desc: string): Element | null => {
        const lower = desc.toLowerCase();
        
        // Find labels containing description
        const labels = Array.from(document.querySelectorAll('label')).filter(el => 
            (el.textContent || '').toLowerCase().includes(lower)
        );
        
        for (const label of labels) {
            // Check for label[for] association
            const forAttr = label.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (isInteractable(input)) return input!;
            }
            
            // Check for nested input
            const nested = label.querySelector('input, select, textarea');
            if (isInteractable(nested)) return nested!;
        }
        
        // Check for placeholder match
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        for (const input of inputs) {
            const placeholder = (input as HTMLInputElement).placeholder || '';
            if (placeholder.toLowerCase().includes(lower) && isInteractable(input)) {
                return input;
            }
        }
        
        // Check for aria-describedby
        for (const input of inputs) {
            const describedBy = (input as HTMLElement).getAttribute('aria-describedby');
            if (describedBy) {
                const desc = document.getElementById(describedBy);
                if (desc && desc.textContent?.toLowerCase().includes(lower) && isInteractable(input)) {
                    return input;
                }
            }
        }
        
        return null;
    };
    
    // Select dropdown option by value or text
    const selectOption = async (selector: string, value: string) => {
        const el = queryDeep(selector) as HTMLSelectElement | null;
        if (!el) throw new Error('Select element not found');
        
        // Try by value first
        for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].value === value) {
                el.selectedIndex = i;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        
        // Try by text
        for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].text.toLowerCase().includes(value.toLowerCase())) {
                el.selectedIndex = i;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        
        throw new Error(`Option "${value}" not found in select`);
    };
    
    // File upload simulation (limited in extensions)
    const uploadFile = async (selector: string, fileName: string) => {
        const el = queryDeep(selector) as HTMLInputElement | null;
        if (!el || el.type !== 'file') throw new Error('File input not found');
        
        // Note: Cannot programmatically set files due to security restrictions
        // This will highlight the element for user to manually select file
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
        
        // Store filename hint for user
        const hint = document.createElement('div');
        hint.textContent = `Please select: ${fileName}`;
        hint.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#ff9800;color:#fff;padding:12px 24px;border-radius:4px;z-index:999999;font-size:14px;';
        document.body.appendChild(hint);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        hint.remove();
        
        return true;
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
            if (msgType === 'SELECT') {
                selectOption((payload as any).selector, (payload as any).value).then((r) => respond(true, r)).catch((e) => respond(false, undefined, String(e)));
                return true;
            }
            if (msgType === 'UPLOAD') {
                uploadFile((payload as any).selector, (payload as any).fileName).then((r) => respond(true, r)).catch((e) => respond(false, undefined, String(e)));
                return true;
            }
            if (msgType === 'FIND_FORM_FIELD') {
                const el = findByFormContext(String((payload as any).description || ''));
                if (!el) { respond(false, undefined, 'Form field not found'); return true; }
                const sel = getUniqueSelector(el);
                respond(true, { selector: sel });
                return true;
            }
            
            // EXTRACT_CONTENT: Extract readable page content for summarization
            if (msgType === 'EXTRACT_CONTENT') {
                try {
                    const title = document.title;
                    const url = location.href;
                    
                    // Extract main text content
                    const mainContentSelectors = ['article', 'main', '[role="main"]', '.content', '.post', '.article'];
                    let mainElement: Element | null = null;
                    
                    for (const selector of mainContentSelectors) {
                        mainElement = document.querySelector(selector);
                        if (mainElement) break;
                    }
                    
                    const textSource = mainElement || document.body;
                    const mainText = textSource.innerText || textSource.textContent || '';
                    
                    // Extract headings
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
                        .map(h => h.textContent?.trim())
                        .filter(Boolean);
                    
                    // Extract key points (list items)
                    const keyPoints = Array.from(document.querySelectorAll('article li, main li, .content li'))
                        .slice(0, 10)
                        .map(li => li.textContent?.trim())
                        .filter(Boolean);
                    
                    const wordCount = mainText.split(/\s+/).length;
                    
                    respond(true, {
                        title,
                        url,
                        mainText: mainText.slice(0, 10000), // Limit to first 10k chars
                        headings: headings.slice(0, 20),
                        keyPoints: keyPoints.slice(0, 10),
                        wordCount
                    });
                } catch (e) {
                    respond(false, undefined, String(e));
                }
                return true;
            }
            
            // EXTRACT_DATA: Extract structured data based on targets
            if (msgType === 'EXTRACT_DATA') {
                try {
                    const targets = (payload as any).targets || [];
                    const items: Array<Record<string, any>> = [];
                    const seenItems = new Set<string>();
                    
                    // For each target, find matching elements
                    for (const target of targets) {
                        const description = target.description;
                        const selectors = target.selectors || [];
                        const dataType = target.dataType || 'text';
                        
                        for (const selector of selectors) {
                            try {
                                const elements = document.querySelectorAll(selector);
                                
                                for (const el of Array.from(elements)) {
                                    let value = '';
                                    
                                    // Extract value based on data type
                                    if (dataType === 'url' && el instanceof HTMLAnchorElement) {
                                        value = el.href;
                                    } else if (dataType === 'email' && el instanceof HTMLAnchorElement) {
                                        value = el.href.replace('mailto:', '');
                                    } else {
                                        value = (el.textContent || '').trim();
                                        
                                        // Clean up price values
                                        if (dataType === 'price') {
                                            value = value.replace(/[^\d.,]/g, '');
                                        }
                                    }
                                    
                                    if (!value) continue;
                                    
                                    // Create unique key to avoid duplicates
                                    const itemKey = `${description}:${value}`;
                                    if (seenItems.has(itemKey)) continue;
                                    seenItems.add(itemKey);
                                    
                                    items.push({
                                        [description]: value
                                    });
                                    
                                    // Limit results
                                    if (items.length >= 200) break;
                                }
                            } catch (e) {
                                console.error(`Selector failed: ${selector}`, e);
                            }
                            
                            if (items.length >= 200) break;
                        }
                        
                        if (items.length >= 200) break;
                    }
                    
                    respond(true, {
                        items,
                        count: items.length,
                        extractedAt: Date.now(),
                        sourceUrl: location.href
                    });
                } catch (e) {
                    respond(false, undefined, String(e));
                }
                return true;
            }
        } catch (e) {
            respond(false, undefined, String(e));
            return true;
        }
        return false;
    });
})();



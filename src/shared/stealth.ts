/**
 * Stealth Mode - Anti-Detection Techniques
 * Helps bypass basic bot detection (Cloudflare, DataDome, etc.)
 */

/**
 * Inject stealth scripts into the page to hide automation indicators
 */
export function enableStealthMode(): void {
    // This needs to run BEFORE page scripts, so we inject it into the page context
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            // 1. Hide WebDriver flag
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            
            // 2. Override Chrome automation flags
            Object.defineProperty(window, 'chrome', {
                get: () => ({
                    runtime: {},
                    loadTimes: function() {},
                    csi: function() {},
                    app: {}
                }),
                configurable: true
            });
            
            // 3. Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' 
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters)
            );
            
            // 4. Mock plugins (Chrome has PDF viewer)
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    },
                    {
                        0: {type: "application/pdf", suffixes: "pdf", description: "Portable Document Format"},
                        description: "Portable Document Format", 
                        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                        length: 1,
                        name: "Chrome PDF Viewer"
                    }
                ]
            });
            
            // 5. Mock languages (add more realistic language list)
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
                configurable: true
            });
            
            // 6. Override toString to hide proxy
            const oldToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === window.navigator.permissions.query) {
                    return 'function query() { [native code] }';
                }
                return oldToString.call(this);
            };
            
            // 7. Hide automation in user agent (if present)
            const originalUA = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                get: () => originalUA.replace(/HeadlessChrome/g, 'Chrome'),
                configurable: true
            });
            
            // 8. Mock hardware concurrency (typical desktop)
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8,
                configurable: true
            });
            
            // 9. Mock device memory (typical desktop)
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
                configurable: true
            });
            
            // 10. Mock platform (consistent with Windows)
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32',
                configurable: true
            });
            
            // 11. Mock vendor (should be Google Inc. for Chrome)
            Object.defineProperty(navigator, 'vendor', {
                get: () => 'Google Inc.',
                configurable: true
            });
            
            // 12. Add realistic connection info
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 100,
                    downlink: 10,
                    saveData: false
                }),
                configurable: true
            });
            
            // 13. Mock getBattery (desktop usually has battery API)
            if (navigator.getBattery) {
                const originalGetBattery = navigator.getBattery;
                navigator.getBattery = async () => {
                    const battery = await originalGetBattery.call(navigator);
                    Object.defineProperty(battery, 'charging', { get: () => true });
                    Object.defineProperty(battery, 'level', { get: () => 1.0 });
                    return battery;
                };
            }
            
            // 14. Consistent screen properties (1920x1080 is common)
            Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
            Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
            Object.defineProperty(screen, 'height', { get: () => 1080 });
            Object.defineProperty(screen, 'width', { get: () => 1920 });
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
            
            console.log('[Stealth Mode] Anti-detection enabled');
        })();
    `;
    
    // Inject at document_start (before page scripts run)
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Clean up
}

/**
 * Add realistic delays between actions (human-like behavior)
 */
export function humanDelay(min: number = 100, max: number = 300): Promise<void> {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Check if stealth mode is needed for a URL (e.g., known anti-bot sites)
 */
export function needsStealthMode(url: string): boolean {
    const stealthDomains = [
        'amazon.com',
        'amazon.in',
        'amazon.co.uk',
        'walmart.com',
        'target.com',
        'bestbuy.com',
        'cloudflare.com',
        'datadome.co'
    ];
    
    return stealthDomains.some(domain => url.includes(domain));
}









/**
 * Stealth Injection Script
 * Runs at document_start (BEFORE page scripts) to hide automation indicators
 */

// Check if we need stealth mode for this domain
const stealthDomains = [
    'amazon.com',
    'amazon.in',
    'amazon.co.uk',
    'walmart.com',
    'target.com',
    'bestbuy.com',
    'flipkart.com',
    'cloudflare.com'
];

const needsStealth = stealthDomains.some(domain => window.location.href.includes(domain));

if (needsStealth) {
    console.log('[Stealth] Injecting anti-detection at document_start');
    
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
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
        window.navigator.permissions.query = (parameters: any) => (
            parameters.name === 'notifications' 
                ? Promise.resolve({ state: Notification.permission } as any)
                : originalQuery(parameters)
        );
    }
    
    // 4. Mock plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            {
                0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "PDF"},
                description: "Portable Document Format",
                filename: "internal-pdf-viewer",
                length: 1,
                name: "Chrome PDF Plugin"
            }
        ]
    });
    
    // 5. Mock languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true
    });
    
    // 6. Hide automation in user agent
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
        get: () => originalUA.replace(/HeadlessChrome/g, 'Chrome'),
        configurable: true
    });
    
    // 7. Mock hardware
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true
    });
    
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true
    });
    
    // 8. Consistent platform
    Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true
    });
    
    Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
        configurable: true
    });
    
    // 9. Override toString to hide proxy
    const oldToString = Function.prototype.toString;
    Function.prototype.toString = function() {
        if (this === window.navigator.permissions?.query) {
            return 'function query() { [native code] }';
        }
        return oldToString.call(this);
    };
    
    console.log('[Stealth] Anti-detection enabled');
}









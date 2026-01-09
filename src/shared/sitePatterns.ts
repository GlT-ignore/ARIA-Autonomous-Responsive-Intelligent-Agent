/**
 * Modern Site Pattern Library
 * 
 * Site-specific selectors for popular websites (2024 versions).
 * Updated to handle current DOM structures and reduce LLM hallucination.
 */

export interface SitePattern {
    [description: string]: string[];
}

export interface SitePatterns {
    [domain: string]: SitePattern;
}

export const MODERN_SITE_PATTERNS: SitePatterns = {
    // YouTube (2024)
    'youtube.com': {
        'video tile': [
            'ytd-rich-item-renderer a#thumbnail',
            'ytd-video-renderer a#thumbnail',
            'ytd-grid-video-renderer a.yt-simple-endpoint',
            'ytd-compact-video-renderer a#thumbnail',
            'a#video-title-link',
            'a.yt-simple-endpoint.ytd-video-renderer'
        ],
        'video title': [
            'a#video-title',
            'h3.ytd-video-renderer a',
            'ytd-video-renderer #video-title'
        ],
        'search box': [
            'input#search',
            'ytd-searchbox input',
            'input[aria-label="Search"]',
            'input[name="search_query"]'
        ],
        'search button': [
            'button#search-icon-legacy',
            'button[aria-label="Search"]',
            'ytd-searchbox button#search-icon-legacy'
        ],
        'subscribe button': [
            'ytd-subscribe-button-renderer button',
            'tp-yt-paper-button[aria-label*="Subscribe"]',
            'button[aria-label*="Subscribe"]'
        ],
        'like button': [
            'button[aria-label*="like"]',
            'ytd-toggle-button-renderer button[aria-label*="like"]'
        ],
        'play button': [
            'button.ytp-play-button',
            'button[aria-label="Play"]'
        ]
    },

    // Amazon (2024 - supports .com, .in, etc.)
    'amazon.com': {
        'product tile': [
            'div[data-component-type="s-search-result"] h2 a',
            'div.s-result-item h2 a',
            '[data-cy="title-recipe"] a',
            'div[data-asin] h2 a',
            'h2.s-line-clamp-2 a'
        ],
        'product title': [
            'h1#title',
            'span#productTitle',
            'h1 span#productTitle'
        ],
        'add to cart': [
            'input#add-to-cart-button',
            'button#add-to-cart-button',
            'input[name="submit.add-to-cart"]',
            'button[name="submit.add-to-cart"]',
            'span#submit\\.add-to-cart input'
        ],
        'buy now': [
            'input#buy-now-button',
            'button#buy-now-button',
            'input[name="submit.buy-now"]'
        ],
        'search box': [
            'input#twotabsearchtextbox',
            'input#nav-search-bar-input',
            'input[aria-label="Search Amazon"]'
        ],
        'search button': [
            'input#nav-search-submit-button',
            'button#nav-search-submit-button',
            'input[value="Go"]'
        ],
        'quantity selector': [
            'select#quantity',
            'select[name="quantity"]',
            'span.a-dropdown-container select'
        ]
    },

    'amazon.in': {
        'product tile': [
            'div[data-component-type="s-search-result"] h2 a',
            'div.s-result-item h2 a',
            '[data-cy="title-recipe"] a',
            'div[data-asin] h2 a'
        ],
        'add to cart': [
            'input#add-to-cart-button',
            'button#add-to-cart-button',
            'input[name="submit.add-to-cart"]'
        ],
        'search box': [
            'input#twotabsearchtextbox',
            'input#nav-search-bar-input'
        ],
        'search button': [
            'input#nav-search-submit-button',
            'button#nav-search-submit-button'
        ]
    },

    // LinkedIn (2024)
    'linkedin.com': {
        'easy apply': [
            'button.jobs-apply-button',
            'button[aria-label*="Easy Apply"]',
            'button[data-control-name="jobdetails_topcard_inapply"]'
        ],
        'job title': [
            'h1.t-24',
            'h2.job-details-jobs-unified-top-card__job-title',
            'h1[class*="job-title"]'
        ],
        'search box': [
            'input[aria-label*="Search"]',
            'input.search-global-typeahead__input',
            'input[placeholder*="Search"]'
        ],
        'connect button': [
            'button[aria-label*="Connect"]',
            'button[data-control-name="connect"]'
        ],
        'message button': [
            'button[aria-label*="Message"]',
            'button[data-control-name="message"]'
        ],
        'next button': [
            'button[aria-label="Continue to next step"]',
            'button[aria-label="Review your application"]',
            'button[aria-label="Submit application"]'
        ]
    },

    // Twitter/X (2024)
    'twitter.com': {
        'tweet button': [
            'button[data-testid="tweetButtonInline"]',
            'a[data-testid="SideNav_NewTweet_Button"]'
        ],
        'tweet text': [
            'div[data-testid="tweetText"]',
            'div[data-testid="tweetTextarea_0"]'
        ],
        'search box': [
            'input[data-testid="SearchBox_Search_Input"]',
            'input[aria-label="Search query"]'
        ],
        'like button': [
            'button[data-testid="like"]',
            'div[data-testid="like"]'
        ],
        'retweet button': [
            'button[data-testid="retweet"]',
            'div[data-testid="retweet"]'
        ],
        'reply button': [
            'button[data-testid="reply"]',
            'div[data-testid="reply"]'
        ]
    },

    'x.com': {
        'tweet button': [
            'button[data-testid="tweetButtonInline"]',
            'a[data-testid="SideNav_NewTweet_Button"]'
        ],
        'search box': [
            'input[data-testid="SearchBox_Search_Input"]',
            'input[aria-label="Search query"]'
        ]
    },

    // GitHub (2024)
    'github.com': {
        'repository link': [
            'a[data-testid="results-list"] h3',
            'a.v-align-middle',
            'h3 a[href*="/"]'
        ],
        'search box': [
            'input[name="q"]',
            'input[placeholder*="Search"]',
            'input[aria-label*="Search"]'
        ],
        'star button': [
            'button[data-ga-click*="star"]',
            'button[aria-label*="Star"]'
        ],
        'fork button': [
            'button[data-ga-click*="fork"]',
            'button[aria-label*="Fork"]'
        ],
        'clone button': [
            'button[data-target="get-repo.modal"]',
            'button:has-text("Code")'
        ]
    },

    // Gmail (2024)
    'mail.google.com': {
        'compose': [
            'div[gh="cm"]',
            'div[role="button"][gh="cm"]'
        ],
        'to field': [
            'input[name="to"]',
            'textarea[name="to"]',
            'div[aria-label="To"]'
        ],
        'subject': [
            'input[name="subjectbox"]',
            'input[aria-label="Subject"]'
        ],
        'message body': [
            'div[aria-label="Message Body"]',
            'div[role="textbox"][aria-label*="Message"]'
        ],
        'send button': [
            'div[role="button"][aria-label*="Send"]',
            'div[data-tooltip*="Send"]'
        ]
    },

    // Facebook (2024)
    'facebook.com': {
        'post button': [
            'div[aria-label="Create a post"]',
            'div[role="button"][tabindex="0"]'
        ],
        'search box': [
            'input[aria-label="Search Facebook"]',
            'input[placeholder*="Search"]'
        ],
        'like button': [
            'div[aria-label="Like"]',
            'div[aria-label*="Like"]'
        ],
        'comment button': [
            'div[aria-label="Leave a comment"]',
            'div[aria-label="Write a comment"]'
        ]
    },

    // Instagram (2024)
    'instagram.com': {
        'search box': [
            'input[aria-label="Search input"]',
            'input[placeholder="Search"]'
        ],
        'like button': [
            'svg[aria-label="Like"]',
            'button[aria-label="Like"]'
        ],
        'comment button': [
            'svg[aria-label="Comment"]',
            'button[aria-label="Comment"]'
        ],
        'post button': [
            'svg[aria-label*="New post"]',
            'a[href*="/create/"]'
        ]
    },

    // Reddit (2024)
    'reddit.com': {
        'search box': [
            'input[name="q"]',
            'input[placeholder*="Search"]'
        ],
        'upvote button': [
            'button[aria-label*="Upvote"]',
            'div[aria-label*="upvote"]'
        ],
        'comment button': [
            'button[aria-label*="Comment"]',
            'a[data-click-id="comments"]'
        ],
        'post title': [
            'h3[slot="title"]',
            'a[slot="full-post-link"]'
        ]
    },

    // Wikipedia
    'wikipedia.org': {
        'search box': [
            'input#searchInput',
            'input[name="search"]'
        ],
        'search button': [
            'button[type="submit"]',
            'button.searchButton'
        ]
    },

    // Stack Overflow (2024)
    'stackoverflow.com': {
        'search box': [
            'input[name="q"]',
            'input[placeholder*="Search"]'
        ],
        'ask question': [
            'a[href="/questions/ask"]',
            'button:has-text("Ask Question")'
        ],
        'upvote button': [
            'button[aria-label*="Up vote"]',
            'button.js-vote-up-btn'
        ],
        'answer button': [
            'a[href*="#answer-"]',
            'button:has-text("Answer")'
        ]
    },

    // Air India (2024 - booking system)
    'airindia.com': {
        'from city': [
            'input[placeholder*="From" i]',
            'input[placeholder*="Origin" i]',
            'input[placeholder*="Leaving From" i]',
            'input[aria-label*="From" i]',
            'input[aria-label*="Origin" i]',
            'input[name*="origin" i]',
            'input[id*="origin" i]',
            'input[id*="from" i]',
            'input[class*="origin" i]',
            'input[class*="from" i]',
            '#OriginAirportCode',
            '#txtOrigin',
            'div[class*="origin"] input',
            'div[class*="from"] input'
        ],
        'to city': [
            'input[placeholder*="To" i]',
            'input[placeholder*="Destination" i]',
            'input[placeholder*="Going To" i]',
            'input[aria-label*="To" i]',
            'input[aria-label*="Destination" i]',
            'input[name*="destination" i]',
            'input[id*="destination" i]',
            'input[id*="to" i]',
            'input[class*="destination" i]',
            'input[class*="to" i]',
            '#DestinationAirportCode',
            '#txtDestination',
            'div[class*="destination"] input',
            'div[class*="to"] input'
        ],
        'departure date': [
            'input[placeholder*="Departure" i]',
            'input[aria-label*="Departure" i]',
            'input[name*="departure" i]',
            'input[id*="departure" i]',
            'input[id*="depart" i]',
            '#txtDepartDate',
            'input[type="date"]'
        ],
        'return date': [
            'input[placeholder*="Return" i]',
            'input[aria-label*="Return" i]',
            'input[name*="return" i]',
            'input[id*="return" i]',
            '#txtReturnDate'
        ],
        'search flights': [
            'button[type="submit"]',
            'button:has-text("Search")',
            'input[value*="Search" i]',
            'button[value*="Search" i]',
            'button.search-btn',
            'button.btn-search',
            '#btnSearch',
            'button[aria-label*="Search"]'
        ],
        'passengers': [
            'input[placeholder*="Passenger" i]',
            'input[aria-label*="Passenger" i]',
            'select[name*="passenger" i]',
            '#ddlPassengers',
            'button:has-text("Passenger")'
        ],
        'flight result': [
            'div.flight-card',
            'div.flight-result',
            'div[class*="flight-item"]',
            'div[data-testid*="flight"]'
        ],
        'book button': [
            'button:has-text("Book")',
            'button:has-text("Select")',
            'button[value*="Book"]',
            'a:has-text("Book")'
        ]
    },

    // MakeMyTrip (2024 - alternative flight booking)
    'makemytrip.com': {
        'from city': [
            'input[id*="fromCity"]',
            'input[placeholder*="From" i]',
            'span[data-cy="fromCity"]'
        ],
        'to city': [
            'input[id*="toCity"]',
            'input[placeholder*="To" i]',
            'span[data-cy="toCity"]'
        ],
        'departure date': [
            'input[id*="departure"]',
            'span[aria-label*="Departure"]',
            'p[data-cy="departureDate"]'
        ],
        'search button': [
            'button[data-cy="submit"]',
            'a[class*="search"]',
            'button:has-text("Search")'
        ]
    }
};

/**
 * Get patterns for current domain
 */
export function getPatternsForDomain(url: string): SitePattern | null {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        
        // Try exact match
        if (MODERN_SITE_PATTERNS[hostname]) {
            return MODERN_SITE_PATTERNS[hostname];
        }
        
        // Try without 'www.'
        const withoutWww = hostname.replace(/^www\./, '');
        if (MODERN_SITE_PATTERNS[withoutWww]) {
            return MODERN_SITE_PATTERNS[withoutWww];
        }
        
        // Try domain + tld (e.g., amazon.com matches amazon.in)
        const domainParts = hostname.split('.');
        if (domainParts.length >= 2) {
            const baseDomain = domainParts.slice(-2).join('.');
            for (const pattern in MODERN_SITE_PATTERNS) {
                if (pattern.includes(baseDomain.split('.')[0])) {
                    return MODERN_SITE_PATTERNS[pattern];
                }
            }
        }
        
        return null;
    } catch {
        return null;
    }
}

/**
 * Get selectors for a specific description on current site
 */
export function getSelectorsForDescription(url: string, description: string): string[] | null {
    const patterns = getPatternsForDomain(url);
    if (!patterns) return null;
    
    const lower = description.toLowerCase();
    
    // Try exact match
    if (patterns[lower]) {
        return patterns[lower];
    }
    
    // Try partial match
    for (const key in patterns) {
        if (lower.includes(key) || key.includes(lower)) {
            return patterns[key];
        }
    }
    
    return null;
}


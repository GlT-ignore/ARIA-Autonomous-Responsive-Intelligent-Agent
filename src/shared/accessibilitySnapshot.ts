/**
 * Accessibility Tree Snapshot
 * 
 * Uses Chrome's Automation API to build a cleaner snapshot of interactive elements.
 * Reduces token usage by ~60% compared to raw DOM snapshots.
 */

export interface A11yNode {
    role: string;
    name?: string;
    value?: string;
    description?: string;
    url?: string;
    rect?: { x: number; y: number; w: number; h: number };
    children?: A11yNode[];
    guessSelector?: string;
}

export interface A11yTree {
    url: string;
    title: string;
    nodes: A11yNode[];
}

// Interactive roles we care about for automation
const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'textbox',
    'searchbox',
    'combobox',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'checkbox',
    'switch',
    'tab',
    'treeitem'
]);

/**
 * Build accessibility tree for a tab
 * Note: Requires "automation" permission in manifest
 */
export async function buildAccessibilityTree(tabId: number): Promise<A11yTree> {
    return new Promise((resolve, reject) => {
        if (!chrome.automation) {
            return reject(new Error('chrome.automation API not available - add "automation" permission'));
        }

        chrome.automation.getTree(tabId, (tree) => {
            if (!tree) {
                return reject(new Error('Failed to get accessibility tree'));
            }

            const interactive = filterInteractiveNodes(tree);
            const simplified = interactive.map(simplifyNode);

            resolve({
                url: tree.docUrl || '',
                title: tree.name || '',
                nodes: simplified
            });
        });
    });
}

/**
 * Filter nodes to only interactive elements
 */
function filterInteractiveNodes(root: chrome.automation.AutomationNode): chrome.automation.AutomationNode[] {
    const result: chrome.automation.AutomationNode[] = [];

    function traverse(node: chrome.automation.AutomationNode) {
        if (!node) return;

        // Check if node is interactive and visible
        if (INTERACTIVE_ROLES.has(node.role) && isNodeVisible(node)) {
            result.push(node);
        }

        // Recursively traverse children
        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    traverse(root);
    return result;
}

/**
 * Check if node is visible
 */
function isNodeVisible(node: chrome.automation.AutomationNode): boolean {
    // Check if node has location (is rendered)
    if (!node.location) return false;

    const { width, height } = node.location;
    if (width <= 0 || height <= 0) return false;

    // Check states
    if (node.state) {
        if (node.state.invisible || node.state.offscreen) return false;
    }

    return true;
}

/**
 * Simplify node to essential properties
 */
function simplifyNode(node: chrome.automation.AutomationNode): A11yNode {
    const simplified: A11yNode = {
        role: node.role,
        name: node.name || undefined,
        value: node.value || undefined,
        description: node.description || undefined,
        url: node.url || undefined
    };

    // Add location if available
    if (node.location) {
        simplified.rect = {
            x: Math.round(node.location.left),
            y: Math.round(node.location.top),
            w: Math.round(node.location.width),
            h: Math.round(node.location.height)
        };
    }

    // Generate a guess selector based on accessible properties
    simplified.guessSelector = generateSelectorFromA11y(node);

    return simplified;
}

/**
 * Generate CSS selector from accessibility properties
 */
function generateSelectorFromA11y(node: chrome.automation.AutomationNode): string {
    // Try to generate a selector that can be used to find the element in DOM
    const selectors: string[] = [];

    // Use role as base
    const tagMap: Record<string, string> = {
        'button': 'button',
        'link': 'a',
        'textbox': 'input',
        'searchbox': 'input',
        'combobox': 'select',
        'checkbox': 'input',
        'radio': 'input'
    };

    const tag = tagMap[node.role] || '*';

    // Add aria-label if available
    if (node.name) {
        selectors.push(`${tag}[aria-label="${node.name}"]`);
        selectors.push(`${tag}[aria-label*="${node.name}"]`);
    }

    // Add role
    if (node.role && node.role !== 'generic') {
        selectors.push(`${tag}[role="${node.role}"]`);
    }

    // Add value for inputs
    if (node.value && (node.role === 'textbox' || node.role === 'searchbox')) {
        selectors.push(`${tag}[value="${node.value}"]`);
    }

    // Fallback to just tag
    if (selectors.length === 0) {
        selectors.push(tag);
    }

    return selectors[0];
}

/**
 * Optimize A11y tree for LLM (similar to DOM optimization)
 */
export function optimizeA11yTree(tree: A11yTree, maxNodes: number = 100): A11yTree {
    return {
        url: tree.url,
        title: tree.title,
        nodes: tree.nodes.slice(0, maxNodes).map(node => ({
            role: node.role,
            name: node.name ? node.name.slice(0, 50) : undefined,
            value: node.value ? node.value.slice(0, 30) : undefined,
            rect: node.rect,
            guessSelector: node.guessSelector
        }))
    };
}

/**
 * Compare token usage: A11y vs DOM
 */
export function estimateTokenReduction(a11yTree: A11yTree, domSnapshot: any): number {
    const a11ySize = JSON.stringify(a11yTree).length;
    const domSize = JSON.stringify(domSnapshot).length;
    return Math.round((1 - a11ySize / domSize) * 100);
}


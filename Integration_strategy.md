Implementation strategy
# WebPilot - Complete Stage-by-Stage Implementation
## Why Theme 2: Strategic Advantage
Theme 2 (Agentic Task Solver) offers the clearest path to victory. Automation
tasks are immediately demonstrable - judges can watch the agent book flights,
fill forms, and navigate websites in real-time. This visible value beats
abstract benefits like privacy or personalization. The technical requirements
also perfectly match what’s achievable in the given timeframe while still
allowing room for innovation.
-----
## Stage 1: Foundation Setup (Days 1-3)
### Chrome Extension Scaffold
Start by creating the basic extension structure that will host all
functionality:
```javascript
// manifest.json - Core configuration
{
"manifest_version": 3,
"name": "WebPilot",
"permissions": ["storage", "tabs", "scripting", "activeTab", "sidePanel"],
"host_permissions": ["<all_urls>"],
"background": {"service_worker": "background.js"},
"content_scripts": [{
"matches": ["<all_urls>"],
"js": ["content.js"],
"run_at": "document_idle"
}]
}
```
### Message Passing System
Establish reliable communication between components. This is critical - get it
wrong and nothing else works:
```javascript
// background.js - Central message hub
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.type === 'ANALYZE_PAGE') {
// Forward to content script
chrome.tabs.sendMessage(sender.tab.id, request, sendResponse);
} else if (request.type === 'EXECUTE_ACTION') {
handleAction(request.action, sender.tab.id).then(sendResponse);
}
return true; // Keep channel open for async response
});
// content.js - DOM interaction layer
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.type === 'ANALYZE_PAGE') {
const analysis = analyzePage();
sendResponse({success: true, data: analysis});
}
return true;
});
```
### Basic DOM Interaction
Implement fundamental interaction capabilities that everything else builds on:
```javascript
// content.js - Core interaction functions
const WebPilotCore = {
click(selector) {
const element = document.querySelector(selector);
if (!element) throw new Error('Element not found');
// Human-like click with random offset
const rect = element.getBoundingClientRect();
const x = rect.left + Math.random() * rect.width;
const y = rect.top + Math.random() * rect.height;
element.dispatchEvent(new MouseEvent('click', {
bubbles: true,
cancelable: true,
clientX: x,
clientY: y
}));
},
type(selector, text) {
const element = document.querySelector(selector);
if (!element) throw new Error('Input not found');
element.focus();
element.value = '';
// Type with human-like delays
for (let char of text) {
element.value += char;
element.dispatchEvent(new Event('input', {bubbles: true}));
// Add 50-150ms delay between keystrokes
}
},
waitForElement(selector, timeout = 5000) {
return new Promise((resolve, reject) => {
const element = document.querySelector(selector);
if (element) return resolve(element);
const observer = new MutationObserver(() => {
const element = document.querySelector(selector);
if (element) {
observer.disconnect();
resolve(element);
}
});
observer.observe(document.body, {childList: true, subtree: true});
setTimeout(() => {
observer.disconnect();
reject(new Error('Timeout waiting for element'));
}, timeout);
});
}
};
```
-----
## Stage 2: Smart Element Detection (Days 4-6)
### Multi-Strategy Finder
The biggest challenge is finding elements reliably across different websites.
Implement multiple detection strategies:
```javascript
class ElementFinder {
constructor() {
this.strategies = [
this.findBySemantic,
this.findByText,
this.findByProximity,
this.findByVisual
];
this.cache = new Map();
}
async findElement(description) {
// Check cache first
const cached = this.cache.get(description);
if (cached && document.querySelector(cached)) {
return document.querySelector(cached);
}
// Try each strategy
for (const strategy of this.strategies) {
try {
const element = await strategy.call(this, description);
if (element && this.isInteractable(element)) {
this.cacheSuccess(description, element);
return element;
}
} catch (e) {
continue; // Try next strategy
}
}
// Last resort: Ask LLM to generate selector
return this.findWithLLM(description);
}
findBySemantic(description) {
// Map descriptions to semantic HTML patterns
const patterns = {
'email input': 'input[type="email"], input[name*="email"]',
'submit button': 'button[type="submit"], input[type="submit"]',
'search box': 'input[type="search"], [role="search"] input',
'password field': 'input[type="password"]',
'next button': 'button:contains("Next"), [aria-label*="next"]'
};
const lower = description.toLowerCase();
for (const [pattern, selector] of Object.entries(patterns)) {
if (lower.includes(pattern.split(' ')[0])) {
const element = document.querySelector(selector);
if (element) return element;
}
}
}
findByText(description) {
// Search by visible text content
const xpath = `//*[contains(text(), '${description}')] | //*[@value='$
{description}']`;
const result = document.evaluate(xpath, document, null,
XPathResult.FIRST_ORDERED_NODE_TYPE);
return result.singleNodeValue;
}
findByProximity(description) {
// Find elements near labels or text matching description
const labels = Array.from(document.querySelectorAll('label, span,
div')).filter(
el => el.textContent.toLowerCase().includes(description.toLowerCase())
);
for (const label of labels) {
// Check for associated form control
const forAttr = label.getAttribute('for');
if (forAttr) {
const input = document.getElementById(forAttr);
if (input) return input;
}
// Check nearby elements
const nearbyInputs = label.parentElement.querySelectorAll('input, button,
select');
if (nearbyInputs.length > 0) return nearbyInputs[0];
}
}
async findWithLLM(description) {
// Generate selector using LLM
const pageStructure = this.getSimplifiedDOM();
const prompt = `Find element matching "${description}" in this structure: $
{pageStructure}`;
const selector = await this.queryLLM(prompt);
return document.querySelector(selector);
}
}
```
### Visual Fallback System
When semantic detection fails, use visual position and appearance:
```javascript
class VisualDetector {
async findByScreenshot(description) {
// Capture viewport screenshot
const screenshot = await this.captureViewport();
// Get element positions
const elements = this.getInteractableElements();
const elementMap = elements.map(el => ({
element: el,
rect: el.getBoundingClientRect(),
text: el.textContent || el.value || ''
}));
// Send to vision model
const target = await this.analyzeWithVision(screenshot, description,
elementMap);
return target?.element;
}
getInteractableElements() {
return Array.from(document.querySelectorAll(
'button, a, input, select, textarea, [onclick], [role="button"]'
)).filter(el => {
const rect = el.getBoundingClientRect();
return rect.width > 0 && rect.height > 0;
});
}
}
```
-----
## Stage 3: Task Planning Engine (Days 7-9)
### Intent Understanding
Convert user requests into actionable plans:
```javascript
class TaskPlanner {
constructor() {
this.llm = new LLMClient();
this.templates = this.loadTaskTemplates();
}
async planTask(userRequest, currentPage) {
// First, check if this matches a known template
const template = this.matchTemplate(userRequest);
if (template) {
return this.adaptTemplate(template, userRequest);
}
// Otherwise, generate new plan
const context = this.extractPageContext(currentPage);
const plan = await this.generatePlan(userRequest, context);
return this.validatePlan(plan);
}
async generatePlan(request, context) {
const prompt = `
User wants to: ${request}
Current page: ${context.url}
Available elements: ${JSON.stringify(context.elements)}
Generate step-by-step actions:
Format: ACTION:TARGET:VALUE
Actions: CLICK, TYPE, SELECT, WAIT, NAVIGATE
`;
const response = await this.llm.query(prompt);
return this.parsePlan(response);
}
parsePlan(planText) {
const steps = [];
const lines = planText.split('\n');
for (const line of lines) {
const match = line.match(/(\w+):([^:]+):?(.*)/);
if (match) {
steps.push({
action: match[1],
target: match[2].trim(),
value: match[3]?.trim()
});
}
}
return steps;
}
}
```
### Action Execution with Error Recovery
Execute plans with automatic retry and alternative strategies:
```javascript
class ActionExecutor {
async executeStep(step, retryCount = 3) {
for (let attempt = 0; attempt < retryCount; attempt++) {
try {
await this.performAction(step);
await this.verifySuccess(step);
return {success: true};
} catch (error) {
console.log(`Attempt ${attempt + 1} failed:`, error);
if (attempt < retryCount - 1) {
// Generate alternative approach
step = await this.generateAlternative(step, error);
await this.wait(1000 * (attempt + 1)); // Exponential backoff
} else {
// Request user help
return this.requestUserIntervention(step, error);
}
}
}
}
async performAction(step) {
const element = await this.finder.findElement(step.target);
switch(step.action) {
case 'CLICK':
await this.clickElement(element);
break;
case 'TYPE':
await this.typeText(element, step.value);
break;
case 'SELECT':
await this.selectOption(element, step.value);
break;
case 'WAIT':
await this.waitFor(step.value);
break;
case 'NAVIGATE':
window.location.href = step.value;
break;
}
}
async generateAlternative(failedStep, error) {
// Ask LLM for alternative approach
const prompt = `
Failed to: ${failedStep.action} on ${failedStep.target}
Error: ${error.message}
Suggest alternative way to achieve same goal
`;
const alternative = await this.llm.query(prompt);
return this.parseAlternative(alternative);
}
}
```
-----
## Stage 4: Context Management (Days 10-12)
### Smart Memory System
Maintain context across pages and sessions:
```javascript
class ContextManager {
constructor() {
this.shortTermMemory = new Map(); // Current session
this.longTermMemory = this.loadFromStorage(); // Persistent
this.checkpoints = [];
}
captureContext() {
// Extract only relevant information
const context = {
url: window.location.href,
timestamp: Date.now(),
formData: this.extractFormData(),
importantElements: this.identifyKeyElements(),
viewport: this.getViewportInfo()
};
// Compress for efficiency
return this.compress(context);
}
compress(context) {
// Remove redundant information
const compressed = {
url: context.url,
data: {}
};
// Keep only filled form fields
for (const [key, value] of Object.entries(context.formData)) {
if (value && value.trim()) {
compressed.data[key] = value;
}
}
return compressed;
}
saveCheckpoint(name) {
const checkpoint = {
name,
state: this.captureContext(),
screenshot: this.captureScreenshot()
};
this.checkpoints.push(checkpoint);
chrome.storage.local.set({checkpoints: this.checkpoints});
return checkpoint.id;
}
async restore(checkpointId) {
const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
if (!checkpoint) return false;
// Navigate to saved URL
if (window.location.href !== checkpoint.state.url) {
window.location.href = checkpoint.state.url;
await this.waitForPageLoad();
}
// Restore form data
for (const [field, value] of Object.entries(checkpoint.state.data)) {
const element = await this.finder.findElement(field);
if (element) element.value = value;
}
return true;
}
}
```
### Cross-Domain Communication
Share information between different websites:
```javascript
class CrossDomainBridge {
constructor() {
this.storage = chrome.storage.local;
}
async shareData(key, value) {
// Encrypt sensitive data
const encrypted = await this.encrypt(value);
await this.storage.set({[`shared_${key}`]: encrypted});
}
async getData(key) {
const result = await this.storage.get([`shared_${key}`]);
if (result[`shared_${key}`]) {
return await this.decrypt(result[`shared_${key}`]);
}
return null;
}
async detectSimilarFields(currentField) {
// Check if this field matches previously filled fields
const history = await this.storage.get(['field_history']);
const similar = this.findSimilar(currentField, history.field_history || []);
return similar;
}
}
```
-----
## Stage 5: User Interface (Days 13-14)
### Side Panel Interface
Create an intuitive interface for task management:
```html
<!-- sidepanel.html -->
<div id="webpilot-panel">
<div class="task-input">
<textarea id="task-description" placeholder="What would you like me to
do?"></textarea>
<button id="execute-btn">Execute Task</button>
</div>
<div class="progress-display">
<h3>Current Task</h3>
<div id="step-list"></div>
<div id="current-step" class="highlight"></div>
</div>
<div class="controls">
<button id="pause">Pause</button>
<button id="resume">Resume</button>
<button id="save-checkpoint">Save Progress</button>
</div>
</div>
```
```javascript
// sidepanel.js - UI Controller
class UIController {
constructor() {
this.initializeEventListeners();
this.taskExecutor = new TaskExecutor();
}
initializeEventListeners() {
document.getElementById('execute-btn').addEventListener('click', () => {
const task = document.getElementById('task-description').value;
this.executeTask(task);
});
}
async executeTask(taskDescription) {
// Show progress
this.updateUI('Planning task...');
// Get current page context
const context = await this.getCurrentPageContext();
// Generate plan
const plan = await this.taskExecutor.planTask(taskDescription, context);
// Display steps
this.displayPlan(plan);
// Execute each step
for (const step of plan.steps) {
this.highlightStep(step);
const result = await this.taskExecutor.executeStep(step);
if (!result.success) {
this.handleError(step, result.error);
break;
}
this.markComplete(step);
}
}
highlightStep(step) {
// Visual feedback in both panel and on page
document.getElementById('current-step').textContent = `${step.action}: $
{step.target}`;
// Highlight element on page
chrome.tabs.sendMessage(activeTab.id, {
type: 'HIGHLIGHT_ELEMENT',
selector: step.targetSelector
});
}
}
```
-----
## Stage 6: Advanced Features (Days 15-16)
### Dynamic Content Handling
Deal with modern SPAs and AJAX content:
```javascript
class DynamicContentHandler {
observeChanges(callback) {
const observer = new MutationObserver((mutations) => {
// Debounce rapid changes
clearTimeout(this.debounceTimer);
this.debounceTimer = setTimeout(() => {
callback(mutations);
}, 500);
});
observer.observe(document.body, {
childList: true,
subtree: true,
attributes: true
});
return observer;
}
async waitForNetworkIdle(timeout = 5000) {
return new Promise((resolve) => {
let pendingRequests = 0;
let idleTimer;
// Intercept fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
pendingRequests++;
return originalFetch.apply(this, args).finally(() => {
pendingRequests--;
checkIdle();
});
};
const checkIdle = () => {
if (pendingRequests === 0) {
clearTimeout(idleTimer);
idleTimer = setTimeout(() => {
window.fetch = originalFetch;
resolve();
}, 500);
}
};
setTimeout(() => {
window.fetch = originalFetch;
resolve();
}, timeout);
});
}
}
```
### Performance Optimization
Make the agent fast and efficient:
```javascript
class PerformanceOptimizer {
constructor() {
this.cache = new Map();
this.batchQueue = [];
}
// Cache LLM responses
async cachedLLMQuery(prompt) {
const hash = this.hashPrompt(prompt);
if (this.cache.has(hash)) {
return this.cache.get(hash);
}
const response = await this.llm.query(prompt);
this.cache.set(hash, response);
// Limit cache size
if (this.cache.size > 100) {
const firstKey = this.cache.keys().next().value;
this.cache.delete(firstKey);
}
return response;
}
// Batch similar operations
async batchExecute(operations) {
const grouped = this.groupByType(operations);
const results = [];
for (const [type, ops] of grouped) {
if (type === 'CLICK') {
// Execute clicks sequentially
for (const op of ops) {
results.push(await this.execute(op));
}
} else if (type === 'TYPE') {
// Can optimize typing operations
results.push(...await this.bulkType(ops));
}
}
return results;
}
}
```
-----
## Three Demonstration Workflows
### 1. Flight Booking (Multi-site Coordination)
```javascript
const flightBookingDemo = {
trigger: "Book cheapest flight to Tokyo next month",
sites: ["kayak.com", "airline website"],
steps: [
{action: "NAVIGATE", target: "kayak.com"},
{action: "TYPE", target: "departure city", value: "New York"},
{action: "TYPE", target: "destination", value: "Tokyo"},
{action: "CLICK", target: "date picker"},
{action: "SELECT", target: "next month dates"},
{action: "CLICK", target: "search button"},
{action: "WAIT", value: "results loaded"},
{action: "CLICK", target: "sort by price"},
{action: "CLICK", target: "first result"},
{action: "EXTRACT", target: "booking details"},
{action: "NAVIGATE", target: "airline checkout"},
{action: "FILL_FORM", target: "passenger details"},
{action: "COMPLETE", target: "payment"}
],
challenges: ["Different site structures", "Dynamic pricing", "Session
management"]
};
```
### 2. Job Application (Information Reuse)
```javascript
const jobApplicationDemo = {
trigger: "Apply to software engineer position",
intelligence: "Reuses information across applications",
features: [
"Detects similar fields across different forms",
"Handles file uploads (resume/cover letter)",
"Adapts answers to question variations",
"Manages multi-page applications"
]
};
```
### 3. Comparison Shopping (Data Extraction)
```javascript
const shoppingDemo = {
trigger: "Compare iPhone 15 prices across major retailers",
extraction: ["Price", "Availability", "Shipping time", "Warranty"],
output: "Structured comparison table",
sites: ["Amazon", "BestBuy", "Apple Store"]
};
```
-----
## Testing & Optimization (Days 17-18)
### Robustness Testing
Ensure the agent handles edge cases:
```javascript
class TestSuite {
async runTests() {
const testCases = [
this.testSlowNetwork(),
this.testPopupHandling(),
this.testCaptchaDetection(),
this.testSessionTimeout(),
this.testDynamicContent()
];
const results = await Promise.all(testCases);
return this.generateReport(results);
}
async testPopupHandling() {
// Test handling of various popups
const popupTypes = ['alert', 'confirm', 'cookie banner', 'newsletter'];
for (const type of popupTypes) {
const result = await this.agent.handlePopup(type);
assert(result.handled, `Failed to handle ${type}`);
}
}
}
```
-----
## Final Deliverables
### Documentation Package
- **README.md**: One-command installation and usage
- **Architecture diagrams**: Visual system overview
- **API documentation**: For extensibility
- **Demo videos**: Three complete workflows
### Evaluation Optimization
- **Working Prototype (30%)**: Three polished, end-to-end workflows
- **UX (20%)**: Natural language input, visual feedback, clear progress
- **Technical Depth (20%)**: Multi-strategy detection, smart recovery, context
compression
- **Theme Alignment (20%)**: Multi-turn workflows, DOM mastery, autonomous
execution
- **Delivery (10%)**: GitHub repo, video demos, comprehensive docs
-----
## Success Metrics
The completed WebPilot should achieve:
- 85% success rate on demonstrated tasks
- 5x faster than manual completion
- Handle top 20 e-commerce/travel sites
- Graceful degradation on unsupported sites
- Natural language task specification
- Recovery from common errors without user intervention
This implementation strategy provides a clear path from basic setup to a winning
hackathon submission, with each stage building on the previous one to create a
robust, intelligent web automation agent.
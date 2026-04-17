<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-ISC-green?style=for-the-badge" alt="License" />
</p>

# ARIA — Autonomous Responsive Intelligent Agent

> **Your personal AI assistant that lives inside Chrome.** Tell it what to do in plain English — it navigates, searches, clicks, types, fills out forms, extracts data, and more — all while you watch.

ARIA is a Chrome side-panel extension that converts **natural-language instructions** into autonomous browser actions. It uses an LLM (or falls back to heuristic patterns) to understand any website, plan multi-step workflows, and execute them in real time with full visual feedback.

---

## ✨ Feature Highlights

| Category | What You Get |
|---|---|
| **Chat-First UI** | Conversational side panel — just type (or speak) what you need |
| **Dual-Mode Engine** | *Heuristic* mode for instant testing, *LLM* mode for full autonomy on any site |
| **Voice Input** | Hands-free task entry via browser speech recognition (`Ctrl+M`) |
| **Smart Element Detection** | Three strategies — DOM/text matching, Accessibility Tree, and Vision — with automatic fallback |
| **Stealth Mode** | Injects into the page context *before* site scripts run to avoid bot detection |
| **Agent Loop** | Multi-step AI planning that observes the page after each action and adapts |
| **Active Tab Indicators** | Pulsing cyan border + floating badge shows you exactly which tab ARIA is controlling |
| **Form Auto-Fill** | Save your profile once; ARIA fills job applications, signups, and more |
| **Data Extraction** | Pull structured data from pages (tables, lists, product info) |
| **Page Summarization** | Get AI-powered summaries of any webpage |
| **Task History** | Every task is logged with success metrics — export as JSON anytime |
| **Safety Guardrails** | Confirmation prompts for destructive actions (purchases, deletions, submissions) |
| **Keyboard Shortcuts** | `Enter` send · `Ctrl+.` stop · `Ctrl+M` voice · `Ctrl+Enter` run |
| **Accessibility** | Skip-nav links, ARIA roles, `aria-live` regions, screen-reader-friendly |

---

## 🚀 Quick Start

### 1 · Install & Build

```bash
git clone <repo-url> && cd WAH_COD3INE
npm install
npm run build          # production build → dist/
```

### 2 · Load in Chrome

1. Navigate to `chrome://extensions/`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. ARIA appears as a side panel icon in your toolbar

### 3 · Try It Instantly (No API Key Needed)

Open the side panel and type:

```
Search for lofi hip hop on YouTube
```

ARIA defaults to **Heuristic mode** — it recognizes common patterns on YouTube, Amazon, Google, and more without any LLM configuration.

### 4 · Unlock Full Power (LLM Mode)

For intelligent automation on *any* website, configure an LLM:

1. Click the **⚙ Settings** gear in the side panel header (opens the Options page)
2. Set **AI Mode** → `Smart Mode (AI Powered)`
3. Enter your **API Endpoint** and **API Key**
4. Pick a **Model** and click **Save**

| Provider | Endpoint | Recommended Model |
|---|---|---|
| [OpenRouter](https://openrouter.ai/) | `https://openrouter.ai/api/v1` | `qwen/qwen-2.5-32b-instruct` |
| [Ollama](https://ollama.ai/) (local, free) | `http://localhost:11434/v1` | `qwen2.5:32b` |
| LM Studio | `http://localhost:1234/v1` | (your loaded model) |
| Any OpenAI-compatible API | varies | varies |

> **Tip:** Use the **Test Connection** button on the Options page to verify your setup before running tasks.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  Side Panel (Chat UI)                               │
│  panel.html → panel/index.ts                        │
│    ├── taskExecutor    — runs steps sequentially     │
│    ├── stepParser      — converts LLM text → steps  │
│    ├── settingsManager — loads config from storage   │
│    ├── voice           — Web Speech API integration  │
│    └── uiState         — manages DOM + chat bubbles  │
├─────────────────────────────────────────────────────┤
│  Background Service Worker (background.ts)          │
│    — routes messages between panel ↔ content script  │
│    — opens side panel on icon click                  │
├─────────────────────────────────────────────────────┤
│  Content Script (content.ts)                        │
│    — DOM interaction: find, click, type, scroll      │
│    — Element detection (heuristic / a11y / vision)   │
│    — Stealth-inject companion for bot evasion        │
│    — Active-tab overlay + highlight animations       │
├─────────────────────────────────────────────────────┤
│  Shared Modules (shared/)                           │
│    ├── llmClient          — OpenAI-compatible API    │
│    ├── visionClient       — screenshot-based detect  │
│    ├── storage            — Chrome storage helpers    │
│    ├── userProfile        — profile CRUD             │
│    ├── safety             — destructive-action guard  │
│    ├── confirmations      — user confirmation flows   │
│    ├── conversation       — chat context management   │
│    ├── sessionMemory      — cross-step memory         │
│    ├── sitePatterns       — per-site heuristic rules  │
│    ├── communityPatterns  — crowd-sourced patterns     │
│    ├── taskClassifier     — intent classification     │
│    ├── taskMatcher        — history-based matching     │
│    ├── actionClassifier   — action type inference     │
│    ├── accessibilitySnapshot — a11y tree capture      │
│    ├── infoGathering      — page information extract  │
│    ├── stealth            — anti-detection utilities   │
│    └── telemetry          — anonymous usage metrics    │
├─────────────────────────────────────────────────────┤
│  Workflows (workflows/)                             │
│    ├── formFilling        — multi-field form entry    │
│    ├── dataExtraction     — structured data scraping  │
│    └── summarization      — page summary generation   │
├─────────────────────────────────────────────────────┤
│  Options Page (options.html + options.ts)            │
│    — AI config, profile, task history, keyboard info  │
└─────────────────────────────────────────────────────┘
```

### Message Flow

```
User Input → Side Panel → Background Worker → Content Script → DOM
                ↑                                      ↓
                └──────── Progress / Results ───────────┘
```

### Supported Actions

| Action | Description |
|---|---|
| `NAVIGATE` | Open a URL in the active tab |
| `FIND` | Locate an element by semantic description |
| `TYPE` | Enter text into an input / textarea |
| `CLICK` | Click a button, link, or any element |
| `WAIT` | Wait for an element or condition to appear |
| `HIGHLIGHT` | Visual pulse on the target element |
| `SCROLL` | Scroll to a position or element |
| `EXTRACT` | Pull data from the page |

ARIA does **not** include any API keys. You must provide your own LLM API key for optimal performance across different websites.

### Option 1: Together AI (Recommended for Speed & Performance)

Together AI offers the fastest inference for open-source models, making the agent feel much snappier.

1. Sign up at [together.ai](https://www.together.ai/)
2. Get your API key from the dashboard
3. In ARIA side panel:
   - **Mode**: Select "LLM via proxy"
   - **Base URL**: `https://api.together.ai/v1`
   - **API Key**: Paste your Together AI API key
   - **Model**: `meta-llama/Llama-3.3-70B-Instruct-Turbo` (Recommended Serverless)
4. Click **"Save"**

**Recommended Serverless Models:**
- **Llama 3.3 70B Turbo** (`meta-llama/Llama-3.3-70B-Instruct-Turbo`):
  - **Best Value**: ~$0.88 per 1M tokens (much cheaper than typical 70B models).
  - **Performance**: Excellent reasoning and full **Tool Calling** support.
  - **Speed**: Very fast inference.
- **Qwen 2.5 Coder 32B**: Good alternative for coding-specific tasks.
- **DeepSeek V3**: Strong reasoning capabilities.

> **Note:** We highly recommend **Llama 3.3 70B Turbo** for the best balance of performance and cost.

### Option 2: OpenRouter (Easiest & Most Flexible)

1. Sign up at [openrouter.ai](https://openrouter.ai/)
2. Get your API key from the dashboard
3. In ARIA side panel:
   - **Mode**: Select "LLM via proxy"
   - **Base URL**: `https://openrouter.ai/api/v1`
   - **API Key**: Paste your OpenRouter API key
   - **Model**: `qwen/qwen-2.5-72b-instruct` (recommended)
4. Click **"Save"**

### Option 3: Ollama (Local, Free)

1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Download a model: `ollama pull qwen2.5:32b`
3. Start Ollama (runs on `http://localhost:11434`)
4. In ARIA side panel:
   - **Mode**: Select "LLM via proxy"
   - **Base URL**: `http://localhost:11434/v1`
   - **API Key**: Leave empty
   - **Model**: `qwen2.5:32b`
5. Click **"Save"**

### Option 4: Other LLM Providers

You can use any OpenAI-compatible API:
- Anyscale
- Replicate
- Your own vLLM/LM Studio server

Just configure the Base URL, API Key, and Model name accordingly.

## 📁 Project Structure

```
WAH_COD3INE/
├── src/
│   ├── manifest.ts              # MV3 manifest definition
│   ├── background.ts            # Service worker
│   ├── content.ts               # Content script (DOM interaction)
│   ├── stealth-inject.ts        # Pre-page-load stealth injection
│   ├── panel.html               # Side panel UI shell
│   ├── panel/                   # Side panel modules
│   │   ├── index.ts             # Entry point
│   │   ├── taskExecutor.ts      # Step execution engine
│   │   ├── stepParser.ts        # LLM response → action steps
│   │   ├── settingsManager.ts   # Config loader
│   │   ├── voice.ts             # Speech-to-text
│   │   ├── uiState.ts           # UI DOM management
│   │   ├── historyManager.ts    # Chat history
│   │   ├── profileManager.ts    # Profile UI binding
│   │   └── styles/main.css      # Design system
│   ├── shared/                  # Shared utilities (18 modules)
│   ├── workflows/               # Complex task workflows
│   ├── options.html             # Full-page settings UI
│   ├── options.ts               # Options page logic
│   └── analytics.html           # Usage analytics page
├── tests/                       # Vitest test suite
├── dist/                        # Build output (load this in Chrome)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔧 Development

```bash
npm install          # install dependencies
npm run dev          # dev server with HMR + watch
npm run build        # production build → dist/
npm run test         # run Vitest test suite
```

After building, reload the extension in `chrome://extensions/` to pick up changes.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| **"Element not found"** | Switch to **LLM mode** for better detection, or reload the page after installing the extension |
| **LLM returns no steps** | Verify API key + credits · check the browser console (F12) · try a different model |
| **"Could not establish connection"** | Reload the page · re-enable the extension in `chrome://extensions/` |
| **Page loads slowly** | Increase the wait timeout in `content.ts` (default 8 s) |
| **Voice input not working** | Make sure your browser allows microphone access · use Chrome (best support) |

---

## 📜 License

ISC — see `package.json`.

Built with **TypeScript**, **Vite**, **@crxjs/vite-plugin**, and the **Chrome Extension APIs (Manifest V3)**.

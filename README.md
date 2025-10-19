# ARIA - Autonomous Responsive Intelligent Agent

A Chrome extension that automates web tasks using AI planning and intelligent element detection. Built for Samsung Web Agentic AI demonstration.

## 🎯 What It Does

ARIA is a Chrome extension that can understand natural language commands and execute them on websites. It can navigate, search, click, type, and interact with web pages automatically.

**Tested and verified commands**:
- "Search for lofi hip hop on YouTube"
- "Search for iPhone 15 Pro Max on Amazon"
- "Search for wireless headphones on Amazon"
- "Search for cats on YouTube"

## ✨ Key Features

- **Dual-Mode Operation**: 
  - **Heuristic Mode**: Quick start option for testing
  - **LLM Mode**: Enhanced intelligent operation across all websites using AI to understand page structure
- **Smart Element Detection**: Finds buttons, inputs, and links using semantic matching
- **Shadow DOM Support**: Works with modern web components
- **Live Progress Tracking**: See each step as it executes
- **Automatic Fallback**: Robust error handling and retry mechanisms

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
# Clone or download this repository
cd ARIA-Autonomous-Responsive-Intelligent-Agent

# Install dependencies
npm install

# Build the extension
npm run build
```

### Step 2: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `dist` folder from this project

### Step 3: Configure LLM for Efficient Operation

**Important**: To use ARIA efficiently across all websites, configure an LLM API key.

#### Quick Test Mode (Optional)
For initial testing with YouTube and Amazon, you can:
1. Click the ARIA extension icon in Chrome toolbar
2. Side panel opens on the right
3. In "LLM Settings" section, select **"Heuristic (no LLM)"** for quick testing
4. Try: `Search for cats on YouTube` or `Search for iPhone 15 Pro Max on Amazon`

However, for full functionality and efficient operation on all websites, please configure LLM mode (see below).

## 🧪 Tested & Working Use Cases

### ✅ YouTube Search (Heuristic Mode)

**Command**: `Search for [anything] on YouTube`

**Examples**:
- "Search for lofi hip hop on YouTube"
- "Search for coding tutorials on YouTube"
- "Search for funny cat videos on YouTube"

**What it does**:
1. Navigates to https://www.youtube.com
2. Waits for page to load completely
3. Finds the search input box
4. Types your search query
5. Clicks the search button
6. Shows you the results

### ✅ Amazon Search (Heuristic Mode)

**Command**: `Search for [product] on Amazon`

**Examples**:
- "Search for iPhone 15 Pro Max on Amazon"
- "Search for wireless headphones on Amazon"
- "Search for laptop stand on Amazon"

**What it does**:
1. Navigates to https://www.amazon.com
2. Waits for page to load
3. Finds the search input box
4. Types your product query
5. Clicks the search button
6. Shows you the results

## 🤖 LLM Integration (Required for Efficient Multi-Site Operation)

To use ARIA efficiently across all websites, configure an LLM API key.

### Important: Add Your Own LLM API Key

ARIA does **not** include any API keys. You must provide your own LLM API key for optimal performance across different websites.

### Option 1: OpenRouter (Easiest)

1. Sign up at [openrouter.ai](https://openrouter.ai/)
2. Get your API key from the dashboard
3. In ARIA side panel:
   - **Mode**: Select "LLM via proxy"
   - **Base URL**: `https://openrouter.ai/api/v1`
   - **API Key**: Paste your OpenRouter API key
   - **Model**: `qwen/qwen-2.5-32b-instruct` (recommended, Apache 2.0 license)
4. Click **"Save"**

**Recommended Models** (all open-source with permissive licenses):
- `qwen/qwen-2.5-32b-instruct` (Apache 2.0) - Best overall
- `mistralai/mixtral-8x7b-instruct` (Apache 2.0) - Fast
- `meta-llama/llama-3.3-70b-instruct` (Llama 3 license)

### Option 2: Ollama (Local, Free)

Run models locally on your machine:

1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Download a model: `ollama pull qwen2.5:32b`
3. Start Ollama (runs on `http://localhost:11434`)
4. In ARIA side panel:
   - **Mode**: Select "LLM via proxy"
   - **Base URL**: `http://localhost:11434/v1`
   - **API Key**: Leave empty
   - **Model**: `qwen2.5:32b`
5. Click **"Save"**

### Option 3: Other LLM Providers

You can use any OpenAI-compatible API:
- Together AI
- Anyscale
- Replicate
- Your own vLLM/LM Studio server

Just configure the Base URL, API Key, and Model name accordingly.

## 📁 Project Structure

```
ARIA-Autonomous-Responsive-Intelligent-Agent/
├── src/
│   ├── manifest.ts          # Chrome extension manifest
│   ├── background.ts         # Service worker (message routing)
│   ├── content.ts            # Content script (DOM interaction)
│   ├── panel.ts              # Side panel logic
│   ├── panel.html            # Side panel UI
│   └── shared/
│       ├── types.ts          # TypeScript interfaces
│       ├── storage.ts        # Chrome storage helpers
│       └── llmClient.ts      # LLM API client
├── dist/                     # Build output (load this in Chrome)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🏗️ Architecture

### How It Works

1. **User Input**: You type a command in the side panel
2. **Task Planning**:
   - **Heuristic Mode**: Quick pattern-based approach for testing
   - **LLM Mode**: AI analyzes the page and generates intelligent steps for all websites
3. **Execution**: Content script executes steps one by one
4. **Feedback**: Progress displayed in real-time

### Message Flow

```
Side Panel (UI) → Background Script → Content Script → DOM
     ↑                                        ↓
     └────────── Progress Updates ────────────┘
```

### Supported Actions

- **NAVIGATE**: Go to a URL
- **FIND**: Locate an element by description
- **TYPE**: Enter text into an input field
- **CLICK**: Click a button or link
- **WAIT**: Wait for an element to appear
- **HIGHLIGHT**: Visual feedback on found elements

## 🔧 Development

### Build Commands

```bash
npm install          # Install dependencies
npm run build        # Build for production
npm run dev          # Build with watch mode
```

### Extending Functionality

You can extend ARIA by customizing pattern recognition in `src/panel.ts` or enhancing the LLM prompts for better page understanding. The modular architecture allows for easy customization and extension of supported actions and workflows.

## 🐛 Troubleshooting

### "Element not found" errors

- Configure LLM mode for better element detection across all websites
- Reload the page after reloading the extension
- Try the command again

### LLM returns no steps

- Check that you've entered your API key correctly
- Verify the API key has credits (for paid services)
- Check browser console for errors (F12)
- Try a different model if the current one isn't responding

### "Could not establish connection" errors

- Reload the page after loading the extension
- Make sure the extension is enabled in `chrome://extensions/`
- Try clicking the extension icon again

### Page not loading completely

- Increase the wait timeout in `src/content.ts` (default 8 seconds)
- Some websites may need longer to stabilize

## 📜 Licenses

### This Project

Built with open-source tools under permissive licenses:
- **TypeScript** (Apache 2.0)
- **Vite** (MIT)
- **Chrome Extension APIs** (Google)

### Recommended LLMs

Use open-source models with permissive licenses:
- **Qwen 2.5** (Apache 2.0) - Recommended
- **Mixtral** (Apache 2.0)
- **Phi-3** (MIT)
- **Llama 3.3** (Llama 3 Community License)

⚠️ **Note**: OpenAI models are NOT recommended due to closed-source and restrictive licensing.

## 🎥 Demo

Try these verified commands to see ARIA in action:

1. **YouTube Search**: "Search for lofi hip hop on YouTube"
2. **Amazon Search**: "Search for mechanical keyboard on Amazon"

For best results across all websites, configure LLM mode with your API key.

## 🙏 Credits

Built for Samsung Web Agentic AI demonstration.

**Technologies Used**:
- Chrome Extension Manifest V3
- TypeScript
- Vite + @crxjs/vite-plugin
- Chrome APIs (storage, scripting, sidePanel, tabs)

---

## 📞 Support

If you encounter issues:
1. Check the **Troubleshooting** section above
2. Ensure your LLM API key is configured correctly for multi-site operation
3. Make sure the extension is properly loaded in Chrome
4. Try reloading both the extension and the page

**Recommendation**: For the best experience across all websites, configure **LLM mode** with your API key!

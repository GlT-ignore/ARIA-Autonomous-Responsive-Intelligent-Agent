# WebPilot - Quick Start Guide

## 🚀 Get Started in 3 Minutes

### Step 1: Reload Extension (30 seconds)
```bash
# Already built! Just reload in Chrome
```
1. Open `chrome://extensions/`
2. Find "WebPilot"
3. Click the **Reload** button (circular arrow icon)
4. Done! Extension is updated with all improvements.

### Step 2: Test Without LLM (1 minute)
No API keys needed, works immediately!

1. **Open WebPilot**:
   - Click the WebPilot extension icon in Chrome toolbar
   - Side panel opens on the right

2. **Configure Mode**:
   - Expand "LLM Settings"
   - Select **"Heuristic (no LLM)"**
   - Click "Save"

3. **Test YouTube**:
   - In "Task" field, type: `Search for cats on YouTube`
   - Click **"Run"**
   - Watch the progress bar show live steps!
   - Expected: Opens YouTube → Types in search → Clicks search button

4. **Test Amazon**:
   - In "Task" field, type: `Search for iPhone 14 Pro Max on Amazon`
   - Click **"Run"**
   - Expected: Opens Amazon → Types in search → Submits

### Step 3: Add LLM Power (1-2 minutes)
Make it work on ANY site!

#### Option A: OpenRouter (Easy, Free Tier Available)
1. Go to [openrouter.ai](https://openrouter.ai/) → Sign up
2. Dashboard → Copy your API key
3. In WebPilot:
   - Mode: **"LLM via proxy"**
   - Base URL: `https://openrouter.ai/api`
   - API Key: (paste your key)
   - Model: `qwen/qwen-2.5-32b-instruct` or `qwen/qwen-2.5-vl-72b-instruct:free`
   - Click "Save"
4. Test: `Search for machine learning on YouTube`
5. LLM reads the page, plans steps, executes!

#### Option B: Ollama (Local, 100% Free)
1. Install from [ollama.ai](https://ollama.ai/)
2. Terminal: `ollama pull qwen2.5:32b`
3. Ollama runs on `http://localhost:11434` automatically
4. In WebPilot:
   - Mode: **"LLM via proxy"**
   - Base URL: `http://localhost:11434`
   - API Key: (leave empty)
   - Model: `qwen2.5:32b`
   - Click "Save"
5. Test any task!

---

## 🎯 What Can You Do Now?

### ✅ Works Great (Heuristic Mode)
- YouTube search
- Amazon search
- Instagram navigation (add patterns yourself)

### ✅ Works with LLM
- Any site! LLM reads the page and figures it out
- Complex multi-step tasks
- Dynamic websites

### 🧪 Try These Tasks
1. `Search for lofi hip hop on YouTube and play the first result`
2. `Search for mechanical keyboard on Amazon`
3. `Open Instagram` (with LLM: it navigates automatically)
4. `Go to GitHub and search for AI agents`

---

## 👀 What You'll See

### Progress Display
```
Starting task (5 steps)...
Step 1/5: NAVIGATE https://www.youtube.com/
Step 2/5: FIND search box
Step 3/5: TYPE lofi hip hop
Step 4/5: FIND search button
Step 5/5: CLICK 
✅ Task completed!
```

### Log Output (JSON)
```json
{"status":"Starting","steps":5}
{"status":"Waiting for page ready..."}
{"step":{"action":"FIND","value":"search box"}}
{"id":"...","success":true,"data":{"selector":"input#search"}}
...
{"status":"Done"}
```

---

## 🐛 Troubleshooting

### "Element not found"
- ✅ **Fixed!** Now waits for page to be ready (network-idle + DOM-settle)
- If still happens, reload the page (extension was just updated)

### "search box" finds button instead of input
- ✅ **Fixed!** ElementFinder now prioritizes inputs
- Try again, should find the input field

### LLM returns no steps
- ✅ **Fixed!** Automatically falls back to heuristic mode
- Check log for `{"info":"LLM returned no steps, using heuristic planner"}`

### "Could not establish connection"
- Reload the page after reloading extension
- Content script needs to reconnect

---

## 📊 How It Works

### Heuristic Mode (No LLM)
```
You: "Search for cats on YouTube"
   ↓
WebPilot: Recognizes "youtube" + "search for X"
   ↓
Plan: NAVIGATE → FIND search box → TYPE "cats" → FIND search button → CLICK
   ↓
Execute: Uses hardcoded selectors (fast, reliable)
```

### LLM Mode
```
You: "Search for cats on YouTube"
   ↓
WebPilot: Takes DOM snapshot (visible elements, attributes)
   ↓
LLM: Reads snapshot, understands page structure
   ↓
LLM: Generates plan with selectors: 
     NAVIGATE:https://youtube.com
     FIND:search box->input[aria-label="Search"]
     TYPE:input[aria-label="Search"]:cats
     CLICK:button[aria-label="Search"]
   ↓
Execute: Uses LLM-generated selectors (works on any site!)
```

---

## 🎉 Key Improvements

### Before
- ❌ LLM often failed silently
- ❌ "search box" found buttons
- ❌ Timeouts after navigation
- ❌ No feedback during execution
- ❌ Only YouTube worked

### After
- ✅ LLM validated + automatic fallback
- ✅ Smart element finding (inputs prioritized)
- ✅ Page readiness detection (network-idle)
- ✅ Live progress display
- ✅ YouTube + Amazon + any site with LLM

---

## 📞 Need Help?

### Check These Files
- **README.md**: Full documentation, architecture, user stories
- **REFACTOR_SUMMARY.md**: What was fixed and why
- **REFACTOR_PLAN.md**: Detailed implementation checklist

### Common Questions
**Q: Do I need an API key?**
A: No! Heuristic mode works without any keys for YouTube/Amazon.

**Q: Which LLM is best?**
A: Qwen 2.5 32B (Apache license) via OpenRouter or Ollama.

**Q: Can I use OpenAI?**
A: Not recommended (closed-source, restrictive license). Use open-source models.

**Q: How do I add new sites?**
A: Edit `src/panel.ts` (add heuristic pattern) and `src/content.ts` (add selectors), then rebuild with `npm run build`.

---

## 🚀 You're Ready!

1. ✅ Extension reloaded
2. ✅ Heuristic mode tested (YouTube, Amazon)
3. ✅ (Optional) LLM configured
4. ✅ Progress display working
5. ✅ No more "Not found" errors

**Go automate the web! 🎯**







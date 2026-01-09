# WebPilot Refactor Plan

## Issues Identified
1. **LLM mode returns empty**: LLM gets snapshot but sometimes returns "status:Starting,steps:0,status:Done" → no steps planned.
2. **Element finding priority wrong**: On YouTube, FIND "search box" returns the search button instead of the input field.
3. **Post-navigation timing**: After NAVIGATE, selectors aren't ready yet → "Not found/Timeout".
4. **No visual feedback**: User can't see which step is running live.
5. **Heuristic mode works better sometimes**: Because it uses hardcoded selectors; LLM snapshot may lack critical attributes.
6. **No vision fallback**: Screenshots could help LLM/vision model locate elements when DOM snapshot isn't enough.

## Solutions

### 1. Network-idle + DOM-settle wait after NAVIGATE
- Add `waitForPageReady()` in content script: hook fetch, observe mutations, wait for 500ms idle + readyState complete.
- Call after every NAVIGATE before proceeding.

### 2. Improve DOM snapshot quality
- Include: `placeholder`, `value`, `title`, `data-*` attrs, computed `display`/`visibility`.
- Prioritize interactive elements (input, button, a, select).
- Send top 200 candidates ranked by interactability + visibility.

### 3. Fix ElementFinder priority
- In `findBySemantic`, when description contains "box/input/field/bar", ONLY return `<input>` or `<textarea>`.
- Skip buttons entirely for input-like descriptions.

### 4. Add screenshot + vision fallback
- New action: SCREENSHOT → capture viewport → send to vision model with candidates overlay.
- Vision model returns element index or description → map back to selector.
- Use only when FIND fails after 2 attempts.

### 5. Per-step progress UI
- Add a `<div id="progress">` in panel showing: "Step 2/5: FIND search box".
- Update live during execution.

### 6. LLM prompt validation
- After LLM response, check if steps.length > 0.
- If empty, log reason and fall back to heuristic planner.
- Improve prompt: give explicit example with snapshot + task → steps.

### 7. Strengthen heuristic planner
- Add patterns for Amazon, MakeMyTrip, Instagram (not just YouTube).
- Use site-specific selectors that work.

## Implementation Order
1. waitForPageReady + call after NAVIGATE
2. Improve DOM snapshot (placeholder, value, title, data-*)
3. Fix ElementFinder priority (inputs over buttons)
4. Add progress UI
5. LLM fallback + validation
6. Screenshot/vision (optional, needs vision model config)
7. Test: YouTube search, Amazon search, booking flow

## Testing Checklist
- [x] Network-idle + DOM-settle wait implemented
- [x] DOM snapshot improved (placeholder, value, title, computed styles)
- [x] ElementFinder priority fixed (inputs over buttons for "search box")
- [x] Progress UI added (live step display)
- [x] LLM fallback + validation added
- [x] Amazon support added to heuristic mode
- [ ] YouTube: "Search for lofi hip hop" → types in input, clicks button
- [ ] Amazon: "Search for iPhone 14 Pro Max" → types in input, clicks search
- [ ] Heuristic mode: same tasks without LLM
- [ ] LLM mode: snapshot has enough info, plans correct steps
- [ ] After NAVIGATE: no "Not found" on first FIND

## Completed Improvements
1. ✅ Added `waitForPageReady()` in content script: hooks fetch, observes mutations, waits for idle
2. ✅ DOM snapshot now filters visible elements, includes placeholder/value/title/classes
3. ✅ ElementFinder checks if description is input-like, skips buttons for "search box" queries
4. ✅ Added `<div id="progress">` in panel.html with live step updates
5. ✅ LLM validation: logs error, falls back to heuristic if steps.length === 0
6. ✅ Amazon heuristic pattern added (navigate → find search box → type → find button → click)
7. ✅ Amazon selectors added to content.ts (#twotabsearchtextbox, #nav-search-submit-button)
8. ✅ Fixed element finder matching: sorts by longest key first so "search button" doesn't match "search box"
9. ✅ Improved TYPE retry logic: 3 attempts with exponential backoff (1s, 2s delays)
10. ✅ Added 500ms settle delay after FIND to let page animations complete


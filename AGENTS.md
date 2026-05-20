# G2 Ad Creative Generator — Agent Context

## What This Does
Generates 4 Figma ad creative frames for a G2 software category. Takes 6 product logos + a category name, generates ad copy via Claude, then populates 4 template variants in Figma.

## Stack
- Node.js + Express backend (`server.js`)
- Vanilla JS frontend (`public/`)
- Figma Plugin API for all Figma writes (via MCP `figma_use_figma`)
- Anthropic Claude for copy generation (via G2's LiteLLM proxy)

## How to Start the Server
```bash
cd /Users/asilverberg/Documents/Projects/g2-ad-creative-generator
node server.js
# Runs at http://localhost:3000
```

---

## Figma File
- **File key**: `YPhWl116Z7EppRE7ZgYS1Y`
- **Page**: `276:18846` ("Automated Creative Creator")
- **Templates section node**: `351:18168` (named "Templates")

## Template Node IDs
All templates live inside the "Templates" section on page `276:18846`.

| Template | Node ID | Type |
|---|---|---|
| T1 Blue (1200×1200, short header) | `299:21865` | COMPONENT |
| T1 Yellow (1200×1200, short header) | `278:19363` | FRAME |
| T2 Blue (1200×1200, long header) | `277:19309` | FRAME |
| T2 Yellow (1200×1200, long header) | `278:19408` | FRAME |
| T3 Blue (1200×627, short header) | `276:18999` | FRAME |
| T3 Yellow (1200×627, short header) | `278:19642` | FRAME |
| T4 Blue (1200×627, long header) | `276:19167` | FRAME |
| T4 Yellow (1200×627, long header) | `278:19785` | FRAME |

**T1 Blue is a COMPONENT** — must use `createInstance().detachInstance()` to clone it, not `.clone()`.

---

## Template Selection Logic
Based on `copy.headerMode` from the manifest:
- `"short"` (≤22 chars rendered width safe) → duplicate T1 Blue + T1 Yellow + T3 Blue + T3 Yellow
- `"long"` (29–50 chars) → duplicate T2 Blue + T2 Yellow + T4 Blue + T4 Yellow

Output: 4 frames placed in a new **Section** named after `categoryName`, below the Templates section.

## Frame Layout Within Section
Frames are arranged **horizontally in a 1×4 row**, grouped by color (Blue pair first, Yellow pair second):
```
[T1/T2 Blue] [T3/T4 Blue] [T1/T2 Yellow] [T3/T4 Yellow]
```
- All frames top-aligned at y=80 (PADDING)
- 160px gap between frames
- 80px padding on all sides of section
- Section sized to hug all 4 frames

---

## Copy Constraints (from actual Figma font metrics)
Character limits derived from measured render widths at the actual font sizes:

| Field | T1/T2 (1200×1200) | T3/T4 (1200×627) |
|---|---|---|
| Short header font | 103px Bold | 70px Bold |
| Long header font | 103px Bold (2-line) | 66.8px Bold (2-line) |
| Body font (2-line) | 48px Regular | 36px Regular |
| Body font (1-line) | 43px Regular | 32px Regular |

**Safe limits** (measured, not estimated):
- Short header: **≤22 chars** (character count is unreliable — always measure render width. Wide-glyph words like "Security", "Software", "Management" can exceed limits even under 22 chars)
- Long header: **29–50 chars**
- 2-line body: **≤65 chars**
- 1-line body: **≤55 chars**

**CRITICAL**: Always measure headers in Figma before applying. Use this plugin snippet:
```js
await figma.loadFontAsync({ family: "Figtree", style: "Bold" });
const tmp = figma.createText();
tmp.fontName = { family: "Figtree", style: "Bold" };
tmp.fontSize = 103; // or 70 for T3
tmp.textAutoResize = "WIDTH_AND_HEIGHT";
tmp.characters = "Your header here";
const fits = tmp.width <= 1086; // 739 for T3
tmp.remove();
```

After setting text, restore HUG sizing to match template auto-layout behavior:
```js
header.textAutoResize = 'HEIGHT';
header.layoutSizingVertical = 'HUG';
body.textAutoResize = 'HEIGHT';
body.layoutSizingVertical = 'HUG';
```
Do NOT use `textAutoResize = 'NONE'` with fixed heights — the parent containers use vertical auto-layout and HUG sizing. Locking heights causes body copy to overlap the header.

---

## Text Node Names (inside templates)
- Header: `"Header - 1 line"` or `"Header - 2 lines"`
- Body: `"Body Copy - 2 lines"` or `"Body Copy - 1 line"`
- CTA: contains `"{category}"` in its characters

---

## Logo Slot Structure (inside cloned frames)
Logo slots are named `"Logo.svg"` and are FRAME nodes with no children.
- T1 Yellow logo slots: `Logo 1 Frame > Logo.svg` (6 slots)
- T3 Blue/Yellow logo slots: `Logo 1`, `Logo 2`... `Logo 6` > `Logo.svg` (grid order: 1,4 / 2,5 / 3,6)
- T1 Blue (detached component): logo slots are `INSTANCE > SLOT` children under the `"Logos"` FRAME

To set image fill on a logo slot:
```js
slotNode.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FIT' }];
```

---

## "Apply Manifest to Figma" Workflow
The app has no automatic Figma integration. When user says "Apply the manifest to Figma":

1. Read manifest: `curl http://localhost:3000/api/manifest`
2. **Measure header** in Figma at actual font size — reject if it wraps
3. If header doesn't fit, generate new copy (see copy constraints above)
4. Delete any existing section with the same `categoryName`
5. Switch to page `276:18846`
6. Clone 4 templates (based on `headerMode`), update text nodes, restore HUG sizing
7. Upload logos via `figma_upload_assets` (max 5 at a time) → get image hashes
8. Apply image hashes to `Logo.svg` slots in all 4 frames
9. Wrap all 4 frames in a new Section named `categoryName`
   - Position: find lowest bottom edge across all sections on the page → place 200px below it
   - Align x to match existing sections
   - Layout: 1×4 horizontal row `[T1/T2 Blue] [T3/T4 Blue] [T1/T2 Yellow] [T3/T4 Yellow]`

---

## Logo Scraper
File: `src/logo-fetcher.js`

G2 serves logos at `images.g2crowd.com`. The scraper:
1. Fetches the G2 product page
2. Finds `img[alt="Product Avatar Image"]` elements with real g2crowd URLs (skips transparent GIF placeholders)
3. Prefers URLs containing the product name
4. Constructs the `large_detail` URL variant — this is the actual logo image:
   - Base URL: `images.g2crowd.com/uploads/product/image/{hash}/{name}.png`
   - Large detail: `images.g2crowd.com/uploads/product/image/large_detail/large_detail_{hash}/{name}.png`

**Known issue**: The base URL often returns a tiny placeholder. Always use `large_detail`.

---

## Logo Upload to Figma
- Use `figma_upload_assets` (max 5 per call)
- POST raw PNG bytes to each `submitUrl` with `Content-Type: image/png`
- Capture `imageHash` from response
- Apply hash as IMAGE fill on the correct `Logo.svg` node
- Do NOT use PIL to resize logos — it corrupts them. Use `sips -Z 512` if needed.

---

## Known Issues / Gotchas
- **T1 Blue is a COMPONENT**: `.clone()` silently fails; use `createInstance().detachInstance()`
- **Text auto-resize**: Cloned frames inherit `textAutoResize: "HEIGHT"` — always set to `NONE` and fix height after writing characters
- **zsh array indexing starts at 1**: When looping over bash arrays in zsh, index 0 is empty — use Python or node for batch uploads
- **Figma content-hash dedup**: If two logos are visually near-identical, Figma gives them the same hash. This is expected.
- **Copy character count ≠ rendered width**: Wide glyphs (S, W, M) render much wider than narrow ones (i, l). Always measure, never assume.
- **Section containment**: Add frames to section with `section.appendChild(frame)` BEFORE resizing the section. Frames positioned relative to section origin (0,0).

---

## Environment Variables (in `.env`)
```
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BASE_URL=https://llmproxy.g2.com
FIGMA_FILE_KEY=YPhWl116Z7EppRE7ZgYS1Y
FIGMA_ACCESS_TOKEN=...
PORT=3000
```

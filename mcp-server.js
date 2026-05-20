require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;
const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const TEMP_DIR = path.join(__dirname, 'temp');
const PAGE_ID = '276:18846';

const server = new McpServer({ name: 'g2-ad-creative-generator', version: '1.0.0' });

function figmaHeaders() {
  return { 'X-Figma-Token': FIGMA_ACCESS_TOKEN };
}

function toSentenceCase(str) {
  if (!str) return str;
  const result = str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  return result.replace(/([.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
}

function ensurePeriod(str) {
  if (!str) return str;
  return /[.!?]$/.test(str.trim()) ? str.trim() : str.trim() + '.';
}

function svgUrlToLargeDetailPng(url) {
  if (!url.includes('hd_favicon') && !url.endsWith('.svg')) return url;
  const match = url.match(/\/uploads\/product\/([^/]+)\/([^/]+)\/([^/]+)\.(svg|png|jpg)$/);
  if (!match) return url;
  return `https://images.g2crowd.com/uploads/product/image/large_detail/large_detail_${match[2]}/${match[3]}.png`;
}

function buildFigmaScript({ categoryName, header, body, cta, headerMode, imageHashes }) {
  const isShort = headerMode === 'short';
  const templateIds = isShort
    ? { largeBlue: '299:21865', largeYellow: '278:19363', smallBlue: '276:18999', smallYellow: '278:19642' }
    : { largeBlue: '277:19309', largeYellow: '278:19408', smallBlue: '276:19167', smallYellow: '278:19785' };
  const headerNodeName = isShort ? 'Header - 1 line' : 'Header - 2 lines';
  const bodyNodeName = isShort ? 'Body Copy - 2 lines' : 'Body Copy - 1 line';
  const safeHeader = header.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeBody = body.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeCta = cta.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `(async () => {
  const page = figma.root.children.find(p => p.id === '${PAGE_ID}');
  await figma.setCurrentPageAsync(page);
  await Promise.all([
    figma.loadFontAsync({ family: 'Figtree', style: 'Bold' }),
    figma.loadFontAsync({ family: 'Figtree', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Figtree', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Figtree', style: 'Semi Bold' }),
  ]);
  const existing = page.children.find(n => n.type === 'SECTION' && n.name === '${categoryName}');
  if (existing) existing.remove();
  const isT1Blue = '${templateIds.largeBlue}' === '299:21865';
  const lbSrc = page.findOne(n => n.id === '${templateIds.largeBlue}');
  const fLargeBlue = isT1Blue ? lbSrc.createInstance().detachInstance() : lbSrc.clone();
  const fLargeYellow = page.findOne(n => n.id === '${templateIds.largeYellow}').clone();
  const fSmallBlue = page.findOne(n => n.id === '${templateIds.smallBlue}').clone();
  const fSmallYellow = page.findOne(n => n.id === '${templateIds.smallYellow}').clone();
  async function setText(frame, name, text) {
    const node = frame.findOne(n => n.type === 'TEXT' && n.name === name);
    if (!node) return;
    await figma.loadFontAsync(node.fontName);
    node.characters = text;
    node.textAutoResize = 'HEIGHT';
    node.layoutSizingVertical = 'HUG';
  }
  async function setCta(frame, text) {
    const node = frame.findOne(n => n.type === 'TEXT' && n.characters.includes('{category}'));
    if (!node) return;
    await figma.loadFontAsync(node.fontName);
    node.characters = text;
    node.textAutoResize = 'HEIGHT';
    node.layoutSizingVertical = 'HUG';
  }
  for (const f of [fLargeBlue, fLargeYellow, fSmallBlue, fSmallYellow]) {
    await setText(f, '${headerNodeName}', '${safeHeader}');
    await setText(f, '${bodyNodeName}', '${safeBody}');
    await setCta(f, '${safeCta}');
  }
  const hashes = ${JSON.stringify(imageHashes)};
  function applyLogosLarge(frame) {
    const lf = frame.findOne(n => n.name === 'Logos');
    for (let i = 0; i < 6; i++) {
      const slot = lf.children[i]?.findOne(n => n.name === 'Logo.svg');
      if (slot) slot.fills = [{ type: 'IMAGE', imageHash: hashes[i], scaleMode: 'FIT' }];
    }
  }
  function applyLogosSmall(frame) {
    const lf = frame.findOne(n => n.name === 'Logos');
    const map = { 'Logo 1': 0, 'Logo 2': 1, 'Logo 3': 2, 'Logo 4': 3, 'Logo 5': 4, 'Logo 6': 5 };
    for (const c of lf.children) {
      const idx = map[c.name];
      if (idx === undefined) continue;
      const slot = c.findOne(n => n.name === 'Logo.svg');
      if (slot) slot.fills = [{ type: 'IMAGE', imageHash: hashes[idx], scaleMode: 'FIT' }];
    }
  }
  applyLogosLarge(fLargeBlue); applyLogosLarge(fLargeYellow);
  applyLogosSmall(fSmallBlue); applyLogosSmall(fSmallYellow);
  const allSections = page.children.filter(n => n.type === 'SECTION');
  const lowestBottom = Math.max(...allSections.map(s => { const b = s.absoluteBoundingBox; return b.y + b.height; }));
  const leftX = allSections[0].absoluteBoundingBox.x;
  const section = figma.createSection();
  section.name = '${categoryName}';
  section.x = leftX;
  section.y = lowestBottom + 200;
  const GAP = 160, PAD = 80;
  const frames = [fLargeBlue, fSmallBlue, fLargeYellow, fSmallYellow];
  let cursor = PAD;
  for (const f of frames) { section.appendChild(f); f.x = cursor; f.y = PAD; cursor += f.width + GAP; }
  section.resizeWithoutConstraints(cursor - GAP + PAD, Math.max(...frames.map(f => f.height)) + PAD * 2);
  page.appendChild(section);
  return 'done';
})();`;
}

server.tool(
  'generate_ad_copy',
  'Generate ad copy for a G2 software category. Always show the result to the user for approval before calling apply_to_figma.',
  { categoryName: z.string().describe('G2 software category, e.g. "Security", "CRM", "DevOps"') },
  async ({ categoryName }) => {
    const { generateCopy } = require('./src/copy-generator');
    const copy = await generateCopy(categoryName);
    return {
      content: [{
        type: 'text',
        text: [
          `**Header:** ${copy.header}`,
          `**Body:** ${copy.body}`,
          `**CTA:** ${copy.cta}`,
          `**Mode:** ${copy.headerMode} (${copy.headerCharCount} chars)`,
          '',
          'Does this look good? Say "yes" to apply to Figma, or tell me what to change.',
        ].join('\n'),
      }],
    };
  }
);

server.tool(
  'apply_to_figma',
  'Download logos from G2 CDN, upload to Figma, apply copy, and create the ad section. Call only after user approves copy.',
  {
    categoryName: z.string(),
    header: z.string(),
    body: z.string(),
    cta: z.string(),
    headerMode: z.enum(['short', 'long']),
    logos: z.array(z.object({
      productName: z.string(),
      imageUrl: z.string().describe('image_url from G2 MCP show_product'),
    })).length(6),
  },
  async ({ categoryName, header, body, cta, headerMode, logos }) => {
    const log = [];
    await fs.mkdir(TEMP_DIR, { recursive: true });

    const cleanHeader = ensurePeriod(toSentenceCase(header));
    const cleanBody = ensurePeriod(toSentenceCase(body));

    log.push('Downloading logos...');
    const logoPaths = [];
    for (const logo of logos) {
      const slug = logo.productName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const pngUrl = svgUrlToLargeDetailPng(logo.imageUrl);
      const resp = await axios.get(pngUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const filePath = path.join(TEMP_DIR, `${slug}.png`);
      await fs.writeFile(filePath, resp.data);
      logoPaths.push(filePath);
    }
    log.push(`✓ ${logoPaths.length} logos ready`);

    log.push('Uploading to Figma...');
    const imageHashes = [];
    const batches = [logoPaths.slice(0, 5), logoPaths.slice(5)].filter(b => b.length > 0);
    for (const batch of batches) {
      const uploadResp = await axios.post(
        'https://mcp.figma.com/mcp/upload',
        { count: batch.length },
        { headers: { Authorization: `Bearer ${FIGMA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      for (let i = 0; i < batch.length; i++) {
        const fileData = await fs.readFile(batch[i]);
        const submitResp = await axios.post(uploadResp.data.uploads[i].submitUrl, fileData, {
          headers: { 'Content-Type': 'image/png' },
        });
        imageHashes.push(submitResp.data.imageHash);
      }
    }
    log.push(`✓ ${imageHashes.length} logos uploaded`);

    log.push('Building Figma section...');
    const script = buildFigmaScript({ categoryName, header: cleanHeader, body: cleanBody, cta, headerMode, imageHashes });

    const runResp = await axios.post(
      `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/executions`,
      { code: script },
      { headers: figmaHeaders() }
    );
    if (runResp.data?.error) throw new Error(runResp.data.error);
    log.push('✓ Section created');

    return {
      content: [{
        type: 'text',
        text: log.join('\n') + `\n\nDone! "${categoryName}" section created in Figma. Want me to export the frames as PNGs to your desktop?`,
      }],
    };
  }
);

server.tool(
  'export_frames_as_png',
  'Export the 4 ad creative frames for a category from Figma as PNGs and save them to ~/Desktop/g2-ads/{category}.',
  {
    categoryName: z.string(),
    outputDir: z.string().optional(),
  },
  async ({ categoryName, outputDir }) => {
    const destDir = outputDir || path.join(os.homedir(), 'Desktop', 'g2-ads', categoryName.replace(/[^a-z0-9]/gi, '-'));
    await fs.mkdir(destDir, { recursive: true });

    const fileResp = await axios.get(`https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`, { headers: figmaHeaders() });
    const page = fileResp.data.document.children.find(p => p.id === PAGE_ID);
    if (!page) throw new Error(`Page ${PAGE_ID} not found`);

    const section = page.children.find(n => n.type === 'SECTION' && n.name === categoryName);
    if (!section) throw new Error(`Section "${categoryName}" not found`);

    const frameIds = section.children.filter(n => n.type === 'FRAME').map(n => n.id);
    if (!frameIds.length) throw new Error('No frames found in section');

    const exportResp = await axios.get(
      `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}?ids=${frameIds.join(',')}&format=png&scale=2`,
      { headers: figmaHeaders() }
    );

    const savedFiles = [];
    for (const id of frameIds) {
      const url = exportResp.data.images[id];
      if (!url) continue;
      const frame = section.children.find(n => n.id === id);
      const safeName = (frame?.name || id).replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
      const filePath = path.join(destDir, `${safeName}.png`);
      const imgResp = await axios.get(url, { responseType: 'arraybuffer' });
      await fs.writeFile(filePath, imgResp.data);
      savedFiles.push(filePath);
    }

    return {
      content: [{
        type: 'text',
        text: `Exported ${savedFiles.length} PNGs to:\n${destDir}\n\n${savedFiles.map(f => '• ' + path.basename(f)).join('\n')}`,
      }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

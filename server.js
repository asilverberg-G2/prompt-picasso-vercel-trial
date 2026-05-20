const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const { scrapeLogo } = require('./src/logo-fetcher');
const { generateCopy } = require('./src/copy-generator');
const { getManifestForFigma } = require('./src/figma-applier');

const app = express();
const PORT = process.env.PORT || 3000;

let pendingPrefill = null;

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static('public'));
app.use('/temp', express.static('temp'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'temp/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) ||
      (file.mimetype === 'image/png' ? '.png' :
       file.mimetype === 'image/jpeg' ? '.jpg' :
       file.mimetype === 'image/gif' ? '.gif' :
       file.mimetype === 'image/webp' ? '.webp' :
       file.mimetype === 'image/svg+xml' ? '.svg' : '.png');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cb(null, `upload-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Routes

/**
 * POST /api/scrape-logo
 * Scrapes logo from G2 profile URL
 */
app.post('/api/scrape-logo', async (req, res) => {
  try {
    const { g2Url, productName } = req.body;

    if (!g2Url || !productName) {
      return res.status(400).json({ error: 'Missing g2Url or productName' });
    }

    const result = await scrapeLogo(g2Url, productName);
    res.json(result);

  } catch (error) {
    console.error('Scrape logo error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while scraping logo'
    });
  }
});

/**
 * POST /api/upload-logo
 * Handles manual logo uploads
 */
app.post('/api/upload-logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const productName = req.body.productName;
    if (!productName) {
      return res.status(400).json({ error: 'Missing productName' });
    }

    const sanitizedName = productName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const ext = path.extname(req.file.filename);
    const finalName = `${sanitizedName}${ext}`;
    const oldPath = path.join(__dirname, 'temp', req.file.filename);
    const newPath = path.join(__dirname, 'temp', finalName);

    await fs.rename(oldPath, newPath);

    res.json({
      success: true,
      logoPath: finalName
    });

  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error while uploading logo'
    });
  }
});

/**
 * POST /api/generate-copy
 * Generates ad copy using Claude API
 */
app.post('/api/generate-copy', async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName) {
      return res.status(400).json({ error: 'Missing categoryName' });
    }

    const copy = await generateCopy(categoryName);
    res.json(copy);

  } catch (error) {
    console.error('Generate copy error:', error);
    res.status(500).json({
      error: error.message || 'Server error while generating copy'
    });
  }
});

/**
 * POST /api/create-manifest
 * Creates manifest.json for Figma integration
 */
app.post('/api/create-manifest', async (req, res) => {
  try {
    const { categoryName, copy, logos } = req.body;

    if (!categoryName || !copy || !logos) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that all 6 logos are provided
    if (logos.length !== 6) {
      return res.status(400).json({ error: 'Must provide exactly 6 logos' });
    }

    // Convert relative paths to absolute paths
    const absoluteLogos = logos.map(logo => ({
      productName: logo.productName,
      path: path.join(__dirname, 'temp', logo.logoPath)
    }));

    const manifest = {
      categoryName,
      copy,
      logos: absoluteLogos,
      timestamp: new Date().toISOString(),
      figmaFileKey: process.env.FIGMA_FILE_KEY
    };

    // Write manifest to temp directory
    const manifestPath = path.join(__dirname, 'temp', 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    res.json({
      success: true,
      manifestPath: manifestPath,
      message: 'Manifest created successfully. Tell Claude Code: "Apply the manifest to Figma"'
    });

  } catch (error) {
    console.error('Create manifest error:', error);
    res.status(500).json({
      error: error.message || 'Server error while creating manifest'
    });
  }
});

app.post('/api/prefill', (req, res) => {
  const { products, category } = req.body;
  if (!products || products.length !== 6) {
    return res.status(400).json({ success: false, error: 'Must provide exactly 6 products' });
  }
  pendingPrefill = { products, category: category || '' };
  res.json({ success: true });
});

app.get('/api/prefill-data', (req, res) => {
  const data = pendingPrefill;
  pendingPrefill = null;
  res.json({ success: true, products: data?.products || [], category: data?.category || '' });
});

app.get('/api/manifest', async (req, res) => {
  try {
    const manifest = await getManifestForFigma();
    res.json({ success: true, manifest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`G2 Ad Campaign Generator running at http://localhost:${PORT}`);
  console.log(`Using G2 LLM Proxy at ${process.env.ANTHROPIC_BASE_URL}`);
});

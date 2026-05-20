const path = require('path');
const fs = require('fs').promises;

const TEMP_DIR = '/tmp';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { categoryName, copy, logos } = req.body;
  if (!categoryName || !copy || !logos) return res.status(400).json({ error: 'Missing required fields' });
  if (logos.length !== 6) return res.status(400).json({ error: 'Must provide exactly 6 logos' });

  const absoluteLogos = logos.map(logo => ({
    productName: logo.productName,
    path: path.join(TEMP_DIR, logo.logoPath)
  }));

  const manifest = {
    categoryName,
    copy,
    logos: absoluteLogos,
    timestamp: new Date().toISOString(),
    figmaFileKey: process.env.FIGMA_FILE_KEY
  };

  await fs.writeFile(path.join(TEMP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  res.json({
    success: true,
    message: 'Manifest created successfully. Tell Claude Code: "Apply the manifest to Figma"'
  });
};

const path = require('path');
const fs = require('fs').promises;

const TEMP_DIR = '/tmp';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const raw = await fs.readFile(path.join(TEMP_DIR, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    for (const logo of manifest.logos) {
      await fs.access(logo.path);
    }
    res.json({ success: true, manifest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function readManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (!manifest.categoryName) throw new Error('Missing categoryName');
  if (!manifest.copy) throw new Error('Missing copy');
  if (!manifest.logos || manifest.logos.length !== 6) throw new Error('Must have exactly 6 logos');

  for (const logo of manifest.logos) {
    try {
      await fs.access(logo.path);
    } catch {
      throw new Error(`Logo file not found: ${logo.path}`);
    }
  }

  return manifest;
}

async function getManifestForFigma() {
  const manifestPath = path.join(__dirname, '..', 'temp', 'manifest.json');
  return readManifest(manifestPath);
}

module.exports = { getManifestForFigma };

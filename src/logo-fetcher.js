const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

function extractSlug(g2ProfileUrl) {
  const match = g2ProfileUrl.match(/\/products\/([^/]+)/);
  return match ? match[1] : null;
}

function sanitizeName(productName) {
  return productName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function downloadAndSave(imageUrl, productName) {
  const tempDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'temp');
  const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });

  let ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
  if (!ext.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
    const ct = resp.headers['content-type'] || '';
    ext = ct.includes('jpeg') || ct.includes('jpg') ? '.jpg'
        : ct.includes('gif') ? '.gif'
        : ct.includes('webp') ? '.webp'
        : '.png';
  }

  const fileName = `${sanitizeName(productName)}${ext}`;
  await fs.writeFile(path.join(tempDir, fileName), resp.data);
  return fileName;
}

async function fetchViaG2Api(slug, productName) {
  const apiUrl = `https://data.g2.com/api/v1/products/${slug}`;
  const resp = await axios.get(apiUrl, {
    headers: { 'Accept': 'application/json' },
    timeout: 10000
  });

  const logoUrl = resp.data?.data?.attributes?.image_url
    || resp.data?.data?.attributes?.logo_url
    || resp.data?.image_url;

  if (!logoUrl) throw new Error('No logo URL in G2 API response');
  return downloadAndSave(logoUrl, productName);
}

async function fetchViaCdnSlug(slug, productName) {
  const cdnBase = 'https://images.g2crowd.com/uploads/product/hd_favicon';
  const url = `${cdnBase}/${slug}.png`;
  return downloadAndSave(url, productName);
}

async function scrapeLogo(g2ProfileUrl, productName) {
  try {
    const slug = extractSlug(g2ProfileUrl);
    if (!slug) return { success: false, error: 'Could not extract product slug from URL. Please upload manually.' };

    let fileName;

    try {
      fileName = await fetchViaG2Api(slug, productName);
    } catch {
      fileName = await fetchViaCdnSlug(slug, productName);
    }

    return { success: true, logoPath: fileName };
  } catch (error) {
    return { success: false, error: 'Could not fetch logo automatically. Please upload manually.' };
  }
}

module.exports = { scrapeLogo };

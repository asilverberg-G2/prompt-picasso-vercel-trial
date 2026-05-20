const path = require('path');
const fs = require('fs').promises;

const TEMP_DIR = '/tmp';
const PREFILL_FILE = path.join(TEMP_DIR, 'prefill.json');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { products, category } = req.body;
    if (!products || products.length !== 6) {
      return res.status(400).json({ success: false, error: 'Must provide exactly 6 products' });
    }

    const savedProducts = await Promise.all(products.map(async (product) => {
      if (!product.logoBase64 || !product.logoMime) return product;

      const slug = product.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const ext = product.logoMime.includes('png') ? '.png' : product.logoMime.includes('gif') ? '.gif' : product.logoMime.includes('webp') ? '.webp' : '.jpg';
      const fileName = `${slug}${ext}`;
      const buffer = Buffer.from(product.logoBase64, 'base64');
      await fs.writeFile(path.join(TEMP_DIR, fileName), buffer);

      return { name: product.name, reviews: product.reviews, g2Url: product.g2Url, logoPath: fileName };
    }));

    await fs.writeFile(PREFILL_FILE, JSON.stringify({ products: savedProducts, category: category || '' }));
    return res.json({ success: true });
  }

  if (req.method === 'GET') {
    try {
      const raw = await fs.readFile(PREFILL_FILE, 'utf8');
      const data = JSON.parse(raw);
      await fs.unlink(PREFILL_FILE);
      return res.json({ success: true, products: data.products, category: data.category });
    } catch {
      return res.json({ success: true, products: [], category: '' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};

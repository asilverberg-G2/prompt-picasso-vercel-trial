const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const TEMP_DIR = '/tmp';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  upload.single('logo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const productName = req.body.productName;
    if (!productName) return res.status(400).json({ error: 'Missing productName' });

    const sanitized = productName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const ext = path.extname(req.file.filename);
    const finalName = `${sanitized}${ext}`;
    const oldPath = path.join(TEMP_DIR, req.file.filename);
    const newPath = path.join(TEMP_DIR, finalName);

    await fs.rename(oldPath, newPath);
    res.json({ success: true, logoPath: finalName });
  });
};

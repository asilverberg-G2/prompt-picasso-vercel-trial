const { generateCopy } = require('../src/copy-generator');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { categoryName } = req.body;
  if (!categoryName) return res.status(400).json({ error: 'Missing categoryName' });

  try {
    const copy = await generateCopy(categoryName);
    res.json(copy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

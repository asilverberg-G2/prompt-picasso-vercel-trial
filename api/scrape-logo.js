const { scrapeLogo } = require('../src/logo-fetcher');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { g2Url, productName } = req.body;
  if (!g2Url || !productName) return res.status(400).json({ error: 'Missing g2Url or productName' });

  const result = await scrapeLogo(g2Url, productName);
  res.json(result);
};

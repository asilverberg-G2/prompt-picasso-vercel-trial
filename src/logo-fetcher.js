const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

/**
 * Scrapes logo from G2 product profile page and saves it locally
 * @param {string} g2ProfileUrl - G2 product URL (e.g., https://www.g2.com/products/slack/reviews)
 * @param {string} productName - Product name for file naming
 * @returns {Promise<{success: boolean, logoPath?: string, error?: string}>}
 */
async function scrapeLogo(g2ProfileUrl, productName) {
  try {
    // Fetch the G2 profile page
    const response = await axios.get(g2ProfileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const sanitizedMatch = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = [];

    $('img[alt="Product Avatar Image"], img[title="Product Avatar Image"]').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (!src.includes('images.g2crowd.com') && !src.includes('images.g2.com')) return;
      if (src.includes('transparent')) return;
      candidates.push(src);
    });

    const preferred = candidates.filter(src =>
      src.toLowerCase().replace(/[^a-z0-9]/g, '').includes(sanitizedMatch)
    );

    const pickBest = (list) =>
      list.find(src => src.includes('large_detail')) ||
      list.find(src => !src.includes('small_square')) ||
      list[0];

    const baseUrl = pickBest(preferred) || pickBest(candidates);

    let logoUrl = null;
    if (baseUrl) {
      const urlObj = new URL(baseUrl);
      const parts = urlObj.pathname.split('/');
      const filename = parts[parts.length - 1];
      const hash = parts[parts.length - 2];
      if (!baseUrl.includes('large_detail') && !baseUrl.includes('small_square')) {
        logoUrl = `https://images.g2crowd.com/uploads/product/image/large_detail/large_detail_${hash}/${filename}`;
      } else {
        logoUrl = baseUrl;
      }
    }

    if (!logoUrl) {
      return {
        success: false,
        error: 'Could not find logo on G2 profile page. Please upload manually.'
      };
    }

    // Ensure absolute URL
    if (logoUrl.startsWith('//')) {
      logoUrl = 'https:' + logoUrl;
    } else if (logoUrl.startsWith('/')) {
      logoUrl = 'https://www.g2.com' + logoUrl;
    }

    // Download the logo image
    const imageResponse = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    // Determine file extension from URL or content-type
    let ext = path.extname(new URL(logoUrl).pathname) || '.png';
    if (!ext.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
      const contentType = imageResponse.headers['content-type'];
      if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
      else if (contentType.includes('gif')) ext = '.gif';
      else if (contentType.includes('webp')) ext = '.webp';
      else if (contentType.includes('svg')) ext = '.svg';
      else ext = '.png';
    }

    // Sanitize product name for filename
    const sanitizedName = productName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const fileName = `${sanitizedName}${ext}`;
    const tempDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'temp');
    const logoPath = path.join(tempDir, fileName);

    // Save logo to temp directory
    await fs.writeFile(logoPath, imageResponse.data);

    return {
      success: true,
      logoPath: fileName // Return relative path from temp/
    };

  } catch (error) {
    console.error('Logo scraping error:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to scrape logo. Please upload manually.'
    };
  }
}

module.exports = { scrapeLogo };

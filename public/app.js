// State management
const state = {
  category: '',
  products: Array(6).fill(null).map((_, i) => ({
    id: i + 1,
    name: '',
    g2Url: '',
    logoPath: null,
    status: 'pending' // pending, loading, success, error
  })),
  copy: null
};

document.addEventListener('DOMContentLoaded', async () => {
  renderProducts();
  attachEventListeners();
  updateGenerateButton();
  await applyPrefillIfAvailable();
});

// Render product input slots
function renderProducts() {
  const container = document.getElementById('products-container');
  container.innerHTML = '';

  state.products.forEach((product, index) => {
    const slot = document.createElement('div');
    slot.className = 'product-slot';
    slot.innerHTML = `
      <h4>Product ${index + 1}</h4>
      <div class="row">
        <div class="field">
          <label>Product Name *</label>
          <input type="text" data-product-id="${product.id}" data-field="name" placeholder="e.g., Slack">
        </div>
        <div class="field">
          <label>Paste Logo *</label>
          <div class="paste-area" data-product-id="${product.id}" tabindex="0">
            <div class="paste-hint">Click here, then Cmd+V</div>
          </div>
        </div>
        <div class="field field--upload">
          <label>Upload Logo *</label>
          <label class="upload-btn" data-product-id="${product.id}">
            Choose file
            <input type="file" data-product-id="${product.id}" data-field="upload" accept="image/*" style="display: none;">
          </label>
        </div>
        <div class="status-indicator ${product.status}" data-status="${product.id}">
          ${getStatusText(product.status)}
        </div>
      </div>
    `;
    container.appendChild(slot);
  });
}

function getStatusText(status) {
  const statusMap = {
    pending: '—',
    loading: '⏳',
    success: '✓',
    error: '⚠'
  };
  return statusMap[status] || '—';
}

// Attach event listeners
function attachEventListeners() {
  // Category input
  document.getElementById('category').addEventListener('input', (e) => {
    state.category = e.target.value.trim();
    updateGenerateButton();
  });

  // Product name inputs
  document.querySelectorAll('input[data-field="name"]').forEach(input => {
    input.addEventListener('input', (e) => {
      const productId = parseInt(e.target.dataset.productId);
      const product = state.products.find(p => p.id === productId);
      product.name = e.target.value.trim();
      updateGenerateButton();
    });
  });

  // G2 URL inputs (blur = trigger scrape)
  document.querySelectorAll('input[data-field="g2Url"]').forEach(input => {
    input.addEventListener('blur', async (e) => {
      const productId = parseInt(e.target.dataset.productId);
      const product = state.products.find(p => p.id === productId);
      const url = e.target.value.trim();

      if (url && product.name && !product.logoPath) {
        await scrapeLogo(productId, url, product.name);
      }
    });
  });

  // File uploads
  document.querySelectorAll('input[data-field="upload"]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const productId = parseInt(e.target.dataset.productId);
      const product = state.products.find(p => p.id === productId);

      if (e.target.files.length > 0 && product.name) {
        await uploadLogo(productId, e.target.files[0], product.name);
      }
    });
  });

  document.querySelectorAll('.paste-area').forEach(area => {
    const productId = parseInt(area.dataset.productId);

    area.addEventListener('paste', async (e) => {
      e.preventDefault();
      const product = state.products.find(p => p.id === productId);

      if (!product.name) {
        alert('Please enter a product name first');
        return;
      }

      const items = e.clipboardData.items;
      for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          await uploadLogo(productId, blob, product.name);
          break;
        }
      }
    });

    area.addEventListener('focus', () => area.classList.add('paste-area--focused'));
    area.addEventListener('blur', () => area.classList.remove('paste-area--focused'));
  });

  // Generate copy button
  document.getElementById('generate-copy-btn').addEventListener('click', generateCopy);

  // Regenerate button
  document.getElementById('regenerate-btn').addEventListener('click', generateCopy);

  // Apply to Figma button
  document.getElementById('apply-figma-btn').addEventListener('click', createManifest);

  // Start over button
  document.getElementById('start-over-btn').addEventListener('click', () => {
    location.reload();
  });

  document.getElementById('copy-prompt-btn').addEventListener('click', () => {
    const prompt = 'Apply the manifest to Figma from https://prompt-picasso-vercel-trial.vercel.app/api/manifest';
    navigator.clipboard.writeText(prompt).then(() => {
      const btn = document.getElementById('copy-prompt-btn');
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = 'Copy prompt to clipboard'; }, 2000);
    });
  });

  // Header input - update character count and mode
  document.getElementById('header').addEventListener('input', (e) => {
    const text = e.target.value;
    const charCount = text.length;
    const mode = charCount <= 28 ? 'short' : 'long';

    document.getElementById('header-char-count').textContent = `${charCount} chars`;
    document.getElementById('header-mode-badge').textContent = mode;
    document.getElementById('header-mode-badge').className = `badge ${mode}`;

    if (state.copy) {
      state.copy.header = text;
      state.copy.headerMode = mode;
      state.copy.headerCharCount = charCount;
    }

    // Warn if over limit
    if (charCount > 50) {
      document.getElementById('header-char-count').className = 'char-count error';
    } else if (charCount > 28 && mode === 'short') {
      document.getElementById('header-char-count').className = 'char-count warning';
    } else {
      document.getElementById('header-char-count').className = 'char-count';
    }
  });

  // Body input - update character count
  document.getElementById('body').addEventListener('input', (e) => {
    const text = e.target.value;
    const charCount = text.length;

    document.getElementById('body-char-count').textContent = `${charCount} chars`;

    if (state.copy) {
      state.copy.body = text;
      state.copy.bodyCharCount = charCount;
    }

    // Warn based on header mode
    const headerMode = state.copy?.headerMode || 'short';
    if (headerMode === 'short' && charCount > 120) {
      document.getElementById('body-char-count').className = 'char-count error';
    } else if (headerMode === 'long' && charCount > 75) {
      document.getElementById('body-char-count').className = 'char-count error';
    } else {
      document.getElementById('body-char-count').className = 'char-count';
    }
  });

  // CTA select
  document.getElementById('cta').addEventListener('change', (e) => {
    if (state.copy) {
      state.copy.cta = e.target.value;
    }
  });
}

// Update generate button state
function updateGenerateButton() {
  const hasCategory = state.category.length > 0;
  const allProductsHaveNames = state.products.every(p => p.name.length > 0);
  const allProductsHaveLogos = state.products.every(p => p.logoPath !== null);

  const btn = document.getElementById('generate-copy-btn');
  btn.disabled = !(hasCategory && allProductsHaveNames && allProductsHaveLogos);
}

// Update product status indicator
function updateProductStatus(productId, status) {
  const product = state.products.find(p => p.id === productId);
  product.status = status;

  const statusEl = document.querySelector(`[data-status="${productId}"]`);
  statusEl.className = `status-indicator ${status}`;
  statusEl.textContent = getStatusText(status);

  const pasteArea = document.querySelector(`.paste-area[data-product-id="${productId}"]`);
  if (pasteArea) {
    const hint = pasteArea.querySelector('.paste-hint');
    if (status === 'success') {
      pasteArea.classList.add('success');
      if (hint) hint.textContent = '✓ Logo ready';
    } else if (status === 'error') {
      pasteArea.classList.remove('success');
      if (hint) hint.textContent = 'Click here, then Cmd+V';
    } else if (status === 'loading') {
      pasteArea.classList.remove('success');
      if (hint) hint.textContent = 'Uploading...';
    }
  }

  updateGenerateButton();
}

// Scrape logo from G2 URL
async function scrapeLogo(productId, g2Url, productName) {
  updateProductStatus(productId, 'loading');

  try {
    const response = await fetch('/api/scrape-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ g2Url, productName })
    });

    const result = await response.json();

    if (result.success) {
      const product = state.products.find(p => p.id === productId);
      product.logoPath = result.logoPath;
      updateProductStatus(productId, 'success');
    } else {
      updateProductStatus(productId, 'error');
      alert(`Logo scraping failed for ${productName}: ${result.error}`);
    }

  } catch (error) {
    console.error('Scrape error:', error);
    updateProductStatus(productId, 'error');
    alert(`Failed to scrape logo: ${error.message}`);
  }
}

// Upload logo manually
async function uploadLogo(productId, file, productName) {
  updateProductStatus(productId, 'loading');

  try {
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('productName', productName);

    const response = await fetch('/api/upload-logo', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      const product = state.products.find(p => p.id === productId);
      product.logoPath = result.logoPath;
      updateProductStatus(productId, 'success');
    } else {
      updateProductStatus(productId, 'error');
      alert(`Logo upload failed: ${result.error}`);
    }

  } catch (error) {
    console.error('Upload error:', error);
    updateProductStatus(productId, 'error');
    alert(`Failed to upload logo: ${error.message}`);
  }
}

// Generate ad copy
async function generateCopy() {
  const btn = document.getElementById('generate-copy-btn');
  const regenBtn = document.getElementById('regenerate-btn');

  btn.disabled = true;
  regenBtn.disabled = true;
  btn.textContent = 'Generating...';
  regenBtn.textContent = 'Regenerating...';

  try {
    const response = await fetch('/api/generate-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryName: state.category })
    });

    const copy = await response.json();

    if (copy.error) {
      throw new Error(copy.error);
    }

    state.copy = copy;
    displayCopyReview(copy);

  } catch (error) {
    console.error('Copy generation error:', error);
    alert(`Failed to generate copy: ${error.message}`);
  } finally {
    btn.disabled = false;
    regenBtn.disabled = false;
    btn.textContent = 'Generate Copy';
    regenBtn.textContent = 'Regenerate Copy';
  }
}

// Display copy review section
function displayCopyReview(copy) {
  // Populate CTA dropdown
  const ctaSelect = document.getElementById('cta');
  const category = state.category;
  ctaSelect.innerHTML = `
    <option value="Explore ${category} software">Explore ${category} software</option>
    <option value="Compare ${category} software">Compare ${category} software</option>
    <option value="See featured ${category} software">See featured ${category} software</option>
  `;
  ctaSelect.value = copy.cta;

  // Populate fields
  document.getElementById('header').value = copy.header;
  document.getElementById('body').value = copy.body;

  // Trigger character count updates
  document.getElementById('header').dispatchEvent(new Event('input'));
  document.getElementById('body').dispatchEvent(new Event('input'));

  // Show copy section
  document.getElementById('input-section').style.display = 'none';
  document.getElementById('copy-section').style.display = 'block';
}

// Create manifest and finalize
async function createManifest() {
  const btn = document.getElementById('apply-figma-btn');
  btn.disabled = true;
  btn.textContent = 'Creating Manifest...';

  try {
    const logos = state.products.map(p => ({
      productName: p.name,
      logoPath: p.logoPath
    }));

    const response = await fetch('/api/create-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryName: state.category,
        copy: state.copy,
        logos
      })
    });

    const result = await response.json();

    if (result.success) {
      document.getElementById('category-name-display').textContent = state.category;
      document.getElementById('copy-section').style.display = 'none';
      document.getElementById('success-section').style.display = 'block';
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error('Manifest creation error:', error);
    alert(`Failed to create manifest: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply to Figma';
  }
}

async function applyPrefillIfAvailable() {
  try {
    const res = await fetch('/api/prefill-data');
    const data = await res.json();
    if (!data.products || !data.products.length) return;

    if (data.category) {
      state.category = data.category;
      const categoryInput = document.getElementById('category');
      if (categoryInput) categoryInput.value = data.category;
    }

    data.products.forEach((product, i) => {
      const p = state.products[i];
      if (!p) return;
      p.name = product.name;
      const nameInput = document.querySelector(`input[data-product-id="${p.id}"][data-field="name"]`);
      if (nameInput) nameInput.value = product.name;
      if (product.logoPath) {
        p.logoPath = product.logoPath;
        updateProductStatus(p.id, 'success');
      } else if (product.g2Url) {
        scrapeLogo(p.id, product.g2Url, product.name);
      }
    });

    updateGenerateButton();
  } catch (e) {}
}

// Direct Vertesia API integration
const VERTESIA_API_BASE = 'https://api.vertesia.io/api/v1';
const VERTESIA_API_KEY = 'sk-fd362b66caf5be947b7dfd601ac60fbb';
const ENVIRONMENT_ID = '681915c6a01fb262a410c161';

// DOM Elements
const elements = {
  specFiles: document.getElementById('specFiles'),
  catalogFiles: document.getElementById('catalogFiles'),
  specDrop: document.getElementById('specDrop'),
  catalogDrop: document.getElementById('catalogDrop'),
  startBtn: document.getElementById('startBtn'),
  catalogueList: document.getElementById('catalogueList'),
  queueList: document.getElementById('queueList'),
  pastList: document.getElementById('pastList'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  toastContainer: document.getElementById('toastContainer')
};

// Application State
let state = {
  queue: new Map(),
  selectedSpecs: [],
  isProcessing: false,
  queueTimer: null,
  allObjects: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Spec-to-BOM application...');
  
  try {
    setupEventListeners();
    await loadAllObjectsFromVertesia();
    startQueueMonitoring();
    showToast('Application loaded successfully', 'success');
  } catch (error) {
    console.error('Initialization failed:', error);
    showToast('Failed to initialize application', 'error');
  }
});

// Load ALL objects from Vertesia
async function loadAllObjectsFromVertesia() {
  showLoading('Loading all objects from database...');
  
  try {
    const response = await fetch(`${VERTESIA_API_BASE}/objects?limit=1000&offset=0`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VERTESIA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch objects: ${response.status}`);
    }

    state.allObjects = await response.json();
    console.log(`Loaded ${state.allObjects.length} total objects`);
    
    renderCatalogueItems();
    renderPastGenerations();
    
  } catch (error) {
    console.error('Failed to load objects:', error);
    showToast('Failed to load data from database', 'error');
  } finally {
    hideLoading();
  }
}

// Filter and render catalogue items (Equipment_Catalogue)
function renderCatalogueItems() {
  const catalogueItems = state.allObjects.filter(obj => 
    obj.name && obj.name.includes('Equipment_Catalogue')
  );
  
  console.log(`Found ${catalogueItems.length} catalogue items`);
  
  const container = elements.catalogueList;
  
  if (catalogueItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No catalogue items yet</div>';
    return;
  }

  container.innerHTML = catalogueItems.map(item => createListItem(item, 'catalog')).join('');
}

// Filter and render past BOM generations (includes _BOM)
function renderPastGenerations() {
  const bomItems = state.allObjects.filter(obj => 
    obj.name && obj.name.includes('_BOM')
  );
  
  console.log(`Found ${bomItems.length} BOM generations`);
  console.log('BOM items:', bomItems.map(item => item.name));
  
  const container = elements.pastList;
  
  if (bomItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No BOMs generated yet</div>';
    return;
  }

  bomItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  
  container.innerHTML = bomItems.map(item => createListItem(item, 'bom')).join('');
}

// Direct API calls
async function vertesiaCall(endpoint, options = {}) {
  try {
    const url = `${VERTESIA_API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${VERTESIA_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Vertesia API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// File upload
async function uploadFileToVertesia(file, namePrefix = '') {
  try {
    showLoading('Getting upload URL...');
    
    const fileName = namePrefix ? `${namePrefix}_${file.name}` : file.name;
    
    const uploadResponse = await vertesiaCall('/objects/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        name: fileName,
        mime_type: file.type || 'application/octet-stream'
      })
    });

    showLoading('Uploading file...');

    const uploadResult = await fetch(uploadResponse.url, {
      method: 'PUT',
      body: file
    });

    if (!uploadResult.ok) {
      throw new Error(`File upload failed: ${uploadResult.status}`);
    }

    showLoading('Creating object record...');

    const objectResponse = await vertesiaCall('/objects', {
      method: 'POST',
      body: JSON.stringify({
        name: fileName,
        description: `Uploaded file: ${fileName}`,
        content: {
          source: uploadResponse.id,
          type: file.type || 'application/octet-stream',
          name: fileName
        },
        properties: {
          uploaded_at: new Date().toISOString(),
          original_filename: file.name
        }
      })
    });

    return objectResponse;
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
}

// Event Listeners Setup
function setupEventListeners() {
  elements.specFiles.addEventListener('change', handleSpecFilesSelected);
  elements.catalogFiles.addEventListener('change', handleCatalogFilesSelected);
  
  setupDragAndDrop(elements.specDrop, elements.specFiles, handleSpecFilesSelected);
  setupDragAndDrop(elements.catalogDrop, elements.catalogFiles, handleCatalogFilesSelected);
  
  elements.startBtn.addEventListener('click', handleStartGeneration);
  
  console.log('Event listeners setup complete');
}

function setupDragAndDrop(dropZone, fileInput, changeHandler) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    fileInput.files = files;
    changeHandler();
  });

  dropZone.addEventListener('click', () => fileInput.click());
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleSpecFilesSelected() {
  const files = Array.from(elements.specFiles.files);
  state.selectedSpecs = files;
  
  updateSpecDropUI(files);
  updateStartButton();
  
  if (files.length > 0) {
    showToast(`${files.length} spec file${files.length > 1 ? 's' : ''} selected`, 'success');
  }
}

async function handleCatalogFilesSelected() {
  const files = Array.from(elements.catalogFiles.files);
  if (files.length > 0) {
    await uploadCatalogFiles(files);
  }
}

function updateSpecDropUI(files) {
  const dropZone = elements.specDrop;
  const dropText = dropZone.querySelector('.drop-text');
  
  if (files.length > 0) {
    dropZone.classList.add('has-files');
    dropText.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
  } else {
    dropZone.classList.remove('has-files');
    dropText.textContent = 'Upload';
  }
}

function updateStartButton() {
  elements.startBtn.disabled = state.selectedSpecs.length === 0 || state.isProcessing;
}

function createListItem(item, type) {
  const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
  const typeLabel = type === 'bom' ? 'BOM' : type === 'catalog' ? 'CATALOG' : '';
  
  return `
    <div class="list-item">
      <div class="item-info">
        <div class="item-name">${item.name || 'Unnamed'}</div>
        <div class="item-meta">
          ${typeLabel ? `<span class="status-badge ${type}">${typeLabel}</span>` : ''}
          <span>${date}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-secondary" onclick="viewItem('${item.id}')">view</button>
        <button class="btn-secondary" onclick="downloadItem('${item.id}')">download</button>
        <button class="btn-secondary" onclick="deleteItem('${item.id}')">delete</button>
      </div>
    </div>
  `;
}

function renderQueue() {
  const container = elements.queueList;
  
  if (state.queue.size === 0) {
    container.innerHTML = '<div class="empty-state">Nothing queued</div>';
    return;
  }

  const queueItems = Array.from(state.queue.entries()).map(([id, info]) => {
    const elapsed = Math.floor((Date.now() - info.startTime) / 60000);
    return `
      <div class="list-item processing">
        <div class="item-info">
          <div class="item-name">${info.name}</div>
          <div class="item-meta">
            <span class="status-badge processing">PROCESSING</span>
            <span>${elapsed}m elapsed</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = queueItems;
}

// Generate BOM using direct interaction (your exact pattern)
async function handleStartGeneration() {
  state.isProcessing = true;
  updateStartButton();
  showLoading('Generating BOM...');

  try {
    const response = await fetch('https://api.vertesia.io/api/v1/execute/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VERTESIA_API_KEY}`
      },
      body: JSON.stringify({
        type: 'conversation',
        interaction: 'AgentConfigurator',
        data: {
          Task: 'For the uploaded document, generate a Bill of Materials'
        },
        config: {
          environment: ENVIRONMENT_ID,
          model: 'publishers/anthropic/models/claude-3-7-sonnet'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }

    const result = await response.json();
    
    state.queue.set(result.id || Date.now(), {
      name: 'BOM Generation',
      startTime: Date.now()
    });

    state.selectedSpecs = [];
    elements.specFiles.value = '';
    updateSpecDropUI([]);
    renderQueue();
    
    showToast('BOM generation started successfully', 'success');
    
  } catch (error) {
    console.error('Generation failed:', error);
    alert('Failed to generate BOM');
  } finally {
    state.isProcessing = false;
    updateStartButton();
    hideLoading();
  }
}

async function uploadCatalogFiles(files) {
  showLoading('Uploading to catalogue...');
  
  try {
    for (const file of files) {
      await uploadFileToVertesia(file, 'Equipment_Catalogue');
    }
    
    elements.catalogFiles.value = '';
    await loadAllObjectsFromVertesia();
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded to catalogue`, 'success');
  } catch (error) {
    console.error('Catalogue upload failed:', error);
    showToast('Failed to upload to catalogue', 'error');
  } finally {
    hideLoading();
  }
}

// Item Actions
window.viewItem = async function(id) {
  try {
    showLoading('Loading document...');
    
    const item = await vertesiaCall(`/objects/${id}`);
    const downloadUrl = await vertesiaCall('/objects/download-url', {
      method: 'POST',
      body: JSON.stringify({ file: item.content.source })
    });
    
    window.open(downloadUrl.url, '_blank');
  } catch (error) {
    console.error('Failed to view item:', error);
    showToast('Failed to view item', 'error');
  } finally {
    hideLoading();
  }
};

window.downloadItem = window.viewItem;

window.deleteItem = async function(id) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  
  try {
    showLoading('Deleting item...');
    await vertesiaCall(`/objects/${id}`, { method: 'DELETE' });
    await loadAllObjectsFromVertesia();
    showToast('Item deleted successfully', 'success');
  } catch (error) {
    console.error('Failed to delete item:', error);
    showToast('Failed to delete item', 'error');
  } finally {
    hideLoading();
  }
};

function startQueueMonitoring() {
  state.queueTimer = setInterval(async () => {
    if (state.queue.size > 0) {
      renderQueue();
      await loadAllObjectsFromVertesia();
    }
  }, 10000);
}

function showLoading(message) {
  elements.loadingText.textContent = message;
  elements.loadingOverlay.classList.add('show');
}

function hideLoading() {
  elements.loadingOverlay.classList.remove('show');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

console.log('Spec-to-BOM application ready');

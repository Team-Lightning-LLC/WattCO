// Direct Vertesia API integration with your specifications
const VERTESIA_API_BASE = 'https://api.vertesia.io/api/v1';
const VERTESIA_API_KEY = 'sk-fd362b66caf5be947b7dfd601ac60fbb';
const ENVIRONMENT_ID = '681915c6a01fb262a410c161';
const MODEL = 'publishers/anthropic/models/claude-sonnet-4';

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
  allObjects: [] // Store all objects loaded from API
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Spec-to-BOM application...');
  
  try {
    setupEventListeners();
    await loadAllObjectsFromVertesia();
    startQueueMonitoring();
    showToast('Application loaded successfully', 'success');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    showToast('Failed to initialize application', 'error');
  }
});

// Load ALL objects from Vertesia (your proven approach)
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
    console.log(`📦 Loaded ${state.allObjects.length} total objects`);
    
    // Now filter and render the different categories
    renderCatalogueItems();
    renderPastGenerations();
    
  } catch (error) {
    console.error('❌ Failed to load objects:', error);
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
  
  console.log(`🔧 Found ${catalogueItems.length} catalogue items`);
  
  const container = elements.catalogueList;
  
  if (catalogueItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No catalogue items yet</div>';
    return;
  }

  container.innerHTML = catalogueItems.map(item => createListItem(item, 'catalog')).join('');
}

// Filter and render past BOM generations (clientname_BOM)
function renderPastGenerations() {
  const bomItems = state.allObjects.filter(obj => 
    obj.name && obj.name.endsWith('_BOM')
  );
  
  console.log(`📋 Found ${bomItems.length} BOM generations`);
  
  const container = elements.pastList;
  
  if (bomItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No BOMs generated yet</div>';
    return;
  }

  // Sort by creation date (newest first)
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
    console.error(`❌ Vertesia API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// File upload
async function uploadFileToVertesia(file, namePrefix = '') {
  try {
    showLoading('Getting upload URL...');
    
    // Create filename with prefix if provided
    const fileName = namePrefix ? `${namePrefix}_${file.name}` : file.name;
    
    // Step 1: Get signed upload URL
    const uploadResponse = await vertesiaCall('/objects/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        name: fileName,
        mime_type: file.type || 'application/octet-stream'
      })
    });

    showLoading('Uploading file...');

    // Step 2: Upload file to storage
    const uploadResult = await fetch(uploadResponse.url, {
      method: 'PUT',
      body: file
    });

    if (!uploadResult.ok) {
      throw new Error(`File upload failed: ${uploadResult.status}`);
    }

    showLoading('Creating object record...');

    // Step 3: Create object record
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
    console.error('❌ File upload failed:', error);
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
  
  console.log('✅ Event listeners setup complete');
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

// File Handlers
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
    dropText.textContent = 'Drop specs or click to upload';
  }
}

function updateStartButton() {
  elements.startBtn.disabled = state.selectedSpecs.length === 0 || state.isProcessing;
}

// Create list item for rendering
function createListItem(item, type) {
  const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
  const typeLabel = type === 'bom' ? 'BOM' : type === 'catalog' ? 'Catalog' : '';
  
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
        <button class="btn-secondary" onclick="viewItem('${item.id}')">View</button>
        <button class="btn-secondary" onclick="downloadItem('${item.id}')">Download</button>
        <button class="btn-secondary" onclick="deleteItem('${item.id}')">Delete</button>
      </div>
    </div>
  `;
}

// Queue rendering
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
            <span class="status-badge processing">Processing</span>
            <span>${elapsed}m elapsed</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = queueItems;
}

// Main generation handler
async function handleStartGeneration() {
  if (state.selectedSpecs.length === 0) return;
  
  state.isProcessing = true;
  updateStartButton();
  showLoading('Starting BOM generation...');

  try {
    for (const file of state.selectedSpecs) {
      // Upload spec file (no special naming needed)
      const specObject = await uploadFileToVertesia(file);
      
      // Start async generation using AgentConfigurator
      const jobResponse = await vertesiaCall('/execute/async', {
        method: 'POST',
        body: JSON.stringify({
          type: 'conversation',
          interaction: 'AgentConfigurator',
          data: {
            file: specObject.content.source,
            task: `Generate BOM configuration for ${file.name}`
          },
          config: {
            environment: ENVIRONMENT_ID,
            model: MODEL
          }
        })
      });

      // Add to queue
      state.queue.set(jobResponse.id || Date.now(), {
        name: file.name,
        startTime: Date.now()
      });
    }

    // Reset UI
    state.selectedSpecs = [];
    elements.specFiles.value = '';
    updateSpecDropUI([]);
    renderQueue();
    
    showToast(`Started generation for ${state.queue.size} file${state.queue.size > 1 ? 's' : ''}`, 'success');
  } catch (error) {
    console.error('❌ Generation failed:', error);
    showToast('Failed to start generation', 'error');
  } finally {
    state.isProcessing = false;
    updateStartButton();
    hideLoading();
  }
}

// Upload catalogue files with Equipment_Catalogue naming
async function uploadCatalogFiles(files) {
  showLoading('Uploading to catalogue...');
  
  try {
    for (const file of files) {
      await uploadFileToVertesia(file, 'Equipment_Catalogue');
    }
    
    elements.catalogFiles.value = '';
    await loadAllObjectsFromVertesia(); // Reload everything
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded to catalogue`, 'success');
  } catch (error) {
    console.error('❌ Catalogue upload failed:', error);
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
    console.error('❌ Failed to view item:', error);
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
    await loadAllObjectsFromVertesia(); // Reload everything
    showToast('Item deleted successfully', 'success');
  } catch (error) {
    console.error('❌ Failed to delete item:', error);
    showToast('Failed to delete item', 'error');
  } finally {
    hideLoading();
  }
};

// Queue Monitoring
function startQueueMonitoring() {
  state.queueTimer = setInterval(async () => {
    if (state.queue.size > 0) {
      renderQueue();
      
      // Check for completed jobs by reloading all objects
      await loadAllObjectsFromVertesia();
    }
  }, 10000); // Check every 10 seconds
}

// UI Helpers
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

console.log('✅ Spec-to-BOM application ready');

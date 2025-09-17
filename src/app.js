// API Configuration
const API_BASE = '/api/vertesia';

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
  queueTimer: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Spec-to-BOM application...');
  
  try {
    setupEventListeners();
    await loadInitialData();
    startQueueMonitoring();
    showToast('Application loaded successfully', 'success');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    showToast('Failed to initialize application', 'error');
  }
});

// Event Listeners Setup
function setupEventListeners() {
  // File upload handlers
  elements.specFiles.addEventListener('change', handleSpecFilesSelected);
  elements.catalogFiles.addEventListener('change', handleCatalogFilesSelected);
  
  // Drag and drop handlers
  setupDragAndDrop(elements.specDrop, elements.specFiles, handleSpecFilesSelected);
  setupDragAndDrop(elements.catalogDrop, elements.catalogFiles, handleCatalogFilesSelected);
  
  // Button handlers
  elements.startBtn.addEventListener('click', handleStartGeneration);
  
  console.log('✅ Event listeners setup complete');
}

// Drag and Drop Setup
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

function handleCatalogFilesSelected() {
  const files = Array.from(elements.catalogFiles.files);
  if (files.length > 0) {
    uploadCatalogFiles(files);
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

// API Functions
async function apiCall(endpoint, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
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
    console.error(`❌ API call failed for ${endpoint}:`, error);
    throw error;
  }
}

async function uploadFile(file, properties = {}) {
  try {
    // Get signed upload URL
    const uploadResponse = await apiCall('/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        mime_type: file.type || 'application/octet-stream'
      })
    });

    // Upload file to storage
    await fetch(uploadResponse.url, {
      method: 'PUT',
      body: file
    });

    // Create object record
    const objectResponse = await apiCall('/objects', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        content: {
          source: uploadResponse.id,
          type: file.type || 'application/octet-stream',
          name: file.name
        },
        properties: properties
      })
    });

    return objectResponse;
  } catch (error) {
    console.error('❌ File upload failed:', error);
    throw error;
  }
}

// Data Loading Functions
async function loadInitialData() {
  showLoading('Loading application data...');
  
  try {
    await Promise.all([
      loadCatalogueItems(),
      loadPastGenerations()
    ]);
  } finally {
    hideLoading();
  }
}

async function loadCatalogueItems() {
  try {
    const items = await apiCall('/objects?properties.kind=catalog_item&limit=100');
    renderCatalogueList(Array.isArray(items) ? items : []);
  } catch (error) {
    console.error('❌ Failed to load catalogue:', error);
    renderCatalogueList([]);
    showToast('Failed to load catalogue items', 'error');
  }
}

async function loadPastGenerations() {
  try {
    const items = await apiCall('/objects?properties.kind=bom&limit=50');
    renderPastList(Array.isArray(items) ? items : []);
  } catch (error) {
    console.error('❌ Failed to load past generations:', error);
    renderPastList([]);
    showToast('Failed to load past generations', 'error');
  }
}

// Rendering Functions
function renderCatalogueList(items) {
  const container = elements.catalogueList;
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No catalogue items yet</div>';
    return;
  }

  container.innerHTML = items.map(item => createListItem(item, 'catalog')).join('');
}

function renderPastList(items) {
  const container = elements.pastList;
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No BOMs generated yet</div>';
    return;
  }

  container.innerHTML = items.map(item => createListItem(item, 'bom')).join('');
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
            <span class="status-badge processing">Processing</span>
            <span>${elapsed}m elapsed</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = queueItems;
}

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

// Action Handlers
async function handleStartGeneration() {
  if (state.selectedSpecs.length === 0) return;
  
  state.isProcessing = true;
  updateStartButton();
  showLoading('Starting BOM generation...');

  try {
    for (const file of state.selectedSpecs) {
      // Upload spec file
      const specObject = await uploadFile(file, { kind: 'spec' });
      
      // Start async generation
      const jobResponse = await apiCall('/execute-async', {
        method: 'POST',
        body: JSON.stringify({
          file: specObject.content.source,
          interaction: 'SpecToBOM@1'
        })
      });

      // Add to queue
      state.queue.set(jobResponse.id, {
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

async function uploadCatalogFiles(files) {
  showLoading('Uploading to catalogue...');
  
  try {
    for (const file of files) {
      await uploadFile(file, { kind: 'catalog_item' });
    }
    
    elements.catalogFiles.value = '';
    await loadCatalogueItems();
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
    const item = await apiCall(`/object-${id}`);
    const downloadUrl = await apiCall('/download-url', {
      method: 'POST',
      body: JSON.stringify({ file: item.content.source })
    });
    window.open(downloadUrl.url, '_blank');
  } catch (error) {
    console.error('❌ Failed to view item:', error);
    showToast('Failed to view item', 'error');
  }
};

window.downloadItem = window.viewItem; // Same functionality

window.deleteItem = async function(id) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  
  try {
    await apiCall(`/object-${id}`, { method: 'DELETE' });
    await Promise.all([loadCatalogueItems(), loadPastGenerations()]);
    showToast('Item deleted successfully', 'success');
  } catch (error) {
    console.error('❌ Failed to delete item:', error);
    showToast('Failed to delete item', 'error');
  }
};

// Queue Monitoring
function startQueueMonitoring() {
  state.queueTimer = setInterval(async () => {
    if (state.queue.size > 0) {
      renderQueue();
      
      // Check for completed jobs by refreshing past generations
      // In a real implementation, you'd poll job status endpoints
      await loadPastGenerations();
    }
  }, 5000); // Check every 5 seconds
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

// Error Handling
window.addEventListener('error', (event) => {
  console.error('❌ Global error:', event.error);
  showToast('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled promise rejection:', event.reason);
  showToast('An unexpected error occurred', 'error');
});

console.log('✅ Spec-to-BOM application ready');

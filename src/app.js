const API = '/api/vertesia';  // all calls go through serverless proxy

// ----- wiring -----
const els = {
  specInput: document.getElementById('specFiles'),
  catalogInput: document.getElementById('catalogFiles'),
  startBtn: document.getElementById('startBtn'),
  queue: document.getElementById('queueList'),
  past: document.getElementById('pastList'),
  cat: document.getElementById('catalogueList')
};

let queue = new Map(); // jobId -> {name, t0}

// init
window.addEventListener('DOMContentLoaded', async () => {
  els.startBtn.addEventListener('click', startGeneration);
  els.catalogInput.addEventListener('change', uploadToCatalogue);
  await Promise.all([loadCatalogue(), loadPastBOMs()]);
});

// ----- catalogue -----
async function loadCatalogue(){
  const res = await fetch(`${API}/objects?properties.kind=catalog_item&limit=200`);
  const items = await res.json();
  renderList(els.cat, items, 'catalog');
}

async function uploadToCatalogue(e){
  const files = Array.from(e.target.files||[]);
  for (const file of files) { await uploadObject(file, { kind:'catalog_item' }); }
  await loadCatalogue();
  e.target.value='';
}

// ----- past generations -----
async function loadPastBOMs(){
  const res = await fetch(`${API}/objects?properties.kind=bom&limit=100`);
  const items = await res.json();
  renderList(els.past, items, 'bom');
}

// ----- generator / queue -----
async function startGeneration(){
  const files = Array.from(els.specInput.files||[]);
  if (!files.length) return alert('Select spec files first.');
  for (const f of files){
    const obj = await uploadObject(f, { kind:'spec' });
    const job = await fetch(`${API}/execute-async`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ file: obj.content.source, interaction: 'SpecToBOM@1' })
    }).then(r=>r.json());
    queue.set(job.id, { name:f.name, t0:Date.now() });
  }
  els.specInput.value='';
  tickQueue();
}

// simple queue ticker (client-side)
function tickQueue(){
  if (queue.size===0){ els.queue.classList.add('empty'); els.queue.textContent='Nothing queued'; return; }
  els.queue.classList.remove('empty'); els.queue.innerHTML='';
  for (const [id, info] of queue){
    const li = document.createElement('div');
    li.className = 'item';
    const mins = Math.ceil((Date.now()-info.t0)/60000);
    li.innerHTML = `<span>${info.name}</span><span class="meta">~${mins}m</span>`;
    els.queue.appendChild(li);
  }
  // optional: poll job status endpoint if you expose one; for now, refresh past list periodically
  setTimeout(async ()=>{
    await loadPastBOMs();
    tickQueue();
  }, 5000);
}

// ----- common helpers -----
async function uploadObject(file, props){
  // 1) signed URL
  const up = await fetch(`${API}/upload-url`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name:file.name, mime_type:file.type || 'application/octet-stream' })
  }).then(r=>r.json());
  // 2) PUT to storage
  await fetch(up.url, { method:'PUT', body:file });
  // 3) create object
  return fetch(`${API}/objects`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      name: file.name,
      content: { source: up.id, type: file.type || 'application/octet-stream', name: file.name },
      properties: props
    })
  }).then(r=>r.json());
}

function renderList(root, items, kind){
  if (!Array.isArray(items) || items.length===0){ root.classList.add('empty'); root.textContent='Nothing here yet'; return; }
  root.classList.remove('empty'); root.innerHTML='';
  items.forEach(x=>{
    const row = document.createElement('div');
    row.className='item';
    const date = (x.created_at||'').slice(0,10);
    row.innerHTML = `
      <div>
        <div>${x.name||'(unnamed)'} ${kind==='bom' ? '<span class="badge">BOM</span>' : ''}</div>
        <div class="meta">${date}</div>
      </div>
      <div class="actions">
        <a onclick="viewItem('${x.id}')">view</a>
        <a onclick="downloadItem('${x.id}')">download</a>
        <a onclick="deleteItem('${x.id}')">delete</a>
      </div>`;
    root.appendChild(row);
  });
}

async function viewItem(id){
  const obj = await fetch(`${API}/object-${id}`).then(r=>r.json());
  const dl = await fetch(`${API}/download-url`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ file: obj.content.source })
  }).then(r=>r.json());
  window.open(dl.url,'_blank');
}
async function downloadItem(id){ return viewItem(id); }
async function deleteItem(id){
  if(!confirm('Delete item?')) return;
  await fetch(`${API}/object-${id}`, { method:'DELETE' });
  await Promise.all([loadCatalogue(), loadPastBOMs()]);
}


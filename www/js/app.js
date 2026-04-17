/**
 * PDFGen — Mobile Offline Application
 * 100% Offline Python-Free JavaScript Compiler
 */

let currentStep = 1;
let selectedTemplate = null;
let currentSchema = null;
let itemRowCount = 0;
let logoBase64 = "";

const TEMPLATE_ICONS = { invoice: 'fa-file-invoice-dollar', itinerary: 'fa-route', receipt: 'fa-receipt', default: 'fa-file-alt' };

document.addEventListener('DOMContentLoaded', async () => {
  // Pre-load base64 logo for the PDF rendering engine
  try {
    const res = await fetch('images/logo.png');
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onloadend = () => { logoBase64 = reader.result; };
    reader.readAsDataURL(blob);
  } catch (e) { console.error("Logo not found offline"); }

  loadTemplates();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('backToTemplates')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btnPreview')?.addEventListener('click', handlePreview);
  
  // Hide Generate PDF since Save and Generate is better workflow
  document.getElementById('btnGenerate')?.classList.add('hidden');
  
  document.getElementById('btnSaveAndGenerate')?.addEventListener('click', handleOfflineExport);
  document.getElementById('btnNewDocument')?.addEventListener('click', () => goToStep(1));
  document.getElementById('closePreview')?.addEventListener('click', closePreviewModal);
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.step-view').forEach((el) => {
    el.classList.add('hidden');
    el.classList.remove('flex', 'block');
  });

  const nextStepEl = document.getElementById(`step${step}`);
  if (nextStepEl) {
    nextStepEl.classList.remove('hidden');
    nextStepEl.classList.add(step === 1 || step === 3 ? 'flex' : 'block');
  }
}

async function loadTemplates() {
  const grid = document.getElementById('templateGrid');
  // Hardcoded template list for offline mode
  const templates = [
    { name: "itinerary", "title": "Tour Itinerary", "description": "Offline Package Generator", "version": "1.0" },
    { name: "invoice", "title": "Tax Invoice", "description": "Offline Billing Document", "version": "1.0" }
  ];

  grid.innerHTML = templates.map((t) => `
    <div class="group relative bg-slate-50 border border-slate-100 p-6 rounded-2xl cursor-pointer hover:border-brand-500" onclick="selectTemplate('${t.name}')">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl text-brand-500"><i class="fas ${TEMPLATE_ICONS[t.name] || TEMPLATE_ICONS.default}"></i></div>
        <div class="flex-1">
          <h4 class="font-bold text-slate-900">${t.title}</h4><p class="text-xs text-slate-500 mt-1">${t.description}</p>
        </div>
      </div>
    </div>
  `).join('');
}

async function selectTemplate(templateName) {
  selectedTemplate = templateName;
  try {
    const response = await fetch(`templates/${templateName}/schema.json`);
    currentSchema = await response.json();
    document.getElementById('formTitle').textContent = `Create ${currentSchema.title}`;
    document.getElementById('formDescription').textContent = currentSchema.description;
    renderForm(currentSchema);
    goToStep(2);
  } catch (error) {
    showToast('Failed to load offline schema', 'error');
  }
}

function renderForm(schema) {
  const container = document.getElementById('formSections');
  container.innerHTML = '';
  itemRowCount = 0;

  schema.sections.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'animate-fade-in space-y-5';
    if (section.type === 'table') {
        sectionEl.innerHTML = `<h4 class="font-bold text-slate-800">${section.title}</h4>
            <div class="items-table-wrapper"><table class="items-table"><thead><tr>
            ${section.columns.map(col => `<th style="${col.width ? `width:${col.width}` : ''}">${col.label}</th>`).join('')}
            </tr></thead><tbody id="itemsTableBody"></tbody></table></div>
            <button type="button" class="w-full py-3 bg-slate-50 text-slate-500 mb-4" onclick="addItemRow()">+ Add item</button>`;
        container.appendChild(sectionEl);
        addItemRow();
    } else {
        sectionEl.innerHTML = `<h4 class="font-bold text-slate-800">${section.title}</h4>
        <div class="grid grid-cols-1 gap-x-6 gap-y-4">${section.fields.map(renderField).join('')}</div>`;
        container.appendChild(sectionEl);
    }
  });

  // Set defaults
  schema.sections.forEach(s => {
    if (s.type === 'table') return;
    s.fields.forEach(f => {
      const el = document.getElementById(f.name);
      if (el && f.default === 'today' && f.type === 'date') el.value = new Date().toISOString().split('T')[0];
    });
  });
}

function renderField(field) {
  const isFullWidth = field.type === 'textarea';
  let inputHtml = field.type === 'textarea' 
    ? `<textarea id="${field.name}" name="${field.name}" class="w-full p-3 border rounded" ${field.required ? 'required' : ''}>${field.default || ''}</textarea>`
    : `<input type="${field.type || 'text'}" id="${field.name}" name="${field.name}" class="w-full p-3 border rounded" ${field.required ? 'required' : ''} value="${field.default || ''}" />`;
  
  return `<div class="field-container ${isFullWidth ? 'md:col-span-2' : ''}"><label>${field.label}</label>${inputHtml}</div>`;
}

function addItemRow() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;
    itemRowCount++;
    const idx = itemRowCount;
    const tr = document.createElement('tr');
    tr.id = `item-row-${idx}`;
    tr.innerHTML = `<td><input type="text" name="item_desc_${idx}"></td><td><input type="number" name="item_qty_${idx}" value="1"></td><td><input type="number" name="item_rate_${idx}"></td>`;
    tbody.appendChild(tr);
}

function collectFormData() {
  const data = {};
  currentSchema.sections.forEach((s) => {
    if (s.type === 'table') return;
    s.fields.forEach(f => { data[f.name] = document.getElementById(f.name)?.value; });
  });
  return data;
}

// ----------------------------------------------------
// OFFLINE CORE COMPILER ENGINE
// ----------------------------------------------------
function formatItineraryContent(text) {
    if (!text) return 'Plan details will be finalized shortly.';
    const lines = text.split('\\n');
    let html = '';
    let inList = false;

    lines.forEach(line => {
        let stripped = line.trim();
        if (!stripped) { html += '<br>'; return; }
        
        const dayMatch = stripped.match(/^(Day\\s+\\d+.*)$/i);
        if (dayMatch) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<div class="day-title">${dayMatch[1]}</div>`; return;
        }
        
        if (stripped.startsWith('🔹') || stripped.startsWith('🔸') || stripped.startsWith('📍')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<div class="itinerary-header">${stripped}</div>`; return;
        }

        if (stripped.startsWith('*') || stripped.startsWith('-')) {
            if (!inList) { html += '<ul class="itinerary-list">'; inList = true; }
            html += `<li>${stripped.substring(1).trim()}</li>`; return;
        }

        if (inList) { html += '</ul>'; inList = false; }

        if (stripped.startsWith('💡')) { html += `<div class="tag-line"><span class="tag-item">💡 ${stripped.substring(2).trim()}</span></div>`; return; }
        if (stripped.startsWith('🏨')) { html += `<div class="tag-line"><span class="tag-item">🏨 ${stripped.substring(2).trim()}</span></div>`; return; }

        const exactTimeRegex = /^(.*\\((?:~?\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm)?\\s*[-–]\\s*~?\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm)?|.*?)\\))$/;
        if (exactTimeRegex.test(stripped)) { html += `<div class="highlight-line">${stripped}</div>`; return; }

        html += `<div class="normal-line">${stripped}</div>`;
    });

    if (inList) { html += '</ul>'; }
    return html;
}

async function renderTemplateOffline(templateName, data) {
    const res = await fetch(`templates/${templateName}/template.html`);
    let html = await res.text();

    // Replicate Python Logic
    if (templateName === "itinerary" && data["itinerary_content"]) {
        data["itinerary_content"] = formatItineraryContent(data["itinerary_content"]);
    }
    data["logo_data_url"] = logoBase64;

    // Simple Jinja Injection Regex Compiler
    for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{\\s*${key}\\s*(?:\\|.*?)*}}`, 'g');
        html = html.replace(regex, value);
    }
    
    // Fallback cleanup
    html = html.replace(/{{\\s*.*\\s*(?:\\|.*?)*}}/g, '');
    return html;
}

async function handlePreview() {
  const btn = document.getElementById('btnPreview');
  btn.disabled = true;
  
  try {
    const rawData = collectFormData();
    const finalHtml = await renderTemplateOffline(selectedTemplate, rawData);
    
    const iframe = document.getElementById('previewModalIframe');
    iframe.srcdoc = finalHtml;

    iframe.onload = () => {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.body.contentEditable = true;
      doc.body.style.cursor = 'text';
    };

    document.getElementById('previewModal').classList.remove('hidden');
    setTimeout(() => { document.getElementById('previewModal').classList.replace('opacity-0', 'opacity-100'); }, 10);
  } catch (err) { alert('Preview Error: ' + err); } finally { btn.disabled = false; }
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.replace('opacity-100', 'opacity-0');
  setTimeout(() => document.getElementById('previewModal').classList.add('hidden'), 300);
}

// ----------------------------------------------------
// OFFLINE PRINT/EXPORT TO NATIVE
// Uses Android's built-in Print Service (Save as PDF)
// Works on ALL Android devices — no plugins needed
// ----------------------------------------------------
async function handleOfflineExport() {
    const iframe = document.getElementById('previewModalIframe');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    // Remove contenteditable to fix pagination
    iframeDoc.body.removeAttribute('contenteditable');
    iframeDoc.body.style.cursor = '';
    
    // Extract the final clean HTML from the preview iframe
    const finalHtml = iframeDoc.documentElement.outerHTML;
    
    // Android WebView blocks iframe.contentWindow.print()
    // The bulletproof fix: replace the MAIN document with the PDF HTML,
    // then call window.print() on the main window — this triggers
    // Android's native Print dialog which has "Save as PDF" built in.
    
    // Replace the entire page with the PDF content
    document.open();
    document.write(finalHtml);
    document.close();
    
    // Wait for the content to fully render
    await new Promise(r => setTimeout(r, 800));
    
    // Trigger Android's native Print Service (Save as PDF)
    window.print();
    
    // After the user finishes with the print dialog, reload the app
    window.onafterprint = () => {
        setTimeout(() => window.location.reload(), 500);
    };
    
    // Fallback: if onafterprint doesn't fire (some Android versions),
    // reload after 8 seconds
    setTimeout(() => window.location.reload(), 8000);
}

function showToast(msg, type = 'info') { alert(msg); }

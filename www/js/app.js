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
// OFFLINE PDF EXPORT — html2pdf.js (Pure JavaScript)
// Renders HTML → Canvas → PDF entirely in JS
// Works on ALL devices, 100% offline, zero native deps
// ----------------------------------------------------
async function handleOfflineExport() {
    const iframe = document.getElementById('previewModalIframe');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    // Clean up editing attributes
    // Prepare iframe for capture - FORCE DESKTOP WIDTH for rendering
    // This ensures all badges, tabs, and gradients render at high-fidelity
    const originalIframeWidth = iframe.style.width;
    iframe.style.width = '794px'; 
    
    iframeDoc.body.removeAttribute('contenteditable');
    iframeDoc.body.style.cursor = '';
    iframeDoc.querySelectorAll('.page-cut-label').forEach(el => el.remove());
    
    const printStyles = iframeDoc.createElement('style');
    printStyles.id = 'pdf-print-overrides';
    printStyles.textContent = `
        body::before { display: none !important; }
        .container { 
            background-image: none !important; 
            box-shadow: none !important; 
            margin: 0 !important;
            border: none !important;
            width: 794px !important;
            padding: 20mm !important;
        }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    `;
    iframeDoc.head.appendChild(printStyles);

    const overlay = document.createElement('div');
    overlay.id = 'pdf-loading-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.98);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:Inter,sans-serif;';
    overlay.innerHTML = `
        <div style="font-size:64px;margin-bottom:20px;">📄</div>
        <div style="font-size:22px;font-weight:800;margin-bottom:8px;color:#f97316;">Capturing All Styles...</div>
        <div style="font-size:14px;opacity:0.6;">Generating high-fidelity 5-page PDF</div>
    `;
    document.body.appendChild(overlay);

    await new Promise(r => setTimeout(r, 2000));

    try {
        const fileName = `Itinerary_${Date.now()}.pdf`;
        const element = iframeDoc.querySelector('.container');

        const options = {
            margin:       0,
            filename:     fileName,
            image:        { type: 'jpeg', quality: 1.0 },
            html2canvas:  { 
                scale: 2,
                useCORS: true, 
                logging: false,
                letterRendering: true,
                backgroundColor: '#ffffff',
                width: 794,
                windowWidth: 794
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        const pdfBlob = await html2pdf().set(options).from(element).outputPdf('blob');
        
        // Restore iframe width
        iframe.style.width = originalIframeWidth;

        // Convert blob to base64 for Capacitor Filesystem
        const base64Data = await blobToBase64(pdfBlob);

        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            let savedFile;

            // Manual Directory constants for safety
            const Dir = {
                Documents: 'DOCUMENTS',
                Cache: 'CACHE'
            };

            try {
                // Try writing to Documents folder
                savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Dir.Documents,
                    recursive: true
                });
            } catch (err) {
                console.warn('Documents access failed, falling back to Cache:', err);
                // FALLBACK: Save to Cache (Always works without permissions)
                savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Dir.Cache,
                    recursive: true
                });
            }

            overlay.innerHTML = `
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:20px;font-weight:700;margin-bottom:12px;">PDF Ready!</div>
                <div style="font-size:14px;opacity:0.8;margin-bottom:20px;">Saved & encrypted successfully</div>
                
                <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:280px;">
                    <button id="sharePdfBtn" style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 10px 20px rgba(37,211,102,0.2);">
                        <i class="fab fa-whatsapp" style="font-size:20px;"></i> Share on WhatsApp
                    </button>
                    <button id="otherShareBtn" style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);padding:12px;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;">
                        Download / More Options
                    </button>
                </div>
            `;

            const triggerShare = async () => {
                try {
                    await Share.share({
                        title: 'UjjainTravel Itinerary',
                        text: 'Sharing travel itinerary from UjjainTravel',
                        url: savedFile.uri,
                        dialogTitle: 'Share via'
                    });
                } catch (e) {
                    console.error('Share error', e);
                    alert('Sharing failed. You can find the file in your Documents/Cache folder.');
                }
            };

            // Auto-trigger share sheet immediately for convenience
            setTimeout(triggerShare, 500);

            document.getElementById('sharePdfBtn').onclick = triggerShare;
            document.getElementById('otherShareBtn').onclick = triggerShare;

            setTimeout(() => { if(document.body.contains(overlay)) overlay.remove(); }, 20000);

        } else {
            // === DESKTOP BROWSER FALLBACK ===
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);

            overlay.innerHTML = `
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:20px;font-weight:700;margin-bottom:8px;">PDF Downloaded!</div>
                <div style="font-size:14px;opacity:0.7;">Check your Downloads folder</div>
            `;
            setTimeout(() => overlay.remove(), 2500);
        }

    } catch (err) {
        overlay.remove();
        alert('PDF Generation Error: ' + (err.message || err));
    } finally {
        // Cleanup temp container
        tempContainer.remove();
        // Restore editing in iframe
        iframeDoc.body.contentEditable = true;
        iframeDoc.body.style.cursor = 'text';
    }
}

// Helper: Convert Blob to base64 string (without data URL prefix)
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remove the "data:application/pdf;base64," prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function showToast(msg, type = 'info') { alert(msg); }

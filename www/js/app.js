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

  // AUTO-INCREMENT BOOKING ID LOGIC
  let lastId = parseInt(localStorage.getItem('last_ut_booking_id')) || 1098;
  const nextBookingId = `UT-${lastId + 1}`;

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

  // Set defaults and dynamic values
  schema.sections.forEach(s => {
    if (s.type === 'table') return;
    s.fields.forEach(f => {
      const el = document.getElementById(f.name);
      if (!el) return;

      if (f.name === 'booking_id') {
          el.value = nextBookingId;
      } else if (f.name === 'customer_phone') {
          el.value = '+91 - ';
      } else if (f.default === 'today' && f.type === 'date') {
          el.value = new Date().toISOString().split('T')[0];
      }
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
    // Handle both real newlines and escaped newlines
    const lines = text.split(/\r?\n|\\n/);
    let html = '';
    let inList = false;

    lines.forEach(line => {
        let stripped = line.trim();
        if (!stripped) { html += '<br>'; return; }
        
        // Match Day 1, Day 01, Day 1: [Title], etc.
        const dayMatch = stripped.match(/^(Day\s*\d+.*)$/i);
        if (dayMatch) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<div class="day-title">${dayMatch[1]}</div>`; return;
        }
        
        if (stripped.startsWith('🔹') || stripped.startsWith('🔸') || stripped.startsWith('📍') || stripped.startsWith('🚩')) {
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

      // AUTO-SCALE TO FIT MOBILE SCREEN
      const container = doc.querySelector('.container');
      if (container) {
          const screenWidth = window.innerWidth * 0.9;
          const desiredWidth = 794; 
          if (screenWidth < desiredWidth) {
              const scale = screenWidth / desiredWidth;
              container.style.transform = `scale(${scale})`;
              container.style.transformOrigin = 'top center';
          }
      }
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
    const originalContainer = iframeDoc.querySelector('.container');
    
    if (!originalContainer) { alert('No content found!'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:Inter,sans-serif;';
    overlay.innerHTML = `
        <div style="font-size:64px;margin-bottom:20px;">⚡</div>
        <div style="font-size:22px;font-weight:800;margin-bottom:8px;color:#f97316;">Finalizing PDF...</div>
        <div style="font-size:14px;opacity:0.8;text-align:center;padding:0 20px;" id="pdf-status">Ensuring design fidelity...</div>
    `;
    document.body.appendChild(overlay);

    const exportBox = document.createElement('div');
    exportBox.id = "final-export-box";
    exportBox.style.cssText = 'position:absolute;left:0;top:-10000px;width:794px;background:#fffcf7;visibility:visible;';
    
    let finalStyles = '';
    iframeDoc.querySelectorAll('style').forEach(s => { finalStyles += `<style>${s.innerHTML}</style>`; });
    const links = Array.from(iframeDoc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
        try {
            const res = await fetch(link.href);
            const cssText = await res.text();
            finalStyles += `<style>${cssText}</style>`;
        } catch (e) { finalStyles += link.outerHTML; }
    }

    // FORCE VISIBILITY: Disable animations and force opacity: 1
    finalStyles += `
        <style>
            * { animation: none !important; transition: none !important; }
            html, body { 
                background: #fffcf7 !important; 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 794px !important; /* Exactly 210mm @ 96dpi */
                overflow: visible !important;
            }
            .container { 
                width: 794px !important; 
                padding: 12mm !important; 
                margin: 0 !important; 
                opacity: 1 !important; 
                background: #fffcf7 !important;
                display: block !important;
                min-height: 100%;
                box-shadow: none !important;
                box-sizing: border-box !important;
            }
            .page-cut-label { display: none !important; }
            .day-title, .itinerary-header { opacity: 1 !important; transform: none !important; }
        </style>
    `;

    exportBox.innerHTML = finalStyles + originalContainer.outerHTML;
    document.body.appendChild(exportBox);

    // CRITICAL: Ensure we are at the top for capture
    window.scrollTo(0, 0);

    // Wait for internal asset resolution
    const images = Array.from(exportBox.querySelectorAll('img'));
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
    
    // Check height
    const height = exportBox.scrollHeight;
    if (height < 100) {
        document.body.removeChild(exportBox);
        overlay.remove();
        alert('Rendering Error: The document appears empty.');
        return;
    }

    document.getElementById('pdf-status').textContent = 'Taking high-res snapshot...';
    await new Promise(r => setTimeout(r, 1000));

    try {
        const fileName = `UT_Itinerary_${Date.now()}.pdf`;
        
        // 1. RAW CANVAS CAPTURE (For Pixel Validation)
        const canvas = await html2canvas(exportBox, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#fffcf7',
            width: 794,
            windowWidth: 794,
            height: height,
            scrollY: 0,
            scrollX: 0,
            logging: false
        });

        // 2. PIXEL VALIDATOR
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, 794, Math.min(canvas.height, 500)); 
        const data = imageData.data;
        let hasContent = false;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < 252 || data[i+1] < 252 || data[i+2] < 252) {
                hasContent = true;
                break;
            }
        }

        if (!hasContent) {
            throw new Error("Validation Failed: Empty capture. The screen might be locked.");
        }

        // 3. CONVERT CANVAS TO PDF (Multi-page Support)
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
        if (!jsPDFLib) throw new Error("PDF Library (jsPDF) not loaded. Please refresh.");

        const pdf = new jsPDFLib('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth(); // 210
        const pageHeight = pdf.internal.pageSize.getHeight(); // 297
        
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeightMm = (imgProps.height * pageWidth) / imgProps.width;
        
        let heightLeft = imgHeightMm;
        let position = 0;

        // First page
        pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeightMm);
        heightLeft -= pageHeight;

        // Subsequent pages
        while (heightLeft > 0) {
            position = heightLeft - imgHeightMm;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeightMm);
            heightLeft -= pageHeight;
        }

        const pdfBlob = pdf.output('blob');

        // INCREMENT AND SAVE BOOKING ID ON SUCCESS
        const currentBookingId = document.getElementById('booking_id')?.value || "";
        if (currentBookingId.startsWith('UT-')) {
            const numericPart = parseInt(currentBookingId.split('-')[1]);
            if (!isNaN(numericPart)) {
                localStorage.setItem('last_ut_booking_id', numericPart);
            }
        }

        if (pdfBlob.size < 3000) {
            throw new Error("PDF generated but size is invalid (" + pdfBlob.size + " bytes).");
        }
        
        // Convert to base64
        const base64Data = await blobToBase64(pdfBlob);

        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            const Dir = { Documents: 'DOCUMENTS', Cache: 'CACHE' };
            let savedFile;

            try {
                savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Dir.Documents,
                    recursive: true
                });
            } catch (err) {
                savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Dir.Cache,
                    recursive: true
                });
            }

            // ... success UI and Share logic ...
            overlay.innerHTML = `
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:20px;font-weight:700;margin-bottom:12px;">PDF is Ready!</div>
                <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:280px;">
                    <button id="sharePdfBtn" style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <i class="fab fa-whatsapp"></i> Share on WhatsApp
                    </button>
                    <button id="closeOverlayBtn" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:10px;border-radius:10px;font-size:14px;cursor:pointer;">Close</button>
                </div>
            `;

            const triggerShare = async () => {
                await Share.share({ title: 'Itinerary', url: savedFile.uri });
            };
            document.getElementById('sharePdfBtn').onclick = triggerShare;
            document.getElementById('closeOverlayBtn').onclick = () => overlay.remove();
            setTimeout(triggerShare, 500);
        } else {
            // Desktop fallback
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            overlay.remove();
        }

    } catch (err) {
        console.error('Export Error:', err);
        alert('Export Err: ' + err.message);
    } finally {
        // CLEANUP
        if (exportBox) exportBox.remove();
        if (overlay && !document.getElementById('sharePdfBtn')) {
            overlay.remove();
        }
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

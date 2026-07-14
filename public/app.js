// Global State
let quill = null;
let csvHeaders = [];
let rawCsvRows = []; // Keep raw csv data intact
let csvRows = [];    // Filtered list of recipients
let smtpSettings = null;
let lastFocusedElement = 'editor'; // default to editor

// Initialize application on DOM content load
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initQuill();
  initSettingsForm();
  initCSVUpload();
  initDispatch();
  
  // Load initial configurations
  loadSettings();
  loadTemplate();
  loadStatsAndLogs();
});

// --- TABS NAVIGATION ---
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content panels
      tabContents.forEach(c => c.classList.remove('active'));
      const activeContent = document.getElementById(tabId);
      activeContent.classList.add('active');
      
      // If switching to Dashboard, reload stats
      if (tabId === 'dashboard-tab') {
        loadStatsAndLogs();
      }
      
      // If switching to Dispatch, verify checklist
      if (tabId === 'send-tab') {
        verifyReadyStatus();
      }
    });
  });
}

// --- WYSIWYG EDITOR (Quill) ---
function initQuill() {
  quill = new Quill('#wysiwyg-editor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        ['clean']
      ]
    }
  });

  // Track editor focus
  quill.on('selection-change', (range) => {
    if (range) {
      lastFocusedElement = 'editor';
    }
  });

  // Track subject input focus
  const subjectInput = document.getElementById('email-subject');
  subjectInput.addEventListener('focus', () => {
    lastFocusedElement = 'subject';
  });
}

// --- SMTP SETTINGS ---
function initSettingsForm() {
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
      host: document.getElementById('smtp-host').value.trim(),
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: parseInt(document.getElementById('smtp-secure').value, 10),
      user: document.getElementById('smtp-user').value.trim(),
      pass: document.getElementById('smtp-pass').value,
      from_email: document.getElementById('smtp-from-email').value.trim(),
      from_name: document.getElementById('smtp-from-name').value.trim()
    };

    try {
      const res = await fetch('api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      
      if (data.success) {
        alertBox('settings-form', 'success', 'Einstellungen erfolgreich gespeichert.');
        smtpSettings = settings;
        verifyReadyStatus();
      } else {
        alertBox('settings-form', 'danger', 'Fehler: ' + data.error);
      }
    } catch (err) {
      alertBox('settings-form', 'danger', 'Verbindungsfehler beim Speichern.');
    }
  });

  // Test connection button
  const testBtn = document.getElementById('btn-send-test-connection');
  testBtn.addEventListener('click', async () => {
    const testEmail = document.getElementById('test-recipient').value.trim();
    if (!testEmail) {
      alertBox('test-connection-alert', 'danger', 'Bitte geben Sie eine Test-Empfängeradresse ein.');
      return;
    }

    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sende Test...';
    
    const payload = {
      testEmail,
      host: document.getElementById('smtp-host').value.trim(),
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: parseInt(document.getElementById('smtp-secure').value, 10),
      user: document.getElementById('smtp-user').value.trim(),
      pass: document.getElementById('smtp-pass').value,
      from_email: document.getElementById('smtp-from-email').value.trim(),
      from_name: document.getElementById('smtp-from-name').value.trim()
    };

    try {
      const res = await fetch('api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        alertBox('test-connection-alert', 'success', data.message);
      } else {
        alertBox('test-connection-alert', 'danger', 'Fehler: ' + data.error);
      }
    } catch (err) {
      alertBox('test-connection-alert', 'danger', 'Verbindungsfehler beim SMTP-Test.');
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Test-E-Mail senden';
    }
  });
}

async function loadSettings() {
  try {
    const res = await fetch('api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      smtpSettings = data.settings;
      document.getElementById('smtp-host').value = smtpSettings.host || '';
      document.getElementById('smtp-port').value = smtpSettings.port || '';
      document.getElementById('smtp-secure').value = smtpSettings.secure !== undefined ? smtpSettings.secure : 0;
      document.getElementById('smtp-user').value = smtpSettings.user || '';
      document.getElementById('smtp-pass').value = smtpSettings.pass || '';
      document.getElementById('smtp-from-email').value = smtpSettings.from_email || '';
      document.getElementById('smtp-from-name').value = smtpSettings.from_name || '';
      verifyReadyStatus();
    }
  } catch (err) {
    console.error('Fehler beim Laden der SMTP-Einstellungen:', err);
  }
}

// --- TEMPLATE SAVE/LOAD ---
function initTemplateSave() {
  const saveBtn = document.getElementById('btn-save-template');
  saveBtn.addEventListener('click', async () => {
    const subject = document.getElementById('email-subject').value.trim();
    const body = quill.root.innerHTML;
    const recipient_column = document.getElementById('recipient-column-select').value;

    if (!subject) {
      alert('Bitte geben Sie einen Betreff ein.');
      return;
    }

    try {
      const res = await fetch('api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, recipient_column })
      });
      const data = await res.json();
      
      if (data.success) {
        const statusSpan = document.getElementById('template-save-status');
        statusSpan.style.display = 'inline';
        setTimeout(() => {
          statusSpan.style.display = 'none';
        }, 3000);
      } else {
        alert('Fehler beim Speichern der Vorlage: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Verbindungsfehler beim Speichern der Vorlage.');
    }
  });
}
// Attach helper
document.getElementById('btn-save-template').addEventListener('click', async () => {
  const subject = document.getElementById('email-subject').value.trim();
  const body = quill.root.innerHTML;
  const recipient_column = document.getElementById('recipient-column-select') ? document.getElementById('recipient-column-select').value : '';

  try {
    const res = await fetch('api/save-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, recipient_column })
    });
    const data = await res.json();
    if (data.success) {
      const statusSpan = document.getElementById('template-save-status');
      statusSpan.style.display = 'inline';
      setTimeout(() => statusSpan.style.display = 'none', 3000);
    }
  } catch (err) {
    console.error('Fehler beim Speichern der Vorlage:', err);
  }
});

async function loadTemplate() {
  try {
    const res = await fetch('api/template');
    const data = await res.json();
    if (data.success && data.template) {
      document.getElementById('email-subject').value = data.template.subject || '';
      if (data.template.body) {
        quill.root.innerHTML = data.template.body;
      }
      // Save recipient column info to restore later if columns are loaded
      window.savedRecipientColumn = data.template.recipient_column;
    }
  } catch (err) {
    console.error('Fehler beim Laden der Vorlage:', err);
  }
}

// --- CSV FILE UPLOAD ---
function initCSVUpload() {
  const dropZone = document.getElementById('csv-drop-zone');
  const fileInput = document.getElementById('csv-file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary-color)';
    dropZone.style.background = 'rgba(139, 92, 246, 0.08)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
    dropZone.style.background = 'rgba(139, 92, 246, 0.02)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
    dropZone.style.background = 'rgba(139, 92, 246, 0.02)';
    
    if (e.dataTransfer.files.length > 0) {
      handleCSVFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleCSVFile(fileInput.files[0]);
    }
  });
}

async function handleCSVFile(file) {
  const formData = new FormData();
  formData.append('csvFile', file);

  try {
    const res = await fetch('api/upload-csv', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (data.success) {
      csvHeaders = data.data.headers;
      rawCsvRows = data.data.rows;
      
      displayCSVDetails();
      filterAndDisplayCSV();
    } else {
      alert('Fehler beim Verarbeiten der CSV: ' + data.error);
    }
  } catch (err) {
    alert('Verbindungsfehler beim Hochladen der CSV.');
  }
}

function displayCSVDetails() {
  // Show information section
  document.getElementById('csv-info').style.display = 'block';
  document.getElementById('csv-preview-card').style.display = 'block';
  
  // 1. Populate recipient dropdown picker
  const columnSelect = document.getElementById('recipient-column-select');
  columnSelect.innerHTML = '';
  
  let defaultSelectedIndex = 0;
  csvHeaders.forEach((header, index) => {
    const option = document.createElement('option');
    option.value = header;
    option.textContent = header;
    columnSelect.appendChild(option);
    
    // Auto-select column named E-Mail/Email
    if (header.toLowerCase() === 'e-mail' || header.toLowerCase() === 'email') {
      defaultSelectedIndex = index;
    }
  });
  
  // If we had a previously saved recipient column, restore it if it exists
  if (window.savedRecipientColumn && csvHeaders.includes(window.savedRecipientColumn)) {
    columnSelect.value = window.savedRecipientColumn;
  } else {
    columnSelect.selectedIndex = defaultSelectedIndex;
  }

  // Trigger filter when selection changes
  columnSelect.onchange = () => {
    filterAndDisplayCSV();
  };

  // 2. Generate placeholder badges
  const placeholdersContainer = document.getElementById('placeholders-container');
  placeholdersContainer.innerHTML = '';
  
  csvHeaders.forEach(header => {
    const badge = document.createElement('span');
    badge.className = 'placeholder-badge';
    badge.innerHTML = `<i class="fa-solid fa-code"></i> ${header}`;
    badge.addEventListener('click', () => insertPlaceholder(header));
    placeholdersContainer.appendChild(badge);
  });

  // 3. Render CSV Header Preview
  const thead = document.querySelector('#csv-table-preview thead tr');
  thead.innerHTML = '';
  csvHeaders.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    thead.appendChild(th);
  });
}

function filterAndDisplayCSV() {
  const columnSelect = document.getElementById('recipient-column-select');
  const selectedCol = columnSelect ? columnSelect.value : '';
  
  if (!selectedCol) {
    csvRows = rawCsvRows;
  } else {
    // Filter out rows where the email attribute is empty
    csvRows = rawCsvRows.filter(row => row[selectedCol] && row[selectedCol].trim() !== '');
  }
  
  // 1. Render CSV Preview table (limit to first 10 rows for page speed)
  const tbody = document.querySelector('#csv-table-preview tbody');
  tbody.innerHTML = '';
  
  const previewRows = csvRows.slice(0, 10);
  previewRows.forEach(row => {
    const tr = document.createElement('tr');
    csvHeaders.forEach(header => {
      const td = document.createElement('td');
      td.textContent = row[header] || '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Update counts
  const totalCount = rawCsvRows.length;
  const activeCount = csvRows.length;
  const filteredCount = totalCount - activeCount;
  
  let countStr = `Einträge: ${activeCount}`;
  if (filteredCount > 0) {
    countStr += ` (${filteredCount} ohne E-Mail gefiltert)`;
  }
  countStr += ` (Vorschau zeigt max. 10)`;
  document.getElementById('csv-row-count').textContent = countStr;

  // 2. Update recipient row selector in dispatch center
  const dispatchRowSelect = document.getElementById('select-recipient-row');
  dispatchRowSelect.innerHTML = '';
  dispatchRowSelect.disabled = false;

  csvRows.forEach((row, index) => {
    const option = document.createElement('option');
    option.value = index;
    
    // Build readable text: Vorname + Nachname + E-Mail
    const firstName = row['Vorname'] || '';
    const lastName = row['Nachname'] || '';
    const nameStr = `${firstName} ${lastName}`.trim();
    const emailStr = row[selectedCol] || '';
    
    option.textContent = `Zeile ${index + 1}: ${nameStr ? nameStr : 'Unbekannt'} (${emailStr})`;
    dispatchRowSelect.appendChild(option);
  });

  // 3. Update dispatch checklist status
  verifyReadyStatus();
}

function insertPlaceholder(name) {
  const placeholderText = `{{${name}}}`;
  if (lastFocusedElement === 'subject') {
    const subjectInput = document.getElementById('email-subject');
    const start = subjectInput.selectionStart;
    const end = subjectInput.selectionEnd;
    const text = subjectInput.value;
    subjectInput.value = text.substring(0, start) + placeholderText + text.substring(end);
    subjectInput.focus();
    subjectInput.selectionStart = subjectInput.selectionEnd = start + placeholderText.length;
  } else {
    const range = quill.getSelection(true);
    quill.insertText(range.index, placeholderText);
    quill.setSelection(range.index + placeholderText.length);
  }
}

// --- DISPATCH CENTER LOGIC ---
function initDispatch() {
  // Override recipient checkbox toggle
  const overrideCheckbox = document.getElementById('chk-override-recipient');
  const overrideContainer = document.getElementById('override-recipient-container');
  
  overrideCheckbox.addEventListener('change', () => {
    overrideContainer.style.display = overrideCheckbox.checked ? 'block' : 'none';
  });

  // Single test send button
  const sendSingleBtn = document.getElementById('btn-send-single');
  sendSingleBtn.addEventListener('click', async () => {
    const selectedIdx = document.getElementById('select-recipient-row').value;
    if (selectedIdx === "") return;

    const rowData = csvRows[selectedIdx];
    const recipientColumn = document.getElementById('recipient-column-select').value;
    const overrideRecipient = overrideCheckbox.checked ? document.getElementById('override-recipient-email').value.trim() : null;
    
    if (overrideCheckbox.checked && !overrideRecipient) {
      alertBox('single-dispatch-alert', 'danger', 'Bitte geben Sie die alternative Test-E-Mail an.');
      return;
    }

    sendSingleBtn.disabled = true;
    sendSingleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sende...';

    const payload = {
      subjectTemplate: document.getElementById('email-subject').value.trim(),
      bodyTemplate: quill.root.innerHTML,
      rowData,
      recipientColumn,
      overrideRecipient
    };

    try {
      const res = await fetch('api/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        alertBox('single-dispatch-alert', 'success', data.message);
        loadStatsAndLogs();
      } else {
        alertBox('single-dispatch-alert', 'danger', 'Senden fehlgeschlagen: ' + data.error);
      }
    } catch (err) {
      alertBox('single-dispatch-alert', 'danger', 'Verbindungsfehler beim Senden.');
    } finally {
      sendSingleBtn.disabled = false;
      sendSingleBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> Einzelne Test-E-Mail senden';
    }
  });

  // Batch send button
  const sendBatchBtn = document.getElementById('btn-send-batch');
  sendBatchBtn.addEventListener('click', startBatchDispatch);
}

// Perform readiness checks before allowing send actions
function verifyReadyStatus() {
  const smtpStatusDiv = document.getElementById('check-smtp-status');
  const csvStatusDiv = document.getElementById('check-csv-status');
  
  const sendSingleBtn = document.getElementById('btn-send-single');
  const sendBatchBtn = document.getElementById('btn-send-batch');

  let smtpReady = false;
  let csvReady = false;

  // 1. SMTP Check
  if (smtpSettings && smtpSettings.host && smtpSettings.port && smtpSettings.from_email) {
    smtpStatusDiv.className = "alert-box success";
    smtpStatusDiv.innerHTML = `
      <i class="fa-solid fa-circle-check"></i>
      <div>SMTP konfiguriert: <strong>${smtpSettings.host}:${smtpSettings.port}</strong> (Absender: ${smtpSettings.from_name || smtpSettings.from_email})</div>
    `;
    smtpReady = true;
  } else {
    smtpStatusDiv.className = "alert-box danger";
    smtpStatusDiv.innerHTML = `
      <i class="fa-solid fa-circle-xmark"></i>
      <div>SMTP nicht konfiguriert oder unvollständig. Bitte im Tab "SMTP-Einstellungen" eintragen.</div>
    `;
  }

  // 2. CSV Check
  if (csvRows && csvRows.length > 0) {
    csvStatusDiv.className = "alert-box success";
    csvStatusDiv.innerHTML = `
      <i class="fa-solid fa-circle-check"></i>
      <div>CSV geladen: <strong>${csvRows.length} Kontakte</strong> gefunden. Spalte für E-Mail: <strong>"${document.getElementById('recipient-column-select').value}"</strong>.</div>
    `;
    csvReady = true;
  } else {
    csvStatusDiv.className = "alert-box danger";
    csvStatusDiv.innerHTML = `
      <i class="fa-solid fa-circle-xmark"></i>
      <div>Keine CSV-Daten geladen. Bitte im Tab "Entwurf & CSV" hochladen.</div>
    `;
  }

  // Enable/disable buttons based on checks
  if (smtpReady && csvReady) {
    sendSingleBtn.disabled = false;
    sendBatchBtn.disabled = false;
  } else {
    sendSingleBtn.disabled = true;
    sendBatchBtn.disabled = true;
  }
}

// BATCH SEND MASS MAILINGS VIA SERVER-SENT EVENTS (SSE)
async function startBatchDispatch() {
  const sendBatchBtn = document.getElementById('btn-send-batch');
  const progressPanel = document.getElementById('batch-progress-panel');
  const progressBar = document.getElementById('batch-progress-bar');
  const statusTxt = document.getElementById('batch-progress-status');
  const percentTxt = document.getElementById('batch-progress-percent');
  const counterTxt = document.getElementById('batch-progress-counter');
  const logsConsole = document.getElementById('batch-logs');

  if (!confirm(`Möchten Sie den Serienbrief-Versand an alle ${csvRows.length} Empfänger jetzt starten?`)) {
    return;
  }

  // Prepare UI & stats
  let stats = { success: 0, failed: 0 };
  sendBatchBtn.disabled = true;
  document.getElementById('btn-send-single').disabled = true;
  progressPanel.style.display = 'block';
  logsConsole.style.display = 'block';
  logsConsole.innerHTML = '';
  progressBar.style.width = '0%';
  progressBar.style.background = 'var(--primary-gradient)';
  statusTxt.textContent = 'Versand wird gestartet...';
  percentTxt.textContent = '0%';
  counterTxt.textContent = `E-Mail 0 von ${csvRows.length} verarbeitet (0 erfolgreich, 0 fehlgeschlagen)`;

  const subjectTemplate = document.getElementById('email-subject').value.trim();
  const bodyTemplate = quill.root.innerHTML;
  const recipientColumn = document.getElementById('recipient-column-select').value;

  try {
    const response = await fetch('api/send-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectTemplate,
        bodyTemplate,
        recipientColumn,
        rows: csvRows
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = 'Fehler beim Starten des Batch-Versands';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error || errJson.message || errMsg;
      } catch(e) {}
      throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // save leftovers

      for (const line of lines) {
        if (line.trim() === '') continue;

        // Extract event name and data json
        const eventMatch = line.match(/^event:\s*(.+)$/m);
        const dataMatch = line.match(/^data:\s*(.+)$/m);

        if (!dataMatch) continue;
        const event = eventMatch ? eventMatch[1].trim() : 'message';
        const data = JSON.parse(dataMatch[1].trim());

        handleSSEMessage(event, data, {
          progressBar,
          statusTxt,
          percentTxt,
          counterTxt,
          logsConsole
        }, stats);
      }
    }
  } catch (err) {
    appendConsoleLog(logsConsole, 'SYSTEM', 'FEHLER', `Kritischer Fehler: ${err.message}`, true);
    statusTxt.textContent = 'Senden fehlgeschlagen.';
    progressBar.style.background = 'var(--danger-color)';
  } finally {
    sendBatchBtn.disabled = false;
    document.getElementById('btn-send-single').disabled = false;
    loadStatsAndLogs();
  }
}

function handleSSEMessage(event, data, ui, stats) {
  if (event === 'start') {
    ui.statusTxt.textContent = 'Sende Serienbriefe...';
    ui.counterTxt.textContent = `E-Mail 0 von ${data.total} verarbeitet (0 erfolgreich, 0 fehlgeschlagen)`;
  } 
  else if (event === 'progress') {
    const percent = Math.round((data.current / data.total) * 100);
    ui.progressBar.style.width = `${percent}%`;
    ui.percentTxt.textContent = `${percent}%`;
    
    if (data.status === 'WAITING') {
      ui.statusTxt.textContent = data.message;
      appendConsoleLog(ui.logsConsole, 'SYSTEM', 'WAIT', data.message, false);
      return;
    }
    
    ui.statusTxt.textContent = 'Sende Serienbriefe...';
    
    const isError = data.status === 'FAILED';
    if (isError) {
      stats.failed++;
      // Set to warning / error color
      ui.progressBar.style.background = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
    } else {
      stats.success++;
    }
    
    ui.counterTxt.textContent = `E-Mail ${data.current} von ${data.total} verarbeitet (${stats.success} erfolgreich, ${stats.failed} fehlgeschlagen)`;
    
    appendConsoleLog(
      ui.logsConsole, 
      data.recipient, 
      data.status, 
      isError ? data.error : 'Erfolgreich versendet', 
      isError
    );
  } 
  else if (event === 'complete') {
    if (stats.failed > 0) {
      ui.statusTxt.textContent = `Abgeschlossen mit ${stats.failed} Fehlern!`;
      ui.progressBar.style.background = 'var(--danger-color)';
      appendConsoleLog(ui.logsConsole, 'SYSTEM', 'WARNUNG', `Massenversand beendet. ${stats.success} erfolgreich, ${stats.failed} fehlgeschlagen.`, true);
    } else {
      ui.statusTxt.textContent = 'Erfolgreich abgeschlossen!';
      ui.progressBar.style.background = 'var(--success-color)';
      appendConsoleLog(ui.logsConsole, 'SYSTEM', 'SUCCESS', 'Alle Serienmails erfolgreich versendet.', false);
    }
  } 
  else if (event === 'error') {
    ui.statusTxt.textContent = 'Fehler aufgetreten.';
    ui.progressBar.style.background = 'var(--danger-color)';
    appendConsoleLog(ui.logsConsole, 'SYSTEM', 'FAILED', data.message, true);
  }
}

function appendConsoleLog(consoleElem, recipient, status, msg, isError) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const timeStr = new Date().toLocaleTimeString();
  
  entry.innerHTML = `
    <span class="time">[${timeStr}]</span>
    <span class="recipient">${recipient}</span>
    <span class="status ${status.toLowerCase()}">${status}</span>
    ${isError ? `<span class="error-msg">${msg}</span>` : ` - ${msg}`}
  `;
  
  consoleElem.appendChild(entry);
  consoleElem.scrollTop = consoleElem.scrollHeight; // Autoscroll to bottom
}

// --- STATS AND LOGS (DASHBOARD) ---
async function loadStatsAndLogs() {
  try {
    const res = await fetch('api/logs');
    const data = await res.json();
    
    if (data.success && data.logs) {
      const logs = data.logs;
      const total = logs.length;
      const success = logs.filter(l => l.status === 'SUCCESS').length;
      const failed = logs.filter(l => l.status === 'FAILED').length;
      const rate = total > 0 ? Math.round((success / total) * 100) : 0;

      // Update counters
      document.getElementById('stat-total').textContent = total;
      document.getElementById('stat-success').textContent = success;
      document.getElementById('stat-failed').textContent = failed;
      document.getElementById('stat-rate').textContent = `${rate}%`;

      // Render logs
      const alertBox = document.getElementById('no-logs-alert');
      const logsContainer = document.getElementById('logs-container');
      const consoleElem = document.getElementById('dashboard-logs');

      if (total === 0) {
        alertBox.style.display = 'flex';
        logsContainer.style.display = 'none';
      } else {
        alertBox.style.display = 'none';
        logsContainer.style.display = 'block';
        consoleElem.innerHTML = '';
        
        logs.forEach(log => {
          const entry = document.createElement('div');
          entry.className = 'log-entry';
          
          const date = new Date(log.timestamp);
          const timeStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
          const isError = log.status === 'FAILED';
          
          entry.innerHTML = `
            <span class="time">[${timeStr}]</span>
            Betreff: <strong style="color:#fff;">"${log.subject}"</strong> &rarr; 
            Empfänger: <span class="recipient">${log.recipient}</span>
            <span class="status ${log.status.toLowerCase()}">${log.status}</span>
            ${isError ? `<span class="error-msg">(${log.error_message})</span>` : ''}
          `;
          consoleElem.appendChild(entry);
        });
      }
    }
  } catch (err) {
    console.error('Fehler beim Laden der Statistiken:', err);
  }
}

// Clear log database button
document.getElementById('btn-clear-logs').addEventListener('click', async () => {
  if (!confirm('Möchten Sie das gesamte Sendeprotokoll unwiderruflich löschen?')) {
    return;
  }
  
  try {
    const res = await fetch('api/logs', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadStatsAndLogs();
    }
  } catch (err) {
    console.error('Fehler beim Löschen der Logs:', err);
  }
});

// Helper to show/fade custom alerts
function alertBox(targetId, type, message) {
  let alertElem;
  if (targetId === 'settings-form' || targetId === 'test-connection-alert' || targetId === 'single-dispatch-alert') {
    // These are alert containers or target forms where we place alerts
    const id = targetId + '-alert-box';
    let existing = document.getElementById(id);
    if (existing) existing.remove();

    alertElem = document.createElement('div');
    alertElem.id = id;
    alertElem.className = `alert-box ${type}`;
    alertElem.innerHTML = `
      <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
      <div>${message}</div>
    `;

    if (targetId === 'settings-form') {
      const form = document.getElementById('settings-form');
      form.insertBefore(alertElem, form.querySelector('.btn-group'));
    } else {
      const container = document.getElementById(targetId);
      container.innerHTML = '';
      container.appendChild(alertElem);
      container.style.display = 'block';
    }

    // Auto fade after 5 seconds
    setTimeout(() => {
      if (alertElem && alertElem.parentNode) {
        alertElem.remove();
      }
    }, 5000);
  }
}

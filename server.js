const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file upload
const upload = multer({ dest: 'uploads/' });

// Helper to replace placeholders like {{Vorname}}
function replacePlaceholders(text, rowData) {
  if (!text) return '';
  return text.replace(/\{\{([^}]+)\}\}/g, (match, p1) => {
    const key = p1.trim();
    return rowData[key] !== undefined ? rowData[key] : match;
  });
}

// Semicolon CSV Parser
function parseCSV(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.substring(1);
  }
  
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        currentLine.push(currentField.trim());
        currentField = '';
        if (currentLine.length > 0 && currentLine.some(cell => cell !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    }
  }
  
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(cell => cell !== '')) {
      lines.push(currentLine);
    }
  }
  
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const rawHeaders = lines[0];
  const cleanHeaders = rawHeaders.map((h, index) => h.trim() || `Spalte_${index + 1}`);
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = {};
    const line = lines[i];
    for (let j = 0; j < cleanHeaders.length; j++) {
      row[cleanHeaders[j]] = line[j] !== undefined ? line[j] : '';
    }
    rows.push(row);
  }
  
  return { headers: cleanHeaders, rows };
}

// Mail transporter helper
function createTransporter(settings) {
  if (!settings.host || !settings.port) {
    throw new Error('SMTP Host oder Port ist nicht konfiguriert.');
  }
  
  const config = {
    host: settings.host,
    port: parseInt(settings.port, 10),
    secure: settings.secure === 1,
    auth: {
      user: settings.user,
      pass: settings.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  };
  
  return nodemailer.createTransport(config);
}

// API Routes

// SMTP Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    // Don't send back the real password in plain text if not needed,
    // but for editing it is fine. We will send it.
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from_email, from_name } = req.body;
    await db.saveSettings({ host, port, secure, user, pass, from_email, from_name });
    res.json({ success: true, message: 'SMTP-Einstellungen erfolgreich gespeichert.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test SMTP Settings
app.post('/api/settings/test', async (req, res) => {
  try {
    const { testEmail, host, port, secure, user, pass, from_email, from_name } = req.body;
    if (!testEmail) {
      return res.status(400).json({ success: false, error: 'Test-Empfängeradresse fehlt.' });
    }
    
    const transporter = createTransporter({ host, port, secure: secure ? 1 : 0, user, pass });
    const mailOptions = {
      from: from_name ? `"${from_name}" <${from_email}>` : from_email,
      to: testEmail,
      subject: 'Test-E-Mail von Antigravity Emailer',
      text: 'Hallo! Diese E-Mail bestätigt, dass Ihre SMTP-Konfiguration funktioniert.',
      html: '<p>Hallo!</p><p>Diese E-Mail bestätigt, dass Ihre <strong>SMTP-Konfiguration funktioniert</strong>.</p>'
    };
    
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: `Test-E-Mail erfolgreich an ${testEmail} gesendet.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CSV Upload
app.post('/api/upload-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen.' });
    }
    
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    const data = parseCSV(content);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Templates
app.get('/api/template', async (req, res) => {
  try {
    const template = await db.getTemplate();
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/save-template', async (req, res) => {
  try {
    const { subject, body, recipient_column } = req.body;
    await db.saveTemplate({ subject, body, recipient_column });
    res.json({ success: true, message: 'Vorlage erfolgreich gespeichert.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send Single Email
app.post('/api/send-single', async (req, res) => {
  try {
    const { subjectTemplate, bodyTemplate, rowData, recipientColumn, overrideRecipient } = req.body;
    
    const settings = await db.getSettings();
    const transporter = createTransporter(settings);
    
    const recipient = overrideRecipient || rowData[recipientColumn];
    if (!recipient) {
      return res.status(400).json({ success: false, error: `Kein Empfänger unter der Spalte "${recipientColumn}" gefunden.` });
    }
    
    const subject = replacePlaceholders(subjectTemplate, rowData);
    const htmlBody = replacePlaceholders(bodyTemplate, rowData);
    
    const mailOptions = {
      from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
      to: recipient,
      subject: subject,
      html: htmlBody
    };
    
    let status = 'SUCCESS';
    let errorMessage = null;
    
    try {
      await transporter.sendMail(mailOptions);
    } catch (sendErr) {
      status = 'FAILED';
      errorMessage = sendErr.message;
    }
    
    // Log to DB
    await db.addLog({ recipient, subject, status, error_message: errorMessage });
    
    if (status === 'SUCCESS') {
      res.json({ success: true, message: `E-Mail erfolgreich an ${recipient} gesendet.` });
    } else {
      res.status(500).json({ success: false, error: `Senden an ${recipient} fehlgeschlagen: ${errorMessage}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send Batch (using SSE for live updates)
app.post('/api/send-batch', async (req, res) => {
  const { subjectTemplate, bodyTemplate, recipientColumn, rows } = req.body;
  
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Keine Empfängerzeilen übergeben.' });
  }

  let settings;
  try {
    settings = await db.getSettings();
    if (!settings || !settings.host || !settings.port) {
      return res.status(400).json({ success: false, error: 'SMTP ist nicht konfiguriert.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Datenbankfehler: ' + err.message });
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish stream immediately
  
  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    let transporter;
    try {
      transporter = createTransporter(settings);
    } catch (smtpErr) {
      sendSSE('error', { message: `SMTP-Verbindung fehlgeschlagen: ${smtpErr.message}` });
      return res.end();
    }
    
    const total = rows.length;
    sendSSE('start', { total });
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const recipient = row[recipientColumn];
      
      if (!recipient) {
        const errorMsg = `Zeile ${i + 1}: Empfänger-E-Mail fehlt (Spalte "${recipientColumn}").`;
        await db.addLog({
          recipient: `Zeile ${i + 1} (Unbekannt)`,
          subject: subjectTemplate,
          status: 'FAILED',
          error_message: 'Empfänger-Spalte leer oder nicht vorhanden'
        });
        sendSSE('progress', {
          current: i + 1,
          total,
          recipient: `Zeile ${i + 1}`,
          status: 'FAILED',
          error: errorMsg
        });
        continue;
      }
      
      const subject = replacePlaceholders(subjectTemplate, row);
      const htmlBody = replacePlaceholders(bodyTemplate, row);
      
      const mailOptions = {
        from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
        to: recipient,
        subject: subject,
        html: htmlBody
      };
      
      let status = 'SUCCESS';
      let errorMessage = null;
      
      try {
        await transporter.sendMail(mailOptions);
        // Small delay to prevent rate limit issues
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (sendErr) {
        status = 'FAILED';
        errorMessage = sendErr.message;
      }
      
      await db.addLog({ recipient, subject, status, error_message: errorMessage });
      
      sendSSE('progress', {
        current: i + 1,
        total,
        recipient,
        status,
        error: errorMessage
      });

      // Pause for Exchange limits protection (25 emails per minute)
      if ((i + 1) % 25 === 0 && (i + 1) < rows.length) {
        sendSSE('progress', {
          current: i + 1,
          total,
          recipient: 'SYSTEM',
          status: 'WAITING',
          message: 'Exchange-Schutz: 60 Sekunden Pause vor dem nächsten Block...'
        });
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
    
    sendSSE('complete', { message: 'Batch-Versand abgeschlossen.' });
  } catch (err) {
    sendSSE('error', { message: `Kritischer Fehler beim Batch-Versand: ${err.message}` });
  } finally {
    res.end();
  }
});

// Logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await db.getLogs();
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    await db.clearLogs();
    res.json({ success: true, message: 'Logs erfolgreich gelöscht.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start DB & Express
db.initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server läuft auf http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('Datenbank-Initialisierung fehlgeschlagen:', err);
  });

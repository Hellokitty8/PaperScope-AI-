
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Use a fixed port for local dev to match Vite proxy
const PORT = 8080;

// Increase payload limit for base64 uploads (PDFs can be large)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// --- Storage Setup ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'data_store.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config_store.json');

// Ensure directories exist
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    
    // Initialize DB files if they don't exist
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
    if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ banner: '/banner.jpg' }));
    
    console.log("✅ Storage System Initialized");
} catch (e) {
    console.error("❌ FATAL ERROR: Could not initialize storage.", e);
}

// --- Helpers ---
const getData = () => {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    return content ? JSON.parse(content) : [];
  } catch (e) {
    console.error("❌ Error reading DB:", e);
    return [];
  }
};

const setData = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("❌ Error writing DB:", e);
    return false;
  }
};

const getConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { banner: '/banner.jpg' };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
        return { banner: '/banner.jpg' };
    }
};

const setConfig = (config) => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch(e) {
        console.error("Error writing config:", e);
    }
};

// --- API Routes ---

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', storage: fs.existsSync(DB_PATH) ? 'writable' : 'error' });
});

// Get all papers
app.get('/api/papers', (req, res) => {
  try {
    const papers = getData();
    const sanitizedPapers = papers.map(p => ({
        ...p,
        file: `/api/files/${p.id}.pdf` 
    }));
    res.json(sanitizedPapers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load papers" });
  }
});

// Serve PDF File
app.get('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || !filename.endsWith('.pdf')) {
        return res.status(400).send('Invalid filename');
    }
    
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// Save or Update a paper
app.post('/api/papers', (req, res) => {
  try {
    const paper = req.body;
    console.log(`📥 Saving: ${paper.fileName || paper.id}`);

    if (!paper || !paper.id) return res.status(400).json({ error: "Invalid paper data" });

    // 1. Handle File Storage
    if (paper.file && typeof paper.file === 'string' && paper.file.length > 500) {
        let base64Data = paper.file;
        if (base64Data.includes(';base64,')) {
            base64Data = base64Data.split(';base64,')[1];
        }
        
        const filePath = path.join(UPLOAD_DIR, `${paper.id}.pdf`);
        try {
             fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        } catch (fileErr) {
            console.error("   ❌ Failed to write PDF:", fileErr);
            return res.status(500).json({ error: "Disk write failed" });
        }
    }

    // 2. Update Metadata
    const papers = getData();
    const index = papers.findIndex(p => p.id === paper.id);
    const metadata = { ...paper };
    delete metadata.file; 

    if (index !== -1) {
      papers[index] = { ...papers[index], ...metadata };
    } else {
      papers.push(metadata);
    }
    
    if (setData(papers)) res.json({ success: true });
    else res.status(500).json({ error: "Database write failed" });

  } catch (e) {
    console.error("   ❌ Save Error:", e.message);
    res.status(500).json({ error: "Failed to save paper: " + e.message });
  }
});

// Delete
app.delete('/api/papers/:id', (req, res) => {
  try {
    const id = req.params.id;
    let papers = getData();
    papers = papers.filter(p => p.id !== id);
    setData(papers);
    const filePath = path.join(UPLOAD_DIR, `${id}.pdf`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete paper" });
  }
});

// Config
app.get('/api/config/banner', (req, res) => { res.json(getConfig()); });
app.post('/api/config/banner', (req, res) => { setConfig({ banner: req.body.banner }); res.json({ success: true }); });

// Serve static
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.send(`Backend Running. Frontend not found in /dist.`);
});

const server = app.listen(PORT, () => {
  console.log(`\n✅ ==========================================`);
  console.log(`🚀 SERVER STARTED SUCCESSFULLY!`);
  console.log(`👉 Backend URL: http://localhost:${PORT}`);
  console.log(`==========================================\n`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error(`   Please close the other terminal window running 'node server.js' or 'npm start'.`);
    console.error(`   Or run: npx kill-port ${PORT}\n`);
    process.exit(1);
  } else {
    console.error(e);
  }
});

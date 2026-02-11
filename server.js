
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const port = process.env.PORT || 8080;

// Increase payload limit for base64 files and images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Data file paths
const DB_PATH = path.join(__dirname, 'data_store.json');
const CONFIG_PATH = path.join(__dirname, 'config_store.json');

// Ensure storage files exist
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ banner: '/banner.jpg' }));

// Helper to read/write
const getData = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const setData = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
const getConfig = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const setConfig = (config) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

// API Routes

// Get all shared papers
app.get('/api/papers', (req, res) => {
  try {
    const papers = getData();
    res.json(papers);
  } catch (e) {
    res.status(500).json({ error: "Failed to load papers" });
  }
});

// Save or Update a paper
app.post('/api/papers', (req, res) => {
  try {
    const paper = req.body;
    const papers = getData();
    const index = papers.findIndex(p => p.id === paper.id);
    
    if (index !== -1) {
      papers[index] = paper;
    } else {
      papers.push(paper);
    }
    
    setData(papers);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save paper" });
  }
});

// Delete a paper
app.delete('/api/papers/:id', (req, res) => {
  try {
    const id = req.params.id;
    let papers = getData();
    papers = papers.filter(p => p.id !== id);
    setData(papers);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete paper" });
  }
});

// Banner Config
app.get('/api/config/banner', (req, res) => {
  res.json(getConfig());
});

app.post('/api/config/banner', (req, res) => {
  const { banner } = req.body;
  setConfig({ banner });
  res.json({ success: true });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Shared Server Workspace running on port ${port}`);
});

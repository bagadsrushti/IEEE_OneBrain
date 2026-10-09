require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initializeSockets } = require('./socket');
const path = require('path');

const clientUrl = process.env.CLIENT_URL || '*';
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

app.use(cors({ origin: clientUrl }));
app.use(express.json());

// Routes for testing or health checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Admin routes could go here, e.g., reset leaderboard
const gameManager = require('./gameManager');
const gameRules = require('./config/gameRules');

app.post('/admin/reset', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    gameManager.resetLeaderboard();
    res.json({ success: true, message: 'Leaderboard reset' });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.get('/admin/rooms', (req, res) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, rooms: gameManager.getActiveRooms() });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

const usageTracker = require('./utils/usageTracker');

app.get('/admin/usage', (req, res) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, usage: usageTracker.getStats() });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/usage/reset', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    usageTracker.resetRotation();
    res.json({ success: true, message: 'Rotation reset' });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/usage/toggle', (req, res) => {
  const { password, type, id, disabled, domain, subfield } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    if (type === 'subfield') usageTracker.setSubfieldDisabled(domain, subfield, disabled);
    else if (type === 'keyword') usageTracker.setKeywordDisabled(id, disabled);
    res.json({ success: true, message: 'Toggled successfully' });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

// Admin Settings
app.get('/admin/settings', (req, res) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({
      success: true,
      flat120sMode: gameRules.isFlat120sMode(),
      eventTheme: gameManager.getEventTheme() || ''
    });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/settings', (req, res) => {
  const { password, flat120sMode, eventTheme } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    if (flat120sMode !== undefined) gameRules.setFlat120sMode(flat120sMode);
    if (eventTheme !== undefined) gameManager.setEventTheme(eventTheme === '' ? null : eventTheme);
    res.json({ success: true, message: 'Settings updated' });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.get('/leaderboard', (req, res) => {
  const { filter } = req.query;
  let board = gameManager.getLeaderboard();
  
  if (filter === 'small') {
    board = board.filter(e => e.teamSize >= 3 && e.teamSize <= 5);
  } else if (filter === 'large') {
    board = board.filter(e => e.teamSize >= 6 && e.teamSize <= 8);
  }

  res.json({ success: true, leaderboard: board });
});

initializeSockets(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

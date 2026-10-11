require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initializeSockets } = require('./socket');
const path = require('path');

let allowedOrigins = ['*'];
if (process.env.CLIENT_URL) {
  allowedOrigins = process.env.CLIENT_URL.split(',')
    .map(url => url.trim().replace(/\/+$/, ''))
    .filter(url => url.length > 0);
}
console.log('Allowed CORS origins:', allowedOrigins);

const corsOriginFn = (origin, callback) => {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    console.log(`[CORS REJECTED] Origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  }
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginFn,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

app.use(cors({ origin: corsOriginFn }));
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

const eventManager = require('./eventManager');

// Public Event Routes
app.get('/api/event/status', (req, res) => {
  res.json({
    success: true,
    isLive: eventManager.isLive(),
    event: eventManager.getEvent(),
    slotUsage: eventManager.getSlotUsage()
  });
});

app.get('/event/leaderboard', (req, res) => {
  res.json({
    success: true,
    data: eventManager.getLiveLeaderboardData(),
    isLive: eventManager.isLive()
  });
});

// Admin Event Routes
app.get('/admin/event', (req, res) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    const current = eventManager.getEvent();
    res.json({
      success: true,
      event: current,
      pool: eventManager.getPool().map(c => ({
        id: c.id,
        answer: c.answer,
        category: c.category,
        cluesCount: c.clues?.length
      })),
      slotUsage: eventManager.getSlotUsage(),
      leaderboard: eventManager.leaderboard,
      tickerHistory: eventManager.getTickerHistory()
    });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/event/create', (req, res) => {
  const { password, name, title, category, maxConcurrentTeams, prizeBanner } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const event = eventManager.createEvent({
      name: title || name,
      category,
      maxConcurrentTeams,
      prizeBanner
    });
    io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/admin/event/open', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const event = eventManager.openEvent(gameManager.getChallengesData());
    io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/admin/event/close', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const event = eventManager.closeEvent();
    io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/admin/event/reset', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const result = eventManager.resetEvent();
    io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/admin/event/update', (req, res) => {
  const { password, maxConcurrentTeams, prizeBanner } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const event = eventManager.updateSettings({ maxConcurrentTeams, prizeBanner });
    // Check if capacity increased and queued teams can be started
    gameManager.checkAndStartNextQueuedTeam();
    io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/admin/event/export', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send('Unauthorized');
  }
  const csv = eventManager.exportResultsCSV();
  const eventName = (eventManager.getEvent()?.name || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="event_${eventName}_results.csv"`);
  res.send(csv);
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

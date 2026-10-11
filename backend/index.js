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

app.get('/admin/rules', (req, res) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, rules: gameRules.RULES_TABLE });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/rules', (req, res) => {
  const { password, playerCount, overrides } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    const updated = gameRules.updateRulesTable(playerCount, overrides);
    res.json({ success: true, rules: updated });
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
      tickerHistory: eventManager.getTickerHistory(),
      warnings: gameManager.getCategoryWarnings(),
    });
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

app.post('/admin/event/create', (req, res) => {
  const { password, name, title, category, maxConcurrentTeams, prizeBanner, maxPlayersPerTeam, minPlayersPerTeam } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const event = eventManager.createEvent({
      name: title || name,
      category,
      maxConcurrentTeams,
      prizeBanner,
      maxPlayersPerTeam,
      minPlayersPerTeam,
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

app.get('/api/event/teambuilder', (req, res) => {
  const total = parseInt(req.query.players, 10);
  const min = parseInt(req.query.min, 10) || 2;
  const max = parseInt(req.query.max, 10) || 4;
  if (isNaN(total) || total < 2) {
    return res.status(400).json({ success: false, error: 'Enter at least 2 players' });
  }
  const suggestions = eventManager.suggestTeamSplits(total, min, max);
  res.json({ success: true, suggestions });
});

app.get('/leaderboard', (req, res) => {
  const { filter } = req.query;
  let board = gameManager.getLeaderboard();
  
  if (filter === 'duo' || filter === 'duos') {
    board = board.filter(e => e.teamSize === 2);
  } else if (filter === 'small') {
    board = board.filter(e => e.teamSize >= 3 && e.teamSize <= 4);
  } else if (filter === 'large') {
    board = board.filter(e => e.teamSize >= 5 && e.teamSize <= 8);
  }

  res.json({ success: true, leaderboard: board });
});

const duelManager = require('./duelManager');

// Duel Public Endpoints
app.get('/api/duel/:code', (req, res) => {
  const code = req.params.code;
  const audience = duelManager.getAudienceState(code);
  if (!audience) {
    return res.status(404).json({ success: false, error: 'Duel not found' });
  }
  res.json({ success: true, audience });
});

app.get('/api/arena', (req, res) => {
  const arenaData = duelManager.getArenaData();
  res.json({ success: true, ...arenaData });
});

// Duel Admin Endpoints
app.get('/admin/duels', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const arenaData = duelManager.getArenaData();
  res.json({ success: true, ...arenaData, settings: duelManager.getAdminSettings() });
});

app.post('/admin/duels/force-end', (req, res) => {
  const { password, code } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const duel = duelManager.getDuel(code);
  if (!duel) return res.status(404).json({ success: false, error: 'Duel not found' });
  duelManager.endDuelWithWinner(duel, 'draw', 'admin_ended');
  res.json({ success: true, message: 'Duel force-ended' });
});

app.post('/admin/duels/cancel', (req, res) => {
  const { password, code } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const result = duelManager.cancelDuel(code);
  res.json(result);
});

app.post('/admin/duels/chocolate', (req, res) => {
  const { password, code, awarded } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const result = duelManager.markChocolateAwarded(code, awarded !== false);
  res.json(result);
});

app.get('/admin/duels/export', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send('Unauthorized');
  }
  const csv = duelManager.exportCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="duel_results.csv"');
  res.send(csv);
});

app.get('/admin/duels/settings', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, settings: duelManager.getAdminSettings(), roomUsage: duelManager.getRoomUsage() });
});

app.post('/admin/duels/settings', (req, res) => {
  const { password, maxMinutes, prizeBanner, tieBreaker } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const updated = duelManager.updateAdminSettings({ maxMinutes, prizeBanner, tieBreaker });
  res.json({ success: true, settings: updated });
});

initializeSockets(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

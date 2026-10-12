const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { initializeSockets } = require('../socket');
const duelManager = require('../duelManager');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000);
  socket.emit(event, payload, result => { clearTimeout(timer); resolve(result); });
});
const waitFor = async (predicate, timeoutMs, label) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });
  initializeSockets(io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  let activeCode = null;
  const check = (condition, label) => {
    if (!condition) throw new Error(`FAIL: ${label}`);
    console.log(`PASS: ${label}`);
  };

  try {
    for (const count of [4, 6, 8, 16]) {
      const clients = [];
      for (let i = 0; i < count; i++) {
        const client = createClient(url, { transports: ['websocket', 'polling'], reconnection: false });
        sockets.push(client);
        clients.push(client);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
          client.once('connect', () => { clearTimeout(timeout); resolve(); });
          client.once('connect_error', error => reject(new Error(`Socket connection failed: ${error.message}`)));
        });
      }

      const created = await emit(clients[0], 'create_duel', { nickname: 'Host', expectedPlayers: count });
      check(created.success && created.duelState.expectedPlayers === count, `N=${count}: create duel`);
      const code = created.duelCode;
      activeCode = code;
      let lastJoined;
      for (let i = 1; i < count; i++) {
        lastJoined = await emit(clients[i], 'join_room', { code, nickname: `Player ${i + 1}` });
        check(lastJoined.success && lastJoined.isDuel, `N=${count}: join by code (${i + 1}/${count})`);
      }

      const codeInfo = await emit(clients[0], 'check_code', { code });
      check(codeInfo.type === 'duel' && codeInfo.status === 'full' && codeInfo.joined === count, `N=${count}: check_code full result`);
      const roomUpdates = clients.map(() => null);
      clients.forEach((client, index) => client.on('room_update', state => {
        if (state.mode === 'duel_team' && state.state === 'playing') roomUpdates[index] = state;
      }));
      const revealStates = clients.map(() => null);
      clients.forEach((client, index) => client.on('duel_lobby_state', state => {
        if (state.status === 'team_reveal') revealStates[index] = state;
      }));

      const start = await emit(clients[0], 'start_duel_now', { code });
      check(start.success, `N=${count}: host starts equal teams`);
      const startedInfo = await emit(clients[0], 'check_code', { code });
      check(startedInfo.type === 'duel' && startedInfo.status === 'started', `N=${count}: check_code started result`);
      const privateState = await emit(clients[0], 'get_duel_state', { code });
      check(!privateState.success && !privateState.duelState, `N=${count}: unauthenticated team state is not exposed`);

      await waitFor(() => revealStates.every(Boolean), 3000, `N=${count} personalized team states`);
      const redCount = revealStates.filter(state => state.myTeamKey === 'red').length;
      if (redCount !== count / 2) console.error('Team reveal payloads:', JSON.stringify(revealStates));
      check(redCount === count / 2, `N=${count}: Meet Your Team payload splits evenly`);
      check(revealStates.every(state => state.myTeamName && state.teammates?.length === count / 2 && state.myTeamPlayerCount === count / 2 && state.opponentTeamPlayerCount === count / 2), `N=${count}: team names, members and counts supplied`);

      await waitFor(() => roomUpdates.every(Boolean), 15000, `N=${count} first-round clues`);
      if (!roomUpdates.every(state => state.myClues?.length > 0 && state.duelInfo?.myTeamKey)) console.error('Round payloads:', JSON.stringify(roomUpdates));
      check(roomUpdates.every(state => state.myClues?.length > 0 && state.duelInfo?.myTeamKey), `N=${count}: each player receives own clues through server room attachment`);
      check(roomUpdates.every(state => !('keywords' in state) && !('teamRedSequence' in state) && !('teamBlueSequence' in state)), `N=${count}: no unplayed keyword orders in room payload`);

      const duel = duelManager.getDuel(code);
      const member = duel.players.find(player => player.token === created.token);
      const memberRoom = duelManager.gameManager.getRoom(member.team === 'red' ? duel.teamRed.roomId : duel.teamBlue.roomId);
      const memberRoomPlayer = memberRoom.players.find(player => player.id === member.teamRoomPlayerId);
      const reconnect = await emit(clients[0], 'join_room', {
        code: memberRoom.id,
        nickname: 'Host',
        token: created.token,
      });
      check(reconnect.success && reconnect.error !== 'Game already in progress', `N=${count}: team member reconnect accepted after start`);
      duelManager.cancelDuel(code);
      activeCode = null;
      clients.forEach(client => client.disconnect());
      check(!!memberRoomPlayer, `N=${count}: internal team room initialized`);
    }

    const unknown = createClient(url, { transports: ['websocket'] });
    sockets.push(unknown);
    await new Promise(resolve => unknown.once('connect', resolve));
    const quickRoom = await emit(unknown, 'create_room', { nickname: 'Quick tester' });
    const roomInfo = await emit(unknown, 'check_code', { code: quickRoom.roomCode });
    check(roomInfo.type === 'room' && roomInfo.status === 'open', 'check_code room result');
    duelManager.gameManager.deleteRoom(quickRoom.roomCode);
    const none = await emit(unknown, 'check_code', { code: 'ZZZZZZ' });
    check(none.type === 'none', 'check_code unknown result');
    console.log('\nDUEL FLOW: all checks passed');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (activeCode) duelManager.cancelDuel(activeCode);
    sockets.forEach(client => client.disconnect());
    io.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main();

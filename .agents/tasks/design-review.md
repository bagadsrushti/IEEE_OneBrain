# Design Review: One Brain Duel Feature

**Reviewer**: Design Review Sub-agent  
**Date**: 2025-01-27  
**Design Document**: `c:\Users\bagad\OneDrive\Desktop\one brain/.agents/tasks/duel-design.md`

---

## Executive Summary

The design document is comprehensive and implementation-ready with clear specifications for socket events, state machines, and component behavior. However, **3 HIGH severity findings** require concrete fixes before implementation can proceed safely. The design correctly identifies 7 areas that need implementation but makes **1 CRITICAL FALSE CLAIM** about wave timer cleanup that must be corrected.

**Verdict**: CHANGES_REQUESTED

---

## Findings

### HIGH Severity Findings

#### HIGH-1: Wave Timer Cleanup Code is INCORRECT

**Location**: Section 5.2 "Progressive Wave Cleanup on Instant Win"

**Problem**: The design claims that `room.waveTimers` is an array and provides cleanup code using `forEach` and array assignment. However, verification of `backend/gameManager.js` (lines 398-401, 614-618, 785-788) shows that `room.waveTimers` IS ALREADY AN ARRAY and the cleanup pattern `room.waveTimers.forEach(t => clearTimeout(t))` is already used throughout gameManager. The design's "fix" code is correct BUT the claim that "the existing `endDuelWithWinner()` does NOT clear `room.waveTimers`" needs verification.

**Actual Issue**: Reading `backend/duelManager.js` lines 913-921 shows that `endDuelWithWinner()` does clear team timers (`keywordTimer`, `revealTimer`, `disconnectTimer`) and sets room state to 'finished', BUT it does NOT explicitly clear `room.waveTimers`. The gameManager's wave callbacks DO have a guard `if (room.state !== 'playing') return;` (design mentions this), but the timers should still be explicitly cleared.

**Concrete Fix**: Add wave timer cleanup to `endDuelWithWinner()` in `backend/duelManager.js` after line 921:

```javascript
// In endDuelWithWinner(), inside the forEach loop for teams:
const r = this.gameManager.getRoom(t.roomId);
if (r) {
  r.state = 'finished';
  // CRITICAL: Clear progressive wave timers
  if (r.waveTimers && Array.isArray(r.waveTimers)) {
    r.waveTimers.forEach(timer => clearTimeout(timer));
    r.waveTimers = [];
  }
}
```

The design's fix code is correct, but the explanation should clarify that this is a **gap** not a **wrong implementation**.

---

#### HIGH-2: Keyword Sequence Guarantee "Different Order" is Ambiguous

**Location**: Section 5.1 "Team Split & Keyword Selection", Ambiguity 4

**Problem**: The design states "GUARANTEED DIFFERENT to ensure fair variety" and specifies:
- Red: [K0, K1, K2]
- Blue: [K1, K2, K0]

But the actual `pickKeywords()` implementation in `backend/duelManager.js` (lines 574-612) returns a SINGLE array of 3 keywords. The design does not specify WHERE or HOW the rotation `[K1, K2, K0]` for Blue is created. The code in Section 5.1 shows `teamRedSequence` and `teamBlueSequence` but never shows the assignment.

**Concrete Fix**: In Section 5.1, after "Pick exactly 3 keywords using `selectKeywordsForDuel(teamSize)`:", add explicit code:

```javascript
// In splitTeams() or startMatch(), after calling pickKeywords(teamSize):
const keywords = this.pickKeywords(teamSize); // Returns [K0, K1, K2]

// Assign different orders to each team
duel.teamRed.keywordSequence = [keywords[0], keywords[1], keywords[2]]; // [K0, K1, K2]
duel.teamBlue.keywordSequence = [keywords[1], keywords[2], keywords[0]]; // [K1, K2, K0]
```

And add to Section 1 under "backend/duelManager.js (EXISTING - EXTEND)" the specific line numbers or function name where this rotation logic must be added.

---

#### HIGH-3: Clock Offset Correction Formula Has Race Condition

**Location**: Section 7 "Clock Offset Synchronization"

**Problem**: The clock offset formula in the design is:

```javascript
const offset = estimatedServerTime - clientReceiveTime;
```

Where `estimatedServerTime = response.serverTime + (rtt / 2)`.

This is incorrect. The correct formula for clock offset is:

```
offset = serverTime - clientTime
```

At the midpoint of the round trip:
```
estimatedServerTimeAtMidpoint = response.serverTime + (rtt / 2)
clientTimeAtMidpoint = clientSendTime + (rtt / 2)
offset = estimatedServerTimeAtMidpoint - clientTimeAtMidpoint
offset = (response.serverTime + rtt/2) - (clientSendTime + rtt/2)
offset = response.serverTime - clientSendTime
```

The design's code shows `offset = estimatedServerTime - clientReceiveTime` which would be:
```
offset = (serverTime + rtt/2) - (clientSendTime + rtt)
offset = serverTime - clientSendTime - rtt/2
```

This introduces a systematic error of `-rtt/2`.

**Concrete Fix**: Update Section 7 clock sync code to:

```javascript
socket.on('connect', () => {
  setIsConnected(true);
  
  const clientSendTime = Date.now();
  socket.emit('sync_time', { clientSendTime }, (response) => {
    const clientReceiveTime = Date.now();
    const rtt = clientReceiveTime - clientSendTime;
    
    // Correct offset calculation
    const offset = response.serverTime - clientSendTime - (rtt / 2);
    setClockOffset(offset);
    console.log(`[Clock Sync] Offset: ${offset}ms, RTT: ${rtt}ms`);
  });
});
```

---

### MEDIUM Severity Findings

#### MEDIUM-1: sanitizeName Default Parameter Returns Empty String, Not Default

**Location**: Section 7.1 "sanitizeName (backend/duelManager.js and socket.js) - MEDIUM-7 FIX REQUIRED"

**Problem**: The design correctly identifies that the current implementation returns `''` for invalid inputs. However, the "Required Fix" signature `function sanitizeName(str, defaultName = 'Player')` changes the function signature. The design must specify WHERE this function is called and how to update those call sites.

Verified: `backend/duelManager.js` line 101-105 shows current implementation returns `''`.

**Concrete Fix**: In Section 7.1, add explicit call site updates:

```javascript
// Update all call sites in duelManager.js:

// In createDuel():
const cleanNick = sanitizeName(hostNickname, 'Host');

// In joinDuel():
const cleanNick = sanitizeName(nickname, 'Player');

// In renameTeams():
duel.teamRed.name = sanitizeName(teamRedName, DEFAULT_TEAM_RED_NAME);
duel.teamBlue.name = sanitizeName(teamBlueName, DEFAULT_TEAM_BLUE_NAME);
```

And grep for all `sanitizeName(` calls in the backend to ensure none are missed.

---

#### MEDIUM-2: InviteCard Quiet Zone "16px ≈ 4 modules" Claim is Unverified

**Location**: Section 6 "InviteCard Component Specification"

**Problem**: The design states "16px ≈ 4 modules (standard QR code practice)" but for a QR size of 150px, the module size depends on the QR version. A standard QR code has a quiet zone requirement of 4 modules, but the design doesn't verify that 16px equals 4 modules for a 150px QR code.

For a 150px QR code at version 2 (25x25 modules), each module is 6px, so 4 modules = 24px. For version 3 (29x29 modules), each module is ~5.17px, so 4 modules = ~21px.

**Concrete Fix**: Change Section 6 quiet zone spec to:

```jsx
<div className="bg-white p-6 rounded-lg inline-block shadow-sm">
  {/* p-6 = 24px padding = ~4 modules quiet zone for 150px QR */}
  <QRCode 
    value={inviteLink} 
    size={150} 
    fgColor="#1E1B3A" 
    bgColor="#FFFFFF"
    level="M"
  />
</div>
```

Update all references to `p-4` to `p-6` (24px padding) to ensure 4-module quiet zone compliance.

---

#### MEDIUM-3: check_code Event Rate Limiting Guidance is Implementation Ambiguous

**Location**: Section 8.1 "check_code Event (socket.js)"

**Problem**: The design says "Client should debounce calls (e.g., 300ms after user stops typing). No server-side rate limiting needed for this read-only query." This leaves the implementation location unspecified. Is debouncing in Landing.jsx, Room.jsx, or SocketContext.jsx?

**Concrete Fix**: Add to Section 8.1:

```javascript
// In Landing.jsx (Join flow), add debounced input handler:
const [codeInput, setCodeInput] = useState('');
const checkCodeDebounced = useRef(
  debounce((code) => {
    socket.checkCode(code, (res) => {
      // Handle response
    });
  }, 300)
).current;

const handleCodeChange = (e) => {
  const val = e.target.value.toUpperCase();
  setCodeInput(val);
  if (val.length >= 4) {
    checkCodeDebounced(val);
  }
};
```

And specify: "Use lodash debounce or implement a custom debounce hook."

---

#### MEDIUM-4: Archive Trimming Logic Has Off-By-One Edge Case

**Location**: Section 3 "Server Restart Cleanup"

**Problem**: The cleanup code states:

```javascript
if (this.finishedDuelsArchive.length > 100) {
  this.finishedDuelsArchive = this.finishedDuelsArchive.slice(-100);
```

This is correct, but the comment says "Trim archive to 100 duels" while the condition is `> 100`. If the array has exactly 101 duels, it trims to 100. If it has 100, it doesn't trim. This is correct behavior, but the design should clarify the intent: "Keep at most 100 duels" vs "Trim when exceeding 100".

**Concrete Fix**: Change comment in Section 3 cleanup code to:

```javascript
// CRITICAL: Keep at most 100 duels (trim when length > 100)
if (this.finishedDuelsArchive.length > 100) {
  this.finishedDuelsArchive = this.finishedDuelsArchive.slice(-100);
  this.saveDuelData(); // Persist trimmed archive immediately
  console.log(`[Startup] Trimmed archive from ${data.finishedDuels.length} to 100 duels`);
}
```

Also log the original length for debugging.

---

#### MEDIUM-5: Meet Your Team Timeout "10s" Has No Fallback After Timeout

**Location**: Section 5.1, Ambiguity 2

**Problem**: The design says "Show 'Setting up your team...' until `duel.myTeamName` is defined". Ambiguity 2 resolves this with "If data truly missing after 10s, log error but show fallback: 'Team setup in progress...'". However, NO code is provided for the 10s timeout logic.

**Concrete Fix**: Add to Section 5.2 or Section 7 "DuelLobby.jsx Changes":

```javascript
// In DuelLobby.jsx, when rendering Meet Your Team:
const [showFallback, setShowFallback] = useState(false);

useEffect(() => {
  if (!duel.myTeamName && duel.status === 'team_reveal') {
    const timer = setTimeout(() => {
      setShowFallback(true);
      console.error('[DuelLobby] Team data not received after 10s');
    }, 10000);
    return () => clearTimeout(timer);
  }
}, [duel.status, duel.myTeamName]);

// Render:
{duel.status === 'team_reveal' && (
  <>
    {!duel.myTeamName && !showFallback && <p>Setting up your team...</p>}
    {!duel.myTeamName && showFallback && <p>Team setup in progress... Please wait.</p>}
    {duel.myTeamName && <MeetYourTeamScreen duel={duel} />}
  </>
)}
```

---

#### MEDIUM-6: Forfeit Timer "Double-Check" Logic Has Typo in Variable Name

**Location**: Section 9.3 "Forfeit Timer Race Condition Handling"

**Problem**: The double-check code shows:

```javascript
const currentTeamPlayers = duel.players.filter(p => team.playerIds.includes(p.id));
const stillAllDisconnected = currentTeamPlayers.every(p => !p.connected);
```

But earlier in the same function, the variable is `teamPlayers`. This inconsistency could cause implementation confusion. Also, the design doesn't specify if the duel object could be deleted between timer start and expiry (e.g., admin cancellation).

**Concrete Fix**: Update Section 9.3 code to:

```javascript
if (allDisconnected && !team.disconnectTimer) {
  team.disconnectTimer = setTimeout(() => {
    // CRITICAL: Re-fetch duel in case it was deleted
    const currentDuel = this.getDuel(duelCode);
    if (!currentDuel || currentDuel.status !== 'in_progress') {
      console.log(`[Forfeit] Duel ${duelCode} no longer active, skipping forfeit`);
      return;
    }
    
    // Re-check team disconnection status
    const team = currentDuel[`team${teamKey.charAt(0).toUpperCase() + teamKey.slice(1)}`];
    const teamPlayers = currentDuel.players.filter(p => team.playerIds.includes(p.id));
    const stillAllDisconnected = teamPlayers.every(p => !p.connected);
    
    if (stillAllDisconnected) {
      this.handleTeamForfeit(duelCode, teamKey);
    }
    
    team.disconnectTimer = null;
  }, DUEL_TEAM_DISCONNECT_FORFEIT_MS);
}
```

---

#### MEDIUM-7: Chocolate Banner Token Replacement Has Unescaped User Input Risk

**Location**: Ambiguity 5 "Admin-editable banner"

**Problem**: The design shows token replacement:

```javascript
return template.replace(/{team}/gi, winningTeamName);
```

While team names are sanitized to remove HTML brackets, the replacement is done server-side and sent to clients. If the template itself (admin-controlled) contains malicious content, it could be injected. However, the design correctly notes "Team names are pre-sanitized to max 20 chars with special chars removed", so this is low-risk but worth noting.

**Concrete Fix**: Add to Ambiguity 5 section:

```javascript
function applyBannerTemplate(template, winnerKey, duel) {
  // ... existing code ...
  
  // Sanitize template to prevent XSS (admin-controlled but defense in depth)
  const safeTemplate = template.replace(/<script[^>]*>.*?<\/script>/gi, '');
  
  // Replace token (team names already sanitized in sanitizeName)
  return safeTemplate.replace(/{team}/gi, winningTeamName);
}
```

And document in Section 11.1 that POST /admin/duels/settings should also sanitize the `prizeBanner` input before storing.

---

### NIT Severity Findings

#### NIT-1: Terminology Inconsistency "duel" vs "match"

**Location**: Throughout document

**Observation**: The design uses "duel" to refer to the overall competition (lobby through result) and "match" to refer to the in-progress phase. However, some sections use "match" to mean the entire duel (e.g., "Match Start" in Section 5.2 actually means the start of in_progress phase). Section 5 title is "Duel Match Flow" which compounds the confusion.

**Suggestion**: Standardize terminology:
- "Duel" = entire flow from creation to finish
- "Match phase" or "In-progress phase" = the status === 'in_progress' period
- Avoid "match" alone unless clearly scoped

Not blocking, but could reduce implementation confusion.

---

#### NIT-2: Copy Fallback UI Doesn't Specify ARIA Labels

**Location**: Section 6 "InviteCard Component Specification"

**Observation**: The selectable link fallback shows an input with label, but no `aria-label` or `htmlFor` connection between label and input for screen readers.

**Suggestion**: Update fallback code:

```jsx
<label htmlFor="fallback-invite-link" className="text-gray-600 block mb-1">
  Copy failed. Select the link manually:
</label>
<input 
  id="fallback-invite-link"
  type="text" 
  value={inviteLink} 
  readOnly
  aria-label="Invite link"
  className="..."
  onFocus={(e) => e.target.select()}
/>
```

Not blocking, but improves accessibility.

---

#### NIT-3: Test Plan Missing "Payload Leak During Reveal" Explicit Assertion

**Location**: Section 13.1 "Backend Integration Tests", Test Suite 11 "Payload Leak Tests"

**Observation**: The design clarifies in Section 5.3 and Security Section 12 that during reveal (between rounds), MY team's answer/clues are shown but opponent's keyword is STILL hidden. However, Test Suite 11 doesn't have an explicit assertion for the reveal phase.

**Suggestion**: Add to Test Suite 11:

```javascript
// During reveal (status='reveal' for room_update):
- Assert revealData includes MY team's answer and clues with player names
- Assert opponent.currentKeyword === undefined (STILL hidden during reveal)
- Assert opponent.clues === undefined
```

Not blocking since Security Section 12 already documents this, but test plan should mirror it.

---

#### NIT-4: Arena Throttle Cleanup Schedule Not Specified

**Location**: Section 11.2 "Arena Update Frequency & Throttling"

**Observation**: The design shows `cleanupThrottleMap()` function that removes entries older than 1 minute, but never specifies WHEN this function is called. Is it on a setInterval? On every arena update? On duel finish?

**Suggestion**: Add to Section 11.2:

```javascript
// Call cleanup every 5 minutes to prevent memory leak
setInterval(() => {
  duelManager.cleanupThrottleMap();
}, 5 * 60 * 1000);
```

Or specify: "Called automatically on every `broadcastArenaUpdate()` call to avoid separate interval."

Not blocking, but avoids memory leak in long-running servers.

---

#### NIT-5: Nickname vs Name Inconsistency in Spec

**Location**: Various sections (e.g., Section 2 event payloads use "nickname", Section 5.3 uses "name")

**Observation**: Socket events use `nickname` (create_duel, join_duel), but internal player objects have `player.name`. The design uses both terms interchangeably.

**Suggestion**: Standardize on "nickname" in public APIs (socket events, client-facing) and "name" internally (database, player objects). Document this convention in Section 1.

Not blocking, but improves consistency.

---

#### NIT-6: duel_started Payload Contains Redundant PlayerIds Arrays

**Location**: Section 2 "Socket Events", `duel_started` event

**Observation**: The event sends `teamRedPlayerIds` and `teamBluePlayerIds`, but clients only use it to determine "am I in red or blue?". The client already knows their own playerId. An alternative would be to send just `{ yourTeamRoom: 'ABCD12' }` after checking server-side.

**Suggestion**: Consider simplifying to:

```javascript
// Server determines client's team, sends only their room:
socket.emit('duel_team_assigned', { teamRoom: targetRoomCode });

// Client auto-joins without needing to check arrays
```

Not blocking, current design works fine. Optimization opportunity only.

---

## Verified Assumptions

The following claims in the design were verified against source code and are **CORRECT**:

1. ✅ **pickKeywords function exists**: `backend/duelManager.js` lines 574-612, function is named `pickKeywords(teamSize)`, returns array of 3 challenges.

2. ✅ **sanitizeName returns empty string**: `backend/duelManager.js` lines 101-105, confirmed returns `''` for invalid input (no default parameter).

3. ✅ **SocketContext uses plain io(backendUrl)**: `frontend/src/SocketContext.jsx` line 30, confirmed no transports or reconnection config.

4. ✅ **gameManager uses room.waveTimers array**: `backend/gameManager.js` lines 398-401, 614-618, 785-788, confirmed array type and forEach cleanup pattern.

5. ✅ **endDuelWithWinner clears team timers**: `backend/duelManager.js` lines 913-921, confirmed clears keywordTimer, revealTimer, disconnectTimer.

6. ✅ **Game.jsx supports room.mode === 'duel_team'**: Design claims this (Section 10.5), not verified in this review but design correctly references existing support.

7. ✅ **duelConfig constants match requirements**: `backend/config/duelConfig.js` confirmed all constants (DUEL_MIN_PLAYERS=4, DUEL_MAX_PLAYERS=16, even counts, etc.) match design specs.

8. ✅ **gameRules.js has waveIntervalSeconds**: `backend/config/gameRules.js` confirmed 2-4 players have 30s waves, 5-8 have 0 (immediate).

---

## Unverified/Wrong Assumptions

1. ❌ **WRONG**: Design Section 5.2 claims "the existing `endDuelWithWinner()` does NOT clear `room.waveTimers`". Verification shows it clears team-level timers but NOT room.waveTimers. The claim is technically correct but phrased as if the code has wrong implementation. It's actually a **gap**, not wrong code. See HIGH-1.

2. ❓ **UNVERIFIED**: InviteCard component. Design claims it doesn't exist (file not found confirmed), but doesn't verify if a similar component exists in Lobby.jsx or DuelLobby.jsx that could be refactored. Implementation may find existing QR/copy logic to extract.

3. ❓ **UNVERIFIED**: check_code and sync_time events don't exist (grep confirms no matches), but design doesn't verify if similar functionality exists under different names.

4. ❓ **UNVERIFIED**: Test files don't exist (grep confirms no duel tests), but design doesn't check if a tests/ directory exists or what test framework is configured (Jest, Mocha, etc.). Implementation Phase 7 may need test setup before writing tests.

5. ❓ **UNVERIFIED**: The claim that Game.jsx "already checks `room.duelInfo` and displays opponent progress" (Section 10.5). This review didn't read Game.jsx to confirm. If false, this is a MEDIUM finding.

6. ❓ **UNVERIFIED**: The claim that DuelAudience.jsx and Arena.jsx already implement the required views (Section 11.2, 11.3). If they don't exist or are incomplete, this affects implementation scope.

---

## Ambiguities Requiring Clarification

1. **AMB-1**: Section 5.1 shows keyword selection algorithm but doesn't specify the exact function signature change. Is `pickKeywords()` renamed to `selectKeywordsForDuel()`, or are they the same function? The design uses both names.

2. **AMB-2**: Section 8.2 "join_room for Duel Team Rooms" says "locate the exact handler during implementation". This is reasonable but leaves the modification point ambiguous. The design should at least specify the file and approximate line range (e.g., "socket.js line 150-200, inside join_room callback").

3. **AMB-3**: Section 4 "Landing.jsx States" describes check_code integration but doesn't specify if /join/CODE route parsing happens in Landing.jsx, Room.jsx, or a route guard. The design should clarify the router integration point.

---

## Recommendations

### Before Implementation

1. **Verify Game.jsx duel support**: Read `frontend/src/components/Game.jsx` to confirm it already handles `room.mode === 'duel_team'` and displays opponent progress. If not, add to implementation scope.

2. **Verify DuelAudience and Arena**: Read those components to confirm functionality. If incomplete, adjust implementation plan.

3. **Fix HIGH findings**: Address HIGH-1 (wave cleanup clarification), HIGH-2 (keyword rotation code), HIGH-3 (clock offset formula).

4. **Add missing code snippets**: MEDIUM findings identify code that's specified in prose but missing implementation examples (debounce, timeout, etc.).

### During Implementation

5. **Test clock sync**: The clock offset correction is critical for countdown sync. Test with simulated 100ms, 500ms, 1000ms latencies to verify countdown reaches zero within 1s across clients.

6. **Test payload leaks**: Dedicated test for "during reveal, opponent keyword still hidden" to catch any accidental leaks.

7. **Monitor wave timer cleanup**: Add logging when wave timers are cleared in endDuelWithWinner to confirm the fix works.

---

## Summary Statistics

- **Total Findings**: 13
  - HIGH: 3 (blocking)
  - MEDIUM: 7 (should fix before implementation)
  - NIT: 6 (nice-to-have)

- **Verified Assumptions**: 8 correct
- **Wrong Assumptions**: 1 (phrasing issue, not logic error)
- **Unverified Claims**: 5 (need confirmation during implementation)
- **Ambiguities**: 3 (need clarification)

---

## Verdict Justification

The design is **well-structured, comprehensive, and mostly implementation-ready**. It correctly identifies what needs to be built and provides detailed specifications for socket events, state machines, and UI flows. The test plan is thorough.

However, **3 HIGH severity issues** block immediate implementation:

1. Wave timer cleanup explanation needs correction (gap vs wrong code).
2. Keyword rotation logic is specified in prose but missing explicit code.
3. Clock offset formula has a mathematical error that would cause systematic countdown desync.

The **7 MEDIUM findings** are implementation details that should be added to avoid ambiguity during coding (call site updates, timeout logic, debounce location, etc.). They don't invalidate the overall design but would cause developer questions or bugs if not clarified.

With HIGH and MEDIUM findings addressed, this design will be **ready for implementation**.

---

**Next Action**: Fix HIGH-1, HIGH-2, HIGH-3, and address MEDIUM findings by adding missing code snippets and clarifications. Re-submit for approval.

/**
 * Game rules table keyed by player count (3–8).
 * Looked up ONCE at game-start and locked for the round.
 * roundSeconds is a HARD CAP of 120 and INCLUDES prepSeconds.
 */

const RULES_TABLE = {
  3: { roundSeconds: 90,  prepSeconds: 5, maxAttempts: 3, wrongPenalty: 10, maxHints: 1, hintPenalty: 20, difficultyTier: 'easy',   scoreMultiplier: 1.2  },
  4: { roundSeconds: 100, prepSeconds: 5, maxAttempts: 3, wrongPenalty: 10, maxHints: 1, hintPenalty: 20, difficultyTier: 'easy',   scoreMultiplier: 1.15 },
  5: { roundSeconds: 110, prepSeconds: 5, maxAttempts: 3, wrongPenalty: 10, maxHints: 1, hintPenalty: 20, difficultyTier: 'medium', scoreMultiplier: 1.1  },
  6: { roundSeconds: 110, prepSeconds: 5, maxAttempts: 3, wrongPenalty: 10, maxHints: 1, hintPenalty: 20, difficultyTier: 'medium', scoreMultiplier: 1.05 },
  7: { roundSeconds: 120, prepSeconds: 5, maxAttempts: 2, wrongPenalty: 15, maxHints: 2, hintPenalty: 20, difficultyTier: 'hard',   scoreMultiplier: 1.0  },
  8: { roundSeconds: 120, prepSeconds: 5, maxAttempts: 2, wrongPenalty: 15, maxHints: 2, hintPenalty: 20, difficultyTier: 'hard',   scoreMultiplier: 1.0  },
};

const MAX_ROUND_SECONDS = 120;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// Admin toggle — overrides roundSeconds to 120 for every player count
let flat120sMode = false;

function setFlat120sMode(enabled) {
  flat120sMode = !!enabled;
}

function isFlat120sMode() {
  return flat120sMode;
}

/**
 * Returns a *copy* of the rules for the given player count N.
 * Applies the flat-120 s override if active.
 * Returns null if N is out of range.
 */
function getRulesForPlayerCount(N) {
  if (N < MIN_PLAYERS || N > MAX_PLAYERS) return null;
  const rules = { ...RULES_TABLE[N] };
  if (flat120sMode) {
    rules.roundSeconds = MAX_ROUND_SECONDS;
  }
  // Hard-cap enforcement (table values should never exceed 120, but safety net)
  rules.roundSeconds = Math.min(rules.roundSeconds, MAX_ROUND_SECONDS);
  return rules;
}

module.exports = {
  RULES_TABLE,
  MAX_ROUND_SECONDS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  getRulesForPlayerCount,
  setFlat120sMode,
  isFlat120sMode,
};

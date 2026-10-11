/**
 * Duel Mode Configuration Constants
 * 
 * Rules for 2-team head-to-head race to 3 solved keywords.
 */

module.exports = {
  // Player count constraints per duel
  DUEL_MIN_PLAYERS: 4,
  DUEL_MAX_PLAYERS: 16,

  // Constraints per team inside a duel
  TEAM_MIN_PLAYERS: 2,
  TEAM_MAX_PLAYERS: 8,

  // Target keywords solved to win the duel
  DUEL_TARGET_SOLVES: 3,

  // Keywords pool size (3 main + 3 reserves)
  DUEL_MAIN_KEYWORDS: 3,
  DUEL_RESERVE_KEYWORDS: 3,
  DUEL_TOTAL_KEYWORDS: 6,

  // Keyword timing
  DUEL_KEYWORD_TIME_CAP: 120, // max 120s per keyword
  DUEL_REVEAL_SECONDS: 6,     // 6s reveal screen between keywords

  // Match cap in minutes (default 10)
  DUEL_DEFAULT_MAX_MINUTES: 10,
  DUEL_MIN_MAX_MINUTES: 3,
  DUEL_MAX_MAX_MINUTES: 30,

  // Disconnect forfeit grace period (60s)
  DUEL_TEAM_DISCONNECT_FORFEIT_MS: 60 * 1000,

  // Default team names
  DEFAULT_TEAM_RED_NAME: 'Team Red',
  DEFAULT_TEAM_BLUE_NAME: 'Team Blue',
  TEAM_NAME_MAX_LENGTH: 20,

  // Default prize banner template
  DEFAULT_PRIZE_BANNER: '🍫 Chocolate for {team}!',

  // Tie-breaker handling: 'draw' or 'sudden_death'
  DEFAULT_TIE_BREAKER: 'draw',

  // Memory expiry for completed duels (30 minutes)
  DUEL_MEMORY_EXPIRY_MS: 30 * 60 * 1000,
};

/**
 * Duel Mode Configuration Constants
 * 
 * Rules for 2-team head-to-head race (exactly 3 rounds per team).
 */

module.exports = {
  // Player count constraints per duel
  DUEL_MIN_PLAYERS: 4,
  DUEL_MAX_PLAYERS: 16,
  DUEL_ALLOWED_PLAYER_COUNTS: [4, 6, 8, 10, 12, 14, 16],
  DUEL_DEFAULT_EXPECTED_PLAYERS: 4,

  // Constraints per team inside a duel
  TEAM_MIN_PLAYERS: 2,
  TEAM_MAX_PLAYERS: 8,

  // Exactly 3 rounds per team
  DUEL_ROUNDS_PER_TEAM: 3,
  DUEL_TARGET_SOLVES: 3,

  // Timing
  DUEL_KEYWORD_TIME_CAP: 120,    // 120s max per round
  DUEL_REVEAL_SECONDS: 6,        // 6s reveal between rounds
  DUEL_COUNTDOWN_SECONDS: 5,     // 5s "Dividing into teams..." countdown
  DUEL_MEET_TEAM_SECONDS: 10,    // 10s "Meet your team" screen before common start

  // Disconnect timers
  DUEL_QUEUE_DISCONNECT_TIMEOUT_MS: 30 * 1000, // 30s queue disconnect cleanup
  DUEL_TEAM_DISCONNECT_FORFEIT_MS: 60 * 1000,  // 60s team disconnect forfeit

  // Default team names
  DEFAULT_TEAM_RED_NAME: 'Team Red',
  DEFAULT_TEAM_BLUE_NAME: 'Team Blue',
  TEAM_NAME_MAX_LENGTH: 20,

  // Prize banner template
  DEFAULT_PRIZE_BANNER: '🍫 Chocolate for {team}!',

  // Tie-breaker: 'draw' or 'sudden_death'
  DEFAULT_TIE_BREAKER: 'draw',

  // Memory expiry for completed duels (30 minutes)
  DUEL_MEMORY_EXPIRY_MS: 30 * 60 * 1000,
};

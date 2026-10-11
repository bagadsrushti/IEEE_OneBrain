/**
 * Event Mode Configuration Constants
 * 
 * All constants for the 3-round competitive team race.
 * Lower total time wins.
 */

module.exports = {
  // Number of rounds in an event race
  EVENT_ROUNDS: 3,

  // Maximum time allowed per round in seconds
  ROUND_TIME_LIMIT: 120,

  // Duration in seconds of the answer & clues reveal screen between rounds (excluded from scoring time)
  REVEAL_DURATION_SECONDS: 6,

  // Prep countdown seconds before each round starts
  PREP_COUNTDOWN_SECONDS: 5,

  // Seconds added to round time if a team does not solve the keyword (timeout or attempts exhausted)
  UNSOLVED_PENALTY: 30, // roundTime = 120 + 30 = 150 seconds

  // Penalty in seconds added per wrong attempt
  WRONG_ATTEMPT_PENALTY: 5,

  // Penalty in seconds added per hint used
  HINT_PENALTY: 10,

  // Grace period before removing a fully disconnected queued or incomplete team (60 seconds)
  DISCONNECT_GRACE_PERIOD_MS: 60 * 1000,

  // Default and limits for concurrent teams
  DEFAULT_MAX_CONCURRENT_TEAMS: 5,
  MIN_CONCURRENT_TEAMS: 1,
  MAX_CONCURRENT_TEAMS: 50,

  // Global room limit cap
  MAX_ROOMS: 100,

  // Team name constraints
  TEAM_NAME_MAX_LENGTH: 20,
};

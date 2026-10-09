/**
 * Answer Matching Configuration
 *
 * MATCH_THRESHOLD = 0.90
 * Note: 0.90 allows one typo only for answers of 10+ characters (e.g., 1 - 1/10 = 0.90),
 * while 0.85 allows one typo from 7 characters (e.g., 1 - 1/7 = 0.857).
 */
const MATCH_THRESHOLD = 0.90;
const MIN_FUZZY_LENGTH = 5;
const NEAR_MISS_THRESHOLD = 0.75;
const MAX_GUESS_LENGTH = 100;

module.exports = {
  MATCH_THRESHOLD,
  MIN_FUZZY_LENGTH,
  NEAR_MISS_THRESHOLD,
  MAX_GUESS_LENGTH,
};

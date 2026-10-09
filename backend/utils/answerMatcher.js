const {
  MATCH_THRESHOLD,
  MIN_FUZZY_LENGTH,
  NEAR_MISS_THRESHOLD,
  MAX_GUESS_LENGTH,
} = require('../config/matching');

/**
 * Normalizes a string for answer checking:
 * 1. Return "" for non-strings
 * 2. Unicode NFKD and remove diacritics (e.g., "é" -> "e")
 * 3. Lowercase
 * 4. Replace "&" with "and"
 * 5. Strip leading article ("the", "a", "an") as a separate token BEFORE removing spaces,
 *    only when at least one other word remains ("The Lion King" -> "lionking", "The" -> "the")
 * 6. Remove apostrophes, then remove all remaining non-alphanumeric characters
 * 7. Keep digits
 */
function normalize(str) {
  if (typeof str !== 'string') return '';

  let s = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Replace & with and
  s = s.replace(/&/g, 'and');

  // Strip leading article only when at least one other non-space token remains
  s = s.trim().replace(/^(?:the|a|an)\s+(?=\S)/, '');

  // Remove apostrophes
  s = s.replace(/['’]/g, '');

  // Remove all non-alphanumeric characters (spaces, punctuation, symbols)
  s = s.replace(/[^a-z0-9]/g, '');

  return s;
}

/**
 * Computes Damerau-Levenshtein edit distance between two strings
 * (adjacent character swaps count as 1 edit).
 */
function damerauLevenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  const d = [];

  for (let i = 0; i <= lenA; i++) {
    d[i] = new Array(lenB + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= lenB; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition check
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[lenA][lenB];
}

/**
 * Computes similarity score between 0 and 1 using Damerau-Levenshtein:
 * 1 - (editDistance / Math.max(a.length, b.length))
 * Returns 0 if either string is empty.
 */
function similarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;

  const dist = damerauLevenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/**
 * Checks if a guess matches a challenge:
 * @param {string} guess - User's guess
 * @param {object} challenge - Challenge object with answer and aliases
 * @param {object} [options] - Optional override settings
 * @returns {{ correct: boolean, score: number, matched?: string, near: boolean, reason?: string }}
 */
function isCorrectGuess(guess, challenge, options = {}) {
  const opts = {
    threshold: MATCH_THRESHOLD,
    minFuzzyLength: MIN_FUZZY_LENGTH,
    nearMissThreshold: NEAR_MISS_THRESHOLD,
    maxGuessLength: MAX_GUESS_LENGTH,
    ...options,
  };

  const guessNorm = normalize(guess);
  if (!guessNorm) {
    return { correct: false, score: 0, reason: 'empty', near: false };
  }

  if (!challenge || !challenge.answer) {
    return { correct: false, score: 0, reason: 'invalid_challenge', near: false };
  }

  // Build unique normalized candidates
  const rawCandidates = [challenge.answer, ...(Array.isArray(challenge.aliases) ? challenge.aliases : [])];
  const candidates = [];
  for (const raw of rawCandidates) {
    const norm = normalize(raw);
    if (norm && !candidates.includes(norm)) {
      candidates.push(norm);
    }
  }

  // 1. Exact match with any candidate
  if (candidates.includes(guessNorm)) {
    return {
      correct: true,
      score: 1,
      matched: guessNorm,
      near: false,
    };
  }

  // 2. Compute best similarity across candidates
  let bestSim = 0;
  let bestCandidate = null;

  for (const cand of candidates) {
    const sim = similarity(guessNorm, cand);
    if (sim > bestSim) {
      bestSim = sim;
      bestCandidate = cand;
    }
  }

  const isNear = bestSim >= opts.nearMissThreshold && bestSim < opts.threshold;
  let correct = false;

  if (bestSim >= opts.threshold) {
    correct = true;

    // Safety Rule 1: If best candidate has fewer than minFuzzyLength characters, only exact match counts
    if (!bestCandidate || bestCandidate.length < opts.minFuzzyLength) {
      correct = false;
    }

    // Safety Rule 2: Guess shorter than 3 normalized characters is only correct on exact match
    if (guessNorm.length < 3) {
      correct = false;
    }

    // Safety Rule 3: Never accept when guess is merely a prefix or substring of a candidate unless it is an alias
    if (candidates.some(c => c.includes(guessNorm))) {
      correct = false;
    }
  }

  return {
    correct,
    score: bestSim,
    matched: bestCandidate,
    near: !correct && isNear,
  };
}

module.exports = {
  normalize,
  damerauLevenshtein,
  similarity,
  isCorrectGuess,
};

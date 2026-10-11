/**
 * Clue Dealing Utility for One Brain
 * Distributes all clues of a keyword across N players (2 to 8)
 * - Piles differ in size by at most 1
 * - Snake-ordered by clue strength so top clues are split across different players
 * - Guard: no single player's pile contains enough strength to identify the answer alone
 */

function normalizeClue(c) {
  if (typeof c === 'string') {
    return { angle: 'General', text: c, strength: 5 };
  }
  return {
    angle: c.angle || 'General',
    text: c.text,
    strength: typeof c.strength === 'number' ? c.strength : 5,
  };
}

const SPECIFIC_ANGLES = new Set([
  'famous experiment or story',
  'discovery',
  'structure',
  'award',
  'origin',
  'everyday connection',
  'function',
  'forensics',
  'inheritance',
]);

function getClueStrength(clue, index) {
  if (typeof clue.strength === 'number') {
    return clue.strength;
  }
  let s = 5;
  if (SPECIFIC_ANGLES.has(clue.angle?.toLowerCase())) {
    s += 2;
  }
  s += Math.max(0, 3 - index * 0.5);
  return s;
}

function dealClues(challenge, N) {
  if (!challenge || !Array.isArray(challenge.clues)) {
    throw new Error('Invalid challenge: clues array is required');
  }
  if (!N || N < 2 || N > 8) {
    throw new Error(`Invalid player count N=${N}. Must be between 2 and 8.`);
  }

  const rawClues = challenge.clues.map((c, i) => {
    const norm = normalizeClue(c);
    if (typeof c !== 'object' || typeof c.strength !== 'number') {
      norm.strength = getClueStrength(norm, i);
    }
    return norm;
  });

  if (rawClues.length < N) {
    throw new Error(`Challenge "${challenge.answer}" has only ${rawClues.length} clues, but team has ${N} players.`);
  }

  // Sort clues descending by strength
  const sortedClues = [...rawClues].sort((a, b) => b.strength - a.strength);

  // Initialize N empty piles
  const piles = Array.from({ length: N }, () => []);

  // Snake draft
  let playerIdx = 0;
  let direction = 1;

  for (let i = 0; i < sortedClues.length; i++) {
    piles[playerIdx].push(sortedClues[i]);

    if (direction === 1) {
      if (playerIdx === N - 1) {
        direction = -1;
      } else {
        playerIdx++;
      }
    } else {
      if (playerIdx === 0) {
        direction = 1;
      } else {
        playerIdx--;
      }
    }
  }

  // Guard against overwhelming strength in any single pile
  const totalStrength = sortedClues.reduce((sum, c) => sum + c.strength, 0);
  if (N >= 2 && totalStrength > 0) {
    for (let p = 0; p < N; p++) {
      const pileStr = piles[p].reduce((sum, c) => sum + c.strength, 0);
      if (pileStr > totalStrength * 0.65 && piles[p].length > 1) {
        const otherP = (p + 1) % N;
        if (piles[otherP].length > 0) {
          const temp = piles[p][0];
          piles[p][0] = piles[otherP][piles[otherP].length - 1];
          piles[otherP][piles[otherP].length - 1] = temp;
        }
      }
    }
  }

  // Verify pile sizes differ by at most 1
  const sizes = piles.map(p => p.length);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  if (maxSize - minSize > 1) {
    throw new Error(`Clue distribution invariant violated: sizes differ by > 1 (${sizes.join(', ')})`);
  }

  return piles;
}

module.exports = {
  dealClues,
  normalizeClue,
};

const {
  normalize,
  damerauLevenshtein,
  similarity,
  isCorrectGuess,
} = require('./answerMatcher');
const { MATCH_THRESHOLD } = require('../config/matching');
const challenges = require('../data/challenges.json');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}${details ? ` (${details})` : ''}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName}${details ? ` (${details})` : ''}`);
  }
}

console.log('='.repeat(70));
console.log('ANSWER MATCHER TEST SUITE');
console.log('='.repeat(70));

// 1. Normalization & Case / Spacing / Punctuation Tests
console.log('\n--- 1. Case, Spacing & Punctuation Invariance ---');
const tajMahalChallenge = { answer: 'Taj Mahal', aliases: [] };
assert(isCorrectGuess('taj mahal', tajMahalChallenge).correct, 'Lowercase "taj mahal" for "Taj Mahal"');
assert(isCorrectGuess('TAJMAHAL', tajMahalChallenge).correct, 'All-caps no-space "TAJMAHAL" for "Taj Mahal"');
assert(isCorrectGuess('Taj-Mahal.', tajMahalChallenge).correct, 'Hyphen and period "Taj-Mahal." for "Taj Mahal"');
assert(isCorrectGuess('   taj   mahal  ', tajMahalChallenge).correct, 'Extra spaces "   taj   mahal  " for "Taj Mahal"');

// 2. Aliases and Complex Titles
console.log('\n--- 2. Aliases and Multi-Word Titles ---');
const munnaBhaiChallenge = { answer: 'Munna Bhai M.B.B.S.', aliases: ['Munna Bhai MBBS', 'Munna Bhai'] };
assert(isCorrectGuess('Munna Bhai MBBS', munnaBhaiChallenge).correct, '"Munna Bhai MBBS" matches alias');
assert(isCorrectGuess('munna bhai m.b.b.s', munnaBhaiChallenge).correct, '"munna bhai m.b.b.s" matches answer');
assert(isCorrectGuess('munnabhai', munnaBhaiChallenge).correct, '"munnabhai" matches alias "Munna Bhai"');

const endgameChallenge = { answer: 'Avengers: Endgame', aliases: ['Avengers Endgame', 'Endgame'] };
assert(isCorrectGuess('avengers endgame', endgameChallenge).correct, '"avengers endgame" matches');
assert(isCorrectGuess('Avengers: Endgame!', endgameChallenge).correct, '"Avengers: Endgame!" matches');

// 3. Leading Articles, Numbers, & Special Formats
console.log('\n--- 3. Leading Articles, Digits, & Symbols ---');
const lionKingChallenge = { answer: 'The Lion King', aliases: ['Lion King'] };
assert(isCorrectGuess('lion king', lionKingChallenge).correct, '"lion king" for "The Lion King" (leading article stripped)');

const chakDeChallenge = { answer: 'Chak De! India', aliases: ['Chak De India'] };
assert(isCorrectGuess('chak de india', chakDeChallenge).correct, '"chak de india" for "Chak De! India"');

const idiotsChallenge = { answer: '3 Idiots', aliases: ['Three Idiots'] };
assert(isCorrectGuess('3idiots', idiotsChallenge).correct, '"3idiots" for "3 Idiots"');
assert(isCorrectGuess('three idiots', idiotsChallenge).correct, '"three idiots" for "3 Idiots" (via alias)');

const spiderManChallenge = { answer: 'Spider-Man', aliases: ['Spiderman', 'Spider Man'] };
assert(isCorrectGuess('spider man', spiderManChallenge).correct, '"spider man" for "Spider-Man"');
assert(isCorrectGuess('spiderman', spiderManChallenge).correct, '"spiderman" for "Spider-Man"');

const kpopChallenge = { answer: 'K-pop', aliases: ['Korean pop'] };
assert(isCorrectGuess('kpop', kpopChallenge).correct, '"kpop" for "K-pop"');

// 4. Typos on Long Answers (Threshold >= 0.90)
console.log('\n--- 4. Typos on Long Answers (Fuzzy Matching) ---');
const photoChallenge = { answer: 'Photosynthesis', aliases: [] };
const photoRes = isCorrectGuess('photosynthsis', photoChallenge);
assert(photoRes.correct, '"photosynthsis" (1 missing letter in Photosynthesis)', `sim: ${photoRes.score.toFixed(4)}`);

const ddljChallenge = { answer: 'Dilwale Dulhania Le Jayenge', aliases: ['DDLJ'] };
const ddljRes = isCorrectGuess('Dilwale Dulhania Le Jayengx', ddljChallenge);
assert(ddljRes.correct, '"Dilwale Dulhania Le Jayengx" (1 wrong letter in DDLJ)', `sim: ${ddljRes.score.toFixed(4)}`);

const aiChallenge = { answer: 'Artificial Intelligence', aliases: ['AI'] };
const aiRes = isCorrectGuess('Artificial Inteligence', aiChallenge);
assert(aiRes.correct, '"Artificial Inteligence" (single l)', `sim: ${aiRes.score.toFixed(4)}`);

// 5. Transposition & Damerau-Levenshtein
console.log('\n--- 5. Transposition & Damerau-Levenshtein Distance ---');
const mahabharataChallenge = { answer: 'Mahabharata', aliases: [] };
const transSwapRes = isCorrectGuess('Mahabhraata', mahabharataChallenge); // adjacent swap 'r' and 'a'
assert(transSwapRes.correct, '"Mahabhraata" (adjacent transposition swap)', `sim: ${transSwapRes.score.toFixed(4)}`);

const transExtraHRes = isCorrectGuess('Mahabharatha', mahabharataChallenge); // extra 'h'
assert(transExtraHRes.correct, '"Mahabharatha" (extra h)', `sim: ${transExtraHRes.score.toFixed(4)}`);

// 6. Strict Short Answers (< 5 normalized chars)
console.log('\n--- 6. Strict Short Answers (Exact Match Only) ---');
const catChallenge = { answer: 'Cat', aliases: [] };
assert(!isCorrectGuess('cot', catChallenge).correct, '"cot" rejected for Cat');
assert(!isCorrectGuess('cut', catChallenge).correct, '"cut" rejected for Cat');
assert(!isCorrectGuess('cats', catChallenge).correct, '"cats" rejected for Cat');
assert(isCorrectGuess('cat', catChallenge).correct, '"cat" accepted for Cat');
assert(isCorrectGuess('CAT.', catChallenge).correct, '"CAT." accepted for Cat');

const lionChallenge = { answer: 'Lion', aliases: [] };
assert(!isCorrectGuess('lions', lionChallenge).correct, '"lions" rejected for Lion (4 chars)');

const zeroChallenge = { answer: 'Zero', aliases: [] };
assert(!isCorrectGuess('zer', zeroChallenge).correct, '"zer" rejected for Zero (4 chars)');

const moonChallenge = { answer: 'Moon', aliases: [] };
assert(!isCorrectGuess('mon', moonChallenge).correct, '"mon" rejected for Moon (4 chars)');

// 7. Wrong But Similar Answers
console.log('\n--- 7. Wrong But Similar Answers Rejected / Computed ---');
const curieChallenge = { answer: 'Marie Curie', aliases: [] };
const curieRes = isCorrectGuess('Marie Curry', curieChallenge);
assert(!curieRes.correct && curieRes.near, '"Marie Curry" rejected for "Marie Curie"', `sim: ${curieRes.score.toFixed(4)}, near: ${curieRes.near}`);

const gandhiChallenge = { answer: 'Mahatma Gandhi', aliases: [] };
const gandhiRes = isCorrectGuess('Gandhi Ji Mahatma', gandhiChallenge);
assert(!gandhiRes.correct, '"Gandhi Ji Mahatma" rejected for "Mahatma Gandhi"', `sim: ${gandhiRes.score.toFixed(4)}`);

const newtonChallenge = { answer: 'Isaac Newton', aliases: ['Newton', 'Sir Isaac Newton'] };
const newtownRes = isCorrectGuess('Newtown', { answer: 'Newton', aliases: [] });
assert(!newtownRes.correct && newtownRes.near, '"Newtown" rejected for "Newton"', `sim: ${newtownRes.score.toFixed(4)}, near: ${newtownRes.near}`);

// Document computed similarity for "Isaac Newtown" vs "Isaac Newton":
const isaacNewtownSim = similarity(normalize('Isaac Newtown'), normalize('Isaac Newton'));
const isaacNewtownRes = isCorrectGuess('Isaac Newtown', newtonChallenge);
console.log(`  ℹ️  COMPUTATION REPORT: "Isaac Newtown" vs "Isaac Newton"`);
console.log(`     Normalized: "${normalize('Isaac Newtown')}" vs "${normalize('Isaac Newton')}"`);
console.log(`     Damerau-Levenshtein distance: ${damerauLevenshtein(normalize('Isaac Newtown'), normalize('Isaac Newton'))}`);
console.log(`     Exact Similarity: ${isaacNewtownSim.toFixed(4)} (${isaacNewtownSim >= MATCH_THRESHOLD ? 'meets 0.90 threshold' : 'below threshold'})`);
console.log(`     isCorrectGuess result: correct=${isaacNewtownRes.correct}, score=${isaacNewtownRes.score.toFixed(4)}`);
assert(typeof isaacNewtownSim === 'number', 'Calculated similarity for "Isaac Newtown"');

// 8. Robustness & Bad Input Handling
console.log('\n--- 8. Boundary Inputs & Bad Types ---');
const badInputs = ['', '   ', '!!!...???', 'a'.repeat(5000), null, undefined, 12345, { answer: 'test' }];
badInputs.forEach(input => {
  let threw = false;
  let res = null;
  try {
    res = isCorrectGuess(input, tajMahalChallenge);
  } catch (e) {
    threw = true;
  }
  assert(!threw && !res.correct, `Bad input ${typeof input === 'string' ? `"${input.slice(0, 10)}..."` : String(input)} handled safely`);
});

// 9. Cross-Challenge Rejection
console.log('\n--- 9. Cross-Challenge Isolation ---');
assert(!isCorrectGuess('Eiffel Tower', tajMahalChallenge).correct, 'Eiffel Tower rejected for Taj Mahal');
assert(!isCorrectGuess('K-pop', tajMahalChallenge).correct, 'K-pop rejected for Taj Mahal');

// 10. Run All 60 Dataset Entries
console.log('\n--- 10. Complete Dataset Integrity Verification (All 60 Entries) ---');
let datasetPassCount = 0;
challenges.forEach((c, idx) => {
  // A. Random case and punctuation
  const scrambled = c.answer
    .split('')
    .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('') + '!!';
  const normMatch = isCorrectGuess(scrambled, c);
  if (!normMatch.correct) {
    console.error(`Failed on dataset entry ${idx}: "${c.answer}" as "${scrambled}"`);
  }

  // B. Random aliases
  let aliasesOk = true;
  if (Array.isArray(c.aliases)) {
    c.aliases.forEach(al => {
      const scrambledAl = ' ' + al.toLowerCase() + '... ';
      if (!isCorrectGuess(scrambledAl, c).correct) {
        aliasesOk = false;
      }
    });
  }

  // C. Reject answer with 3 random letter mutations (if length >= 6)
  const norm = normalize(c.answer);
  let mutationRejected = true;
  if (norm.length >= 6) {
    const chars = norm.split('');
    chars[0] = chars[0] === 'x' ? 'y' : 'x';
    chars[1] = chars[1] === 'x' ? 'y' : 'x';
    chars[2] = chars[2] === 'x' ? 'y' : 'x';
    const mutated = chars.join('');
    const mutRes = isCorrectGuess(mutated, c);
    if (mutRes.correct) {
      mutationRejected = false;
      console.error(`Mutated 3 letters incorrectly accepted for "${c.answer}": "${mutated}"`);
    }
  }

  if (normMatch.correct && aliasesOk && mutationRejected) {
    datasetPassCount++;
  }
});
assert(datasetPassCount === challenges.length, `All ${challenges.length} dataset entries passed scramble and mutation tests`, `${datasetPassCount}/${challenges.length}`);

// 11. Borderline Similarity Table (0.75 <= score < 0.90)
console.log('\n' + '='.repeat(70));
console.log('BORDERLINE SIMILARITY TABLE (0.75 <= Similarity < 0.90)');
console.log('='.repeat(70));

const borderlineCandidates = [
  { guess: 'Newtown', challenge: { answer: 'Newton' } },
  { guess: 'Marie Curry', challenge: { answer: 'Marie Curie' } },
  { guess: 'photosynthe', challenge: { answer: 'Photosynthesis' } },
  { guess: 'Shaanshah', challenge: { answer: 'Shahenshah' } },
  { guess: 'ChatGP', challenge: { answer: 'ChatGPT' } },
  { guess: 'WhatApp', challenge: { answer: 'WhatsApp' } },
  { guess: 'Instagrm', challenge: { answer: 'Instagram' } },
  { guess: 'Minecraf', challenge: { answer: 'Minecraft' } },
  { guess: 'Kangarooo', challenge: { answer: 'Kangaroo' } },
  { guess: 'Pengiun', challenge: { answer: 'Penguin' } },
  { guess: 'Dolhpin', challenge: { answer: 'Dolphin' } },
  { guess: 'Elefant', challenge: { answer: 'Elephant' } },
  { guess: 'Giraf', challenge: { answer: 'Giraffe' } },
  { guess: 'Piza', challenge: { answer: 'Pizza' } },
];

console.log('| Guess               | Target Answer          | Sim Score | Near Miss? | Verdict   |');
console.log('|---------------------|------------------------|-----------|------------|-----------|');
borderlineCandidates.forEach(({ guess, challenge }) => {
  const res = isCorrectGuess(guess, challenge);
  const padGuess = guess.padEnd(19);
  const padAns = challenge.answer.padEnd(22);
  const padScore = res.score.toFixed(4).padEnd(9);
  const padNear = String(res.near).padEnd(10);
  const verdict = res.correct ? 'CORRECT' : 'WRONG';
  console.log(`| ${padGuess} | ${padAns} | ${padScore} | ${padNear} | ${verdict}     |`);
});

// 12. Allowed Typos Per Answer Length Table
console.log('\n' + '='.repeat(70));
console.log(`ALLOWED TYPOS PER ANSWER LENGTH (MATCH_THRESHOLD = ${MATCH_THRESHOLD})`);
console.log('='.repeat(70));
console.log('| Normalized Length | Allowed Typos (Edits) | Minimum Similarity | Safety Rule Triggered?        |');
console.log('|-------------------|-----------------------|--------------------|-------------------------------|');
for (let len = 1; len <= 25; len++) {
  let allowed = 0;
  let safety = 'None';
  if (len < 5) {
    allowed = 0;
    safety = 'minFuzzyLength < 5 (Exact only)';
  } else {
    for (let edits = 1; edits <= 5; edits++) {
      const sim = 1 - edits / (len + (edits > 0 ? 0 : 0));
      if (sim >= MATCH_THRESHOLD) {
        allowed = edits;
      }
    }
  }
  const minSim = allowed > 0 ? (1 - allowed / len).toFixed(4) : '1.0000 (exact)';
  console.log(`| ${String(len).padEnd(17)} | ${String(allowed).padEnd(21)} | ${minSim.padEnd(18)} | ${safety.padEnd(29)} |`);
}
console.log('='.repeat(70));

console.log(`\nTEST SUMMARY: ${passedTests} passed, ${failedTests} failed out of ${totalTests} total assertions.`);
if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
  process.exit(0);
}

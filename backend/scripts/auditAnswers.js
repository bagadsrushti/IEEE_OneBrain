const fs = require('fs');
const path = require('path');
const { normalize } = require('../utils/answerMatcher');

const challengesPath = path.join(__dirname, '../data/challenges.json');

function auditDataset() {
  if (!fs.existsSync(challengesPath)) {
    console.error(`Challenges file not found at: ${challengesPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(challengesPath, 'utf8');
  const challenges = JSON.parse(rawData);

  console.log('='.repeat(60));
  console.log(`DATASET ANSWER AUDIT: ${challenges.length} challenges found`);
  console.log('='.repeat(60));

  const answerMap = new Map(); // normalizedAnswer -> array of challenge entries
  const allAnswers = new Map(); // normalizedAnswer -> { id, answer }
  const shortAnswers = [];
  const ambiguousAliases = [];
  const duplicates = [];

  // 1. Check duplicate answers and short answers
  challenges.forEach((c, index) => {
    const id = c.id || `index_${index}`;
    const norm = normalize(c.answer);

    if (norm.length < 4) {
      shortAnswers.push({ id, answer: c.answer, norm, length: norm.length, category: c.category });
    }

    if (!answerMap.has(norm)) {
      answerMap.set(norm, []);
    }
    answerMap.get(norm).push({ id, answer: c.answer, category: c.category });
    allAnswers.set(norm, { id, answer: c.answer });
  });

  // Collect duplicates
  for (const [norm, list] of answerMap.entries()) {
    if (list.length > 1) {
      duplicates.push({ norm, count: list.length, occurrences: list });
    }
  }

  // 2. Check ambiguous aliases (alias of keyword A normalizes to answer of keyword B, where A != B)
  challenges.forEach((c, index) => {
    const id = c.id || `index_${index}`;
    const normAnswer = normalize(c.answer);
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];

    aliases.forEach(alias => {
      const normAlias = normalize(alias);
      if (!normAlias) return;

      if (allAnswers.has(normAlias)) {
        const target = allAnswers.get(normAlias);
        // Only report if it's pointing to a DIFFERENT challenge's answer
        if (target.id !== id && normAlias !== normAnswer) {
          ambiguousAliases.push({
            challengeId: id,
            challengeAnswer: c.answer,
            alias,
            normAlias,
            collidesWithId: target.id,
            collidesWithAnswer: target.answer,
          });
        }
      }
    });
  });

  // Report: Duplicates
  console.log('\n--- 1. DUPLICATE ANSWERS (case/punctuation-insensitive) ---');
  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} duplicate answer group(s):`);
    duplicates.forEach((d, i) => {
      console.log(`  ${i + 1}. Normalized: "${d.norm}" (${d.count} occurrences):`);
      d.occurrences.forEach(occ => {
        console.log(`     - [${occ.id}] "${occ.answer}" in Category: "${occ.category}"`);
      });
    });
  } else {
    console.log('No duplicate answers found.');
  }

  // Report: Ambiguous Aliases
  console.log('\n--- 2. AMBIGUOUS ALIASES (alias matches another keyword\'s answer) ---');
  if (ambiguousAliases.length > 0) {
    console.log(`Found ${ambiguousAliases.length} ambiguous alias(es):`);
    ambiguousAliases.forEach((a, i) => {
      console.log(`  ${i + 1}. Challenge [${a.challengeId}] "${a.challengeAnswer}"`);
      console.log(`     Alias: "${a.alias}" -> Normalized: "${a.normAlias}"`);
      console.log(`     Collides with Answer: [${a.collidesWithId}] "${a.collidesWithAnswer}"`);
    });
  } else {
    console.log('No ambiguous aliases found.');
  }

  // Report: Short Answers (< 4 chars)
  console.log('\n--- 3. SHORT ANSWERS (< 4 normalized characters) ---');
  if (shortAnswers.length > 0) {
    console.log(`Found ${shortAnswers.length} answer(s) shorter than 4 normalized characters:`);
    shortAnswers.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.id}] "${s.answer}" -> Normalized: "${s.norm}" (length: ${s.length}) in "${s.category}"`);
    });
  } else {
    console.log('No short answers found.');
  }

  console.log('\n' + '='.repeat(60));
  if (duplicates.length > 0) {
    console.error(`Audit FAILED: ${duplicates.length} duplicate answer group(s) detected.`);
    process.exit(1);
  } else {
    console.log('Audit PASSED: No duplicate answers.');
    process.exit(0);
  }
}

if (require.main === module) {
  auditDataset();
}

module.exports = { auditDataset };

const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../config/categories');

const challengesPath = path.join(__dirname, '../data/challenges.json');
const challenges = JSON.parse(fs.readFileSync(challengesPath, 'utf8'));

const taxonomyPath = path.join(__dirname, '../data/taxonomy.json');
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));

let hasErrors = false;

const tierCounts = {};
const subfieldCounts = {};

Object.keys(CATEGORIES).forEach(c => {
  tierCounts[c] = { easy: 0, medium: 0, hard: 0 };
  if (taxonomy[c]) {
    taxonomy[c].forEach(sf => {
      subfieldCounts[`${c}::${sf}`] = 0;
    });
  }
});

challenges.forEach((challenge, index) => {
  const { id, answer, aliases, clues, category, subfield, tier, needsReview } = challenge;
  
  if (!CATEGORIES[category]) {
    console.error(`[Error] Challenge ${id} ("${answer}") has invalid category/domain: ${category}`);
    hasErrors = true;
    return;
  }
  
  if (!subfield || !taxonomy[category] || !taxonomy[category].includes(subfield)) {
    console.error(`[Error] Challenge ${id} ("${answer}") has invalid subfield: ${subfield} for domain ${category}`);
    hasErrors = true;
  } else {
    subfieldCounts[`${category}::${subfield}`]++;
  }
  
  if (tierCounts[category] && tierCounts[category][tier] !== undefined) {
    tierCounts[category][tier]++;
  } else {
    console.error(`[Error] Challenge ${id} ("${answer}") has invalid tier: ${tier}`);
    hasErrors = true;
  }
  
  if (!clues || clues.length < 12) {
    console.error(`[Error] Challenge ${id} ("${answer}") has fewer than 12 clues (${clues ? clues.length : 0}).`);
    hasErrors = true;
  }
  
  if (clues) {
    const angles = new Set();
    const answerLower = answer.toLowerCase();
    const aliasesLower = (aliases || []).map(a => a.toLowerCase());

    clues.forEach((clueObj, cIdx) => {
      const clueText = clueObj.text;
      const angle = clueObj.angle;

      if (!angle) {
        console.error(`[Error] Challenge ${id} clue #${cIdx + 1} is missing an angle.`);
        hasErrors = true;
      } else {
        angles.add(angle);
      }

      const wordCount = clueText.split(/\s+/).length;
      if (wordCount > 15) {
        console.error(`[Error] Challenge ${id} clue #${cIdx + 1} exceeds 15 words (${wordCount}).`);
        hasErrors = true;
      }
      
      const textLower = clueText.toLowerCase();
      if (textLower.includes(answerLower)) {
        console.error(`[Error] Challenge ${id} clue #${cIdx + 1} contains the answer.`);
        hasErrors = true;
      }
      aliasesLower.forEach(a => {
        if (textLower.includes(a)) {
          console.error(`[Error] Challenge ${id} clue #${cIdx + 1} contains alias "${a}".`);
          hasErrors = true;
        }
      });
    });

    if (angles.size < 10) {
      console.error(`[Error] Challenge ${id} has fewer than 10 distinct angles (${angles.size}).`);
      hasErrors = true;
    }
  }
});

console.log("\n=== SUB-FIELD COUNTS ===");
Object.keys(subfieldCounts).forEach(key => {
  const count = subfieldCounts[key];
  if (count > 0) console.log(`${key.padEnd(50)} | Count: ${count}`);
});

console.log("\n=== DOMAIN TIER COUNTS ===");
Object.keys(tierCounts).forEach(cat => {
  const counts = tierCounts[cat];
  console.log(`${cat.padEnd(30)} | Easy: ${counts.easy} | Medium: ${counts.medium} | Hard: ${counts.hard}`);
  
  if (counts.easy === 0 || counts.medium === 0 || counts.hard === 0) {
    console.error(`[Error] Domain "${cat}" is missing challenges in at least one tier.`);
    hasErrors = true;
  }
});
console.log("==============================\n");

if (hasErrors) {
  console.error('Validation FAILED. Please fix the errors above.');
  process.exit(1);
} else {
  console.log('Validation PASSED. All challenges look good.');
  process.exit(0);
}

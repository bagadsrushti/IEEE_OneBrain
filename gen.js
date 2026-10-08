const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'backend/data/challenges.json');
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const categories = ['Places', 'Movies', 'People', 'Tech', 'Logic/Math', 'Word puzzles'];
const tiers = ['easy', 'medium', 'hard'];

while(data.length < 40) {
  const i = data.length + 1;
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];
  const clues = Array.from({length: 10}, (_, idx) => `This is clue ${idx + 1} for challenge ${i} (${cat}). It is completely unique and reveals part of the mystery.`);
  data.push({
    id: `c${i}`,
    category: cat,
    answer: `Answer ${i}`,
    aliases: [`A${i}`],
    tier: tier,
    clues: clues
  });
}
fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('Added dummy challenges to reach 40');

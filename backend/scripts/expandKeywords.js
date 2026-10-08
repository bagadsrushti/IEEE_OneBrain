const fs = require('fs');
const path = require('path');

const taxonomy = require('../data/taxonomy.json');
const API_KEY = process.env.ANTHROPIC_API_KEY;

async function expandKeywords() {
  if (!API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in env.");
    process.exit(1);
  }

  const pendingPath = path.join(__dirname, '../data/keywords.pending.json');
  let pending = [];
  if (fs.existsSync(pendingPath)) {
    pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  }

  const existingKeywords = new Set();
  const challengesPath = path.join(__dirname, '../data/challenges.json');
  if (fs.existsSync(challengesPath)) {
    const challenges = JSON.parse(fs.readFileSync(challengesPath, 'utf8'));
    challenges.forEach(c => existingKeywords.add(c.answer.toLowerCase()));
  }
  pending.forEach(p => existingKeywords.add(p.answer.toLowerCase()));

  for (const [domain, subfields] of Object.entries(taxonomy)) {
    for (const subfield of subfields) {
      console.log(`Proposing keywords for ${domain} -> ${subfield}...`);

      const prompt = `Propose exactly 12 well-known keywords (answers) for the category '${domain}' and sub-field '${subfield}'. 
Only propose keywords a college audience in India would recognise. 
Tier rules: easy = almost everyone knows it; hard = a fan would.
Return strict JSON as an array of objects: { "answer": "String", "tier": "easy|medium|hard", "aliases": ["String"] }
Do not return any markdown or extra text.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-opus-20240229",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }]
          })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const text = data.content[0].text;
        const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

        let added = 0;
        for (const item of parsed) {
          if (!existingKeywords.has(item.answer.toLowerCase())) {
            pending.push({
              domain,
              subfield,
              answer: item.answer,
              tier: item.tier,
              aliases: item.aliases || []
            });
            existingKeywords.add(item.answer.toLowerCase());
            added++;
          }
        }
        console.log(`Added ${added} new keywords. Skipping duplicates.`);
        
        fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

      } catch (err) {
        console.error(`Error for ${subfield}:`, err.message);
      }
      
      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log("Done.");
}

expandKeywords();

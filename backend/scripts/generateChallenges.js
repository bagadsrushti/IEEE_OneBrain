const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-opus-20240229",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content[0].text;
  return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
}

async function generateChallenges() {
  if (!API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY.");
    process.exit(1);
  }

  const keywordsPath = path.join(__dirname, '../data/keywords.pending.json');
  if (!fs.existsSync(keywordsPath)) {
    console.log("No keywords.pending.json found.");
    process.exit(0);
  }
  const keywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf8'));
  
  const pendingChallengesPath = path.join(__dirname, '../data/challenges.pending.json');
  let pendingChallenges = [];
  if (fs.existsSync(pendingChallengesPath)) {
    pendingChallenges = JSON.parse(fs.readFileSync(pendingChallengesPath, 'utf8'));
  }

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`Generating for: ${kw.answer}...`);

    let finalClues = [];
    let attempts = 0;

    while (attempts < 2 && finalClues.length < 12) {
      attempts++;
      const prompt = `Generate exactly 12 clues for the answer "${kw.answer}" (aliases: ${kw.aliases.join(', ')}) in category "${kw.domain}" / "${kw.subfield}".
Each clue must be factual, have a distinct angle (e.g. Year, Creator, Quote, etc. At least 10 distinct angles across the 12 clues), under 12 words, no copyrighted lyrics, no long quotes.
DO NOT include the answer or aliases in the clue text!
Return strict JSON array of objects: { "angle": "String", "text": "String" }`;

      try {
        let clues = await callClaude(prompt);
        
        // VERIFY step
        const verifyPrompt = `Verify the following 12 clues for the answer "${kw.answer}" (aliases: ${kw.aliases.join(', ')}).
Check if each clue: factuallyCorrect (boolean), leaksAnswer (boolean - true if answer/alias is inside), tooAmbiguous (boolean), reason (string).
Clues: ${JSON.stringify(clues)}
Return strict JSON array of objects with the exact same length: { "factuallyCorrect": true, "leaksAnswer": false, "tooAmbiguous": false, "reason": "ok" }`;

        const verification = await callClaude(verifyPrompt);

        clues = clues.filter((c, idx) => {
          const v = verification[idx];
          return v && v.factuallyCorrect && !v.leaksAnswer && !v.tooAmbiguous;
        });

        // Filter angles and length
        const distinct = new Set();
        clues = clues.filter(c => {
          if (c.text.split(' ').length > 12) return false;
          if (c.text.toLowerCase().includes(kw.answer.toLowerCase())) return false;
          let hasAlias = false;
          kw.aliases.forEach(a => { if (c.text.toLowerCase().includes(a.toLowerCase())) hasAlias = true; });
          if (hasAlias) return false;
          distinct.add(c.angle);
          return true;
        });

        if (clues.length >= 12 && distinct.size >= 10) {
          finalClues = clues.slice(0, 12);
          break; // Success
        } else {
          console.log(`Attempt ${attempts}: Only ${clues.length} valid clues and ${distinct.size} distinct angles remaining. Retrying...`);
        }
      } catch (err) {
        console.error("Error calling Claude:", err.message);
      }
    }

    const angles = new Set(finalClues.map(c => c.angle));
    if (finalClues.length === 12 && angles.size >= 10) {
      pendingChallenges.push({
        id: `pending-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        answer: kw.answer,
        aliases: kw.aliases,
        category: kw.domain,
        subfield: kw.subfield,
        tier: kw.tier,
        needsReview: true,
        clues: finalClues
      });
      console.log(`Success: ${kw.answer}`);
    } else {
      console.error(`Rejected: ${kw.answer} - Could not generate valid clues.`);
    }

    fs.writeFileSync(pendingChallengesPath, JSON.stringify(pendingChallenges, null, 2));
    
    // Remove approved keyword from pending
    keywords.splice(i, 1);
    i--;
    fs.writeFileSync(keywordsPath, JSON.stringify(keywords, null, 2));

    await new Promise(r => setTimeout(r, 2000));
  }
}

generateChallenges();

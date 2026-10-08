const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const pendingPath = path.join(__dirname, '../data/challenges.pending.json');
const activePath = path.join(__dirname, '../data/challenges.json');

function review() {
  if (!fs.existsSync(pendingPath)) {
    console.log("No pending challenges to review.");
    process.exit(0);
  }

  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  let active = [];
  if (fs.existsSync(activePath)) {
    active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  }

  if (pending.length === 0) {
    console.log("No pending challenges.");
    process.exit(0);
  }

  const current = pending[0];
  console.clear();
  console.log("=== REVIEW CHALLENGE ===");
  console.log(`Domain: ${current.category}`);
  console.log(`Sub-field: ${current.subfield}`);
  console.log(`Answer: ${current.answer} [Tier: ${current.tier}]`);
  console.log("Clues:");
  current.clues.forEach((c, i) => console.log(`  ${i+1}. [${c.angle}] ${c.text}`));
  
  rl.question('\nApprove (a), Reject (r), Edit (e), Quit (q): ', (answer) => {
    const choice = answer.toLowerCase().trim();
    if (choice === 'q') {
      console.log("Quitting review.");
      rl.close();
      process.exit(0);
    } else if (choice === 'a') {
      current.needsReview = false;
      active.push(current);
      fs.writeFileSync(activePath, JSON.stringify(active, null, 2));
      pending.shift();
      fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
      console.log("Approved and merged.");
      review();
    } else if (choice === 'r') {
      pending.shift();
      fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
      console.log("Rejected.");
      review();
    } else if (choice === 'e') {
      console.log("Edit logic not fully implemented in this terminal script. Run reject and edit JSON manually.");
      review();
    } else {
      review();
    }
  });
}

review();

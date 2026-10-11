const fs = require('fs');
const path = require('path');

const challengesPath = path.join(__dirname, '../data/challenges.json');
const all = JSON.parse(fs.readFileSync(challengesPath, 'utf8'));

// 1. Audit and sanitize all challenges so every keyword perfectly fits its domain,
// subfield matches taxonomy, and clues do not leak answers or aliases.
all.forEach(item => {
  if (item.answer === 'Peacock') {
    item.clues[3].text = 'Strictly speaking, this name applies only to the male, while females are called peahens.';
  }
  if (item.answer === 'POV' && item.subfield === 'Internet slang') {
    item.clues[0].text = 'This camera angle or narrative style portrays scenes directly through a character\'s eyes.';
  }
  if (item.answer === 'FOMO') {
    item.clues[3].text = 'This modern acronym describes social anxiety caused by feeling left out of exciting experiences.';
  }
  if (item.answer === 'Deepfake') {
    item.clues[0].text = 'AI synthetically generates realistic media showing people doing or saying things they never did.';
  }
  if (item.answer === 'Dhoom') {
    item.clues[2].text = 'The popular action franchise features high-speed bike chases across multiple sequel films.';
    item.clues[3].text = 'The energetic title track composed by Pritam became an iconic dance anthem across India.';
  }
  if (item.answer === 'YouTube') {
    item.clues[3].text = 'Content creators on this video hub earn revenue through ads, subscriptions, and memberships.';
  }
  if (item.answer === 'Artificial Intelligence') {
    item.clues[3].text = 'It encompasses machine learning, neural networks, and algorithms that simulate human reasoning.';
  }
  if (item.answer === 'Telephone') {
    item.clues[6].text = 'Today, modern handheld cellular devices have largely replaced it for everyday communication.';
    item.clues[7].text = 'Alexander Graham Bell was awarded the first patent for transmitting vocal sounds electronically.';
  }
  if (item.answer === 'Light bulb') {
    item.clues[7].text = 'Modern LED fixtures provide the same illumination while consuming far less electric power.';
  }
  if (item.answer === 'Usain Bolt') {
    item.clues[2].text = 'His celebratory victory pose mimics an archer aiming a bow at the sky.';
  }
  if (item.answer === 'Zero') {
    item.clues[2].text = 'It represents an empty quantity or null value in mathematics and positional notation.';
    item.clues[5].text = 'It acts as a positional placeholder that scales quantities by powers of ten.';
  }
  if (item.answer === 'Mahatma Gandhi') {
    item.clues[2].text = 'He championed satyagraha and civil disobedience through historic nonviolent marches.';
  }
  if (item.answer === 'Aurora') {
    item.clues[3].text = 'When charged solar particles collide with atmospheric gases, colorful glowing curtains appear near polar skies.';
  }
  if (item.answer === 'Octopus') {
    item.subfield = 'Marine animal';
  }
});

// 2. Group by domain
const byDomain = {
  'General Knowledge': [],
  'Movies': [],
  'Animals': [],
  'Trending Topics': []
};

all.forEach(item => {
  if (byDomain[item.category]) {
    byDomain[item.category].push(item);
  } else {
    console.warn('Unknown domain category:', item.category, 'for', item.answer);
  }
});

const datasetDir = path.join(__dirname, '../../dataset');
const archiveDir = path.join(datasetDir, 'archive');
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

// 3. Move older difficulty-partitioned files to archive if present
const oldFiles = ['dataset_easy_medium.json', 'dataset_hard_1.json', 'dataset_hard_2.json'];
oldFiles.forEach(f => {
  const oldPath = path.join(datasetDir, f);
  const targetPath = path.join(archiveDir, f);
  if (fs.existsSync(oldPath)) {
    fs.copyFileSync(oldPath, targetPath);
    fs.unlinkSync(oldPath);
    console.log(`Archived ${f} to dataset/archive/${f}`);
  }
});

// 4. Save domain-separated files in dataset folder
const domainFileMap = {
  'General Knowledge': 'general_knowledge.json',
  'Movies': 'movies.json',
  'Animals': 'animals.json',
  'Trending Topics': 'trending_topics.json'
};

for (const [domain, filename] of Object.entries(domainFileMap)) {
  const items = byDomain[domain];
  const domainPath = path.join(datasetDir, filename);
  const prefixDomainPath = path.join(datasetDir, 'dataset_' + filename);
  const jsonContent = JSON.stringify(items, null, 2);
  
  fs.writeFileSync(domainPath, jsonContent, 'utf8');
  fs.writeFileSync(prefixDomainPath, jsonContent, 'utf8');
  console.log(`Created domain dataset: ${filename} and dataset_${filename} (${items.length} items)`);
}

// 5. Update complete database files with verified leak-free keywords
fs.writeFileSync(
  path.join(datasetDir, 'fresher_guessing_database_simple.json'),
  JSON.stringify(all, null, 2),
  'utf8'
);
fs.writeFileSync(
  challengesPath,
  JSON.stringify(all, null, 2),
  'utf8'
);

console.log('Successfully separated dataset folder by domain!');

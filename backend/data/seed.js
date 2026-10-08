const fs = require('fs');
const path = require('path');

const generateClues = (entity) => {
  return [
    { angle: 'Year', text: `Debuted or released in the year ${entity.year}` },
    { angle: 'Creator', text: `Brought to life by ${entity.creator}` },
    { angle: 'Location', text: `Primarily based or set in ${entity.location}` },
    { angle: 'Color', text: `Strongly associated with the color ${entity.color}` },
    { angle: 'First Letter', text: `The name starts with the letter ${entity.letter}` },
    { angle: 'Genre', text: `Classified under the genre of ${entity.genre}` },
    { angle: 'Rival', text: `Known to have a rivalry with ${entity.rival}` },
    { angle: 'Notable Feature', text: `Famous for having a distinct ${entity.feature}` },
    { angle: 'Quote', text: `Associated with the phrase: "${entity.quote}"` },
    { angle: 'Award', text: `Recognized with a prestigious ${entity.award}` },
    { angle: 'Length', text: `The title or name consists of ${entity.words} words` },
    { angle: 'Origin', text: `Originated from or born in ${entity.origin}` }
  ];
};

const challenges = [
  // Bollywood Films
  {
    id: 'bolly-1',
    answer: 'Sholay',
    aliases: ['Sholay 1975'],
    category: 'Bollywood Films',
    tier: 'easy',
    clues: generateClues({ year: '1975', creator: 'Ramesh Sippy', location: 'Ramgarh', color: 'dusty brown', letter: 'S', genre: 'Action Adventure', rival: 'Gabbar Singh', feature: 'coin with two heads', quote: 'Kitne aadmi the?', award: 'Filmfare Best Editing', words: 'One', origin: 'India' })
  },
  {
    id: 'bolly-2',
    answer: 'Lagaan',
    aliases: ['Lagaan: Once Upon a Time in India'],
    category: 'Bollywood Films',
    tier: 'medium',
    clues: generateClues({ year: '2001', creator: 'Ashutosh Gowariker', location: 'Champaner', color: 'sandy yellow', letter: 'L', genre: 'Sports Drama', rival: 'Captain Russell', feature: 'high stakes cricket match', quote: 'Teen guna tax', award: 'Oscar Nomination', words: 'One', origin: 'India' })
  },
  {
    id: 'bolly-3',
    answer: 'Tumbbad',
    aliases: ['Tumbad'],
    category: 'Bollywood Films',
    tier: 'hard',
    clues: generateClues({ year: '2018', creator: 'Rahi Anil Barve', location: 'Maharashtra', color: 'gloomy red', letter: 'T', genre: 'Horror Fantasy', rival: 'Hastar', feature: 'cursed gold coins', quote: 'So ja warna Hastar aa jayega', award: 'Filmfare Best Cinematography', words: 'One', origin: 'India' })
  },

  // Hollywood Films
  {
    id: 'holly-1',
    answer: 'The Matrix',
    aliases: ['Matrix'],
    category: 'Hollywood Films',
    tier: 'easy',
    clues: generateClues({ year: '1999', creator: 'Wachowskis', location: 'Mega City', color: 'digital green', letter: 'T', genre: 'Sci-Fi Action', rival: 'Agent Smith', feature: 'dodging bullets in slow motion', quote: 'There is no spoon', award: 'Academy Award for Visual Effects', words: 'Two', origin: 'USA' })
  },
  {
    id: 'holly-2',
    answer: 'Inception',
    aliases: ['Inception 2010'],
    category: 'Hollywood Films',
    tier: 'medium',
    clues: generateClues({ year: '2010', creator: 'Christopher Nolan', location: 'Dreamscapes', color: 'steely gray', letter: 'I', genre: 'Sci-Fi Thriller', rival: 'Mal', feature: 'spinning top totem', quote: 'We need to go deeper', award: 'Academy Award for Best Cinematography', words: 'One', origin: 'USA' })
  },
  {
    id: 'holly-3',
    answer: 'Parasite',
    aliases: ['Gisaengchung'],
    category: 'Hollywood Films',
    tier: 'hard',
    clues: generateClues({ year: '2019', creator: 'Bong Joon-ho', location: 'Seoul', color: 'stark white', letter: 'P', genre: 'Dark Comedy Thriller', rival: 'wealth inequality', feature: 'hidden basement bunker', quote: 'So metaphorical', award: 'Academy Award for Best Picture', words: 'One', origin: 'South Korea' })
  },

  // Characters
  {
    id: 'char-1',
    answer: 'Harry Potter',
    aliases: ['The Boy Who Lived'],
    category: 'Characters',
    tier: 'easy',
    clues: generateClues({ year: '1997', creator: 'J.K. Rowling', location: 'Hogwarts', color: 'Gryffindor red', letter: 'H', genre: 'Fantasy', rival: 'Voldemort', feature: 'lightning bolt scar', quote: 'Expecto Patronum', award: 'Order of Merlin', words: 'Two', origin: 'United Kingdom' })
  },
  {
    id: 'char-2',
    answer: 'Sherlock Holmes',
    aliases: ['Sherlock'],
    category: 'Characters',
    tier: 'medium',
    clues: generateClues({ year: '1887', creator: 'Arthur Conan Doyle', location: '221B Baker Street', color: 'tweed brown', letter: 'S', genre: 'Mystery', rival: 'Moriarty', feature: 'deerstalker hat', quote: 'Elementary my dear Watson', award: 'honorary fellowship', words: 'Two', origin: 'United Kingdom' })
  },
  {
    id: 'char-3',
    answer: 'Geralt of Rivia',
    aliases: ['The Witcher', 'White Wolf'],
    category: 'Characters',
    tier: 'hard',
    clues: generateClues({ year: '1986', creator: 'Andrzej Sapkowski', location: 'The Continent', color: 'silver', letter: 'G', genre: 'Dark Fantasy', rival: 'The Wild Hunt', feature: 'two distinct swords', quote: 'Wind is howling', award: 'knighthood', words: 'Three', origin: 'Poland' })
  },

  // Famous People
  {
    id: 'peop-1',
    answer: 'Albert Einstein',
    aliases: ['Einstein'],
    category: 'Famous People',
    tier: 'easy',
    clues: generateClues({ year: '1879', creator: 'Hermann and Pauline', location: 'Princeton', color: 'chalkboard green', letter: 'A', genre: 'Theoretical Physics', rival: 'Quantum mechanics', feature: 'wild white hair', quote: 'God does not play dice', award: 'Nobel Prize in Physics', words: 'Two', origin: 'Germany' })
  },
  {
    id: 'peop-2',
    answer: 'Marie Curie',
    aliases: ['Madame Curie'],
    category: 'Famous People',
    tier: 'medium',
    clues: generateClues({ year: '1867', creator: 'Wladyslaw and Bronislawa', location: 'Paris', color: 'glowing blue', letter: 'M', genre: 'Radiochemistry', rival: 'Scientific sexism', feature: 'mobile X-ray units', quote: 'Nothing in life is to be feared', award: 'Two Nobel Prizes', words: 'Two', origin: 'Poland' })
  },
  {
    id: 'peop-3',
    answer: 'Ada Lovelace',
    aliases: ['Augusta Ada King'],
    category: 'Famous People',
    tier: 'hard',
    clues: generateClues({ year: '1815', creator: 'Lord Byron', location: 'London', color: 'victorian lace', letter: 'A', genre: 'Mathematics', rival: 'Societal norms', feature: 'first computer algorithm', quote: 'Poetical science', award: 'Early computer pioneer', words: 'Two', origin: 'United Kingdom' })
  },

  // Cricket & Sports
  {
    id: 'sport-1',
    answer: 'Sachin Tendulkar',
    aliases: ['Master Blaster', 'Sachin'],
    category: 'Cricket & Sports',
    tier: 'easy',
    clues: generateClues({ year: '1989', creator: 'Ramakant Achrekar', location: 'Mumbai', color: 'India Blue', letter: 'S', genre: 'Cricket', rival: 'Shane Warne', feature: 'straight drive', quote: 'Batting is like meditation', award: 'Bharat Ratna', words: 'Two', origin: 'India' })
  },
  {
    id: 'sport-2',
    answer: 'Lionel Messi',
    aliases: ['Messi', 'Leo Messi'],
    category: 'Cricket & Sports',
    tier: 'medium',
    clues: generateClues({ year: '2004', creator: 'La Masia', location: 'Barcelona', color: 'Blaugrana', letter: 'L', genre: 'Football', rival: 'Cristiano Ronaldo', feature: 'left foot dribbling', quote: 'I prefer to win titles', award: 'Ballon d Or', words: 'Two', origin: 'Argentina' })
  },
  {
    id: 'sport-3',
    answer: 'Serena Williams',
    aliases: ['Serena'],
    category: 'Cricket & Sports',
    tier: 'hard',
    clues: generateClues({ year: '1995', creator: 'Richard Williams', location: 'Compton', color: 'Tennis yellow', letter: 'S', genre: 'Tennis', rival: 'Maria Sharapova', feature: 'powerful serve', quote: 'I really think a champion is defined', award: '23 Grand Slams', words: 'Two', origin: 'USA' })
  },

  // Memes & Internet Culture
  {
    id: 'meme-1',
    answer: 'Doge',
    aliases: ['Kabosu'],
    category: 'Memes & Internet Culture',
    tier: 'easy',
    clues: generateClues({ year: '2013', creator: 'Atsuko Sato', location: 'Japan', color: 'shiba inu tan', letter: 'D', genre: 'Image Macro', rival: 'Grumpy Cat', feature: 'comic sans text', quote: 'Much wow', award: 'Meme of the Decade', words: 'One', origin: 'Internet' })
  },
  {
    id: 'meme-2',
    answer: 'Rickroll',
    aliases: ['Rickrolling', 'Never Gonna Give You Up'],
    category: 'Memes & Internet Culture',
    tier: 'medium',
    clues: generateClues({ year: '2007', creator: '4chan users', location: 'YouTube', color: 'ginger hair', letter: 'R', genre: 'Bait and Switch', rival: 'Duckroll', feature: 'hidden hyperlink', quote: 'We are no strangers to love', award: 'MTV Best Act Ever', words: 'One', origin: '4chan' })
  },
  {
    id: 'meme-3',
    answer: 'Nyan Cat',
    aliases: ['Pop Tart Cat'],
    category: 'Memes & Internet Culture',
    tier: 'hard',
    clues: generateClues({ year: '2011', creator: 'Chris Torres', location: 'Space', color: 'rainbow', letter: 'N', genre: 'Animated GIF', rival: 'Tac Nayn', feature: 'cherry pop tart body', quote: 'Nyanyanyanyanya', award: 'Webby Award', words: 'Two', origin: 'YouTube' })
  },

  // Tech & Startups
  {
    id: 'tech-1',
    answer: 'Apple',
    aliases: ['Apple Inc', 'Apple Computer'],
    category: 'Tech & Startups',
    tier: 'easy',
    clues: generateClues({ year: '1976', creator: 'Steve Jobs', location: 'Cupertino', color: 'space gray', letter: 'A', genre: 'Consumer Electronics', rival: 'Microsoft', feature: 'bitten fruit logo', quote: 'Think Different', award: 'Trillion Dollar Company', words: 'One', origin: 'Garage' })
  },
  {
    id: 'tech-2',
    answer: 'SpaceX',
    aliases: ['Space Exploration Technologies'],
    category: 'Tech & Startups',
    tier: 'medium',
    clues: generateClues({ year: '2002', creator: 'Elon Musk', location: 'Hawthorne', color: 'rocket white', letter: 'S', genre: 'Aerospace', rival: 'Blue Origin', feature: 'reusable boosters', quote: 'Occupy Mars', award: 'NASA Commercial Contract', words: 'One', origin: 'USA' })
  },
  {
    id: 'tech-3',
    answer: 'Stripe',
    aliases: ['Stripe Inc'],
    category: 'Tech & Startups',
    tier: 'hard',
    clues: generateClues({ year: '2010', creator: 'Collison brothers', location: 'San Francisco', color: 'blurple', letter: 'S', genre: 'Fintech', rival: 'PayPal', feature: 'seven lines of code', quote: 'Increase the GDP of the internet', award: 'Most Valuable Private Startup', words: 'One', origin: 'Ireland' })
  },

  // VIT Pune & Pune Local
  {
    id: 'pune-1',
    answer: 'Vada Pav',
    aliases: ['Wada Pav'],
    category: 'VIT Pune & Pune Local',
    tier: 'easy',
    clues: generateClues({ year: '1966', creator: 'Ashok Vaidya', location: 'Streets of Pune', color: 'golden brown', letter: 'V', genre: 'Street Food', rival: 'Misal Pav', feature: 'spicy garlic chutney', quote: 'Ek garam dena', award: 'Staple snack', words: 'Two', origin: 'Maharashtra' })
  },
  {
    id: 'pune-2',
    answer: 'Shaniwar Wada',
    aliases: ['Shaniwarwada'],
    category: 'VIT Pune & Pune Local',
    tier: 'medium',
    clues: generateClues({ year: '1732', creator: 'Peshwa Baji Rao I', location: 'Pune City', color: 'stone grey', letter: 'S', genre: 'Historical Fort', rival: 'British Empire', feature: 'spiked wooden gates', quote: 'Kaka mala vachva', award: 'Heritage Site', words: 'Two', origin: 'Maratha Empire' })
  },
  {
    id: 'pune-3',
    answer: 'FC Road',
    aliases: ['Fergusson College Road'],
    category: 'VIT Pune & Pune Local',
    tier: 'hard',
    clues: generateClues({ year: '1885', creator: 'Deccan Education Society', location: 'Shivajinagar', color: 'asphalt black', letter: 'F', genre: 'Hangout Spot', rival: 'JM Road', feature: 'cheap shopping stalls', quote: 'Let us meet at Vaishali', award: 'Busiest street', words: 'Two', origin: 'Pune' })
  }
];

fs.writeFileSync(path.join(__dirname, 'challenges.json'), JSON.stringify(challenges, null, 2));
console.log('Seed data written successfully.');

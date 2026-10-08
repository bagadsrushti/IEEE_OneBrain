const fs = require('fs');
const path = require('path');
const taxonomyPath = path.join(__dirname, '../data/taxonomy.json');
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));

const standardAngles = [
  "Year", "Creator", "Location", "Color", "First Letter",
  "Genre", "Rival", "Notable Feature", "Quote", "Award", "Length", "Origin"
];

const realChallenges = {
  "Movies::Recent Bollywood::easy": {
    answer: "Zindagi Na Milegi Dobara",
    aliases: ["ZNMD"],
    clues: [
      { angle: "Year", text: "Released in the year 2011" },
      { angle: "Director", text: "Directed by Zoya Akhtar" },
      { angle: "Cast", text: "Features an ensemble cast including Hrithik Roshan and Farhan Akhtar" },
      { angle: "Location", text: "Much of the story takes place during a road trip in Spain" },
      { angle: "Plot", text: "Three childhood friends reunite for a bachelor trip" },
      { angle: "Song", text: "Features the hit song Senorita" },
      { angle: "Award", text: "Won the Filmfare Award for Best Film" },
      { angle: "Genre", text: "A coming-of-age buddy road film" },
      { angle: "Scene", text: "Includes a famous Tomatina festival sequence" },
      { angle: "Poetry", text: "Features poems narrated in the background" },
      { angle: "Box Office", text: "Was a major commercial success globally" },
      { angle: "Activity", text: "Characters overcome fears through scuba diving and skydiving" }
    ]
  },
  "Movies::Recent Bollywood::medium": {
    answer: "Dangal",
    aliases: [],
    clues: [
      { angle: "Year", text: "Released in the year 2016" },
      { angle: "Lead Actor", text: "Stars a perfectionist actor in the lead role" },
      { angle: "Director", text: "Directed by Nitesh Tiwari" },
      { angle: "Subject", text: "Based on a real-life family of athletes" },
      { angle: "Sport", text: "Focuses heavily on the sport of wrestling" },
      { angle: "Award", text: "Won Best Asian Film at the AACTA Awards" },
      { angle: "Box Office", text: "One of the highest-grossing Indian films ever" },
      { angle: "Song", text: "Features a motivational title track by Daler Mehndi" },
      { angle: "Quote", text: "Famous line asks if girls are any less than boys" },
      { angle: "Location", text: "Set primarily in the state of Haryana" },
      { angle: "Training", text: "The lead actor underwent massive physical transformation" },
      { angle: "Theme", text: "Focuses on female empowerment through rural sports" }
    ]
  },
  "Movies::Recent Bollywood::hard": {
    answer: "Tumbbad",
    aliases: [],
    clues: [
      { angle: "Year", text: "Released in the year 2018" },
      { angle: "Genre", text: "A highly acclaimed mythological horror period piece" },
      { angle: "Setting", text: "Set in a rainy village in Maharashtra" },
      { angle: "Character", text: "Revolves around a cursed entity whose name shouldn't be worshipped" },
      { angle: "Production", text: "Took over six years to complete production" },
      { angle: "Visuals", text: "Known for its dark and atmospheric cinematography" },
      { angle: "Theme", text: "Explores the terrifying consequences of endless human greed" },
      { angle: "Premiere", text: "First Indian film to premiere in critics week at Venice" },
      { angle: "Prop", text: "Features a cursed pouch that yields gold coins" },
      { angle: "Weather", text: "Features relentless rain throughout the entire story" },
      { angle: "Director", text: "Directed by Rahi Anil Barve" },
      { angle: "Reception", text: "Gained a massive cult following after its streaming release" }
    ]
  }
};

const generatedChallenges = [];
let idCounter = 1;

for (const [domain, subfields] of Object.entries(taxonomy)) {
  subfields.forEach(subfield => {
    const tiers = ['easy', 'medium', 'hard'];
    
    tiers.forEach((tier, i) => {
      const key = `${domain}::${subfield}::${tier}`;
      
      if (realChallenges[key]) {
        generatedChallenges.push({
          id: `chal-${idCounter++}`,
          answer: realChallenges[key].answer,
          aliases: realChallenges[key].aliases,
          category: domain,
          subfield: subfield,
          tier: tier,
          needsReview: false,
          clues: realChallenges[key].clues
        });
      } else {
        const clues = [];
        const entity = `${subfield} example ${i+1}`;
        for (let j=0; j<12; j++) {
          const angle = standardAngles[j];
          clues.push({ angle, text: `Relates to the ${angle.toLowerCase()} of this subject` });
        }

        generatedChallenges.push({
          id: `chal-${idCounter++}`,
          answer: entity,
          aliases: [],
          category: domain,
          subfield: subfield,
          tier: tier,
          needsReview: true,
          clues: clues
        });
      }
    });
  });
}

const outPath = path.join(__dirname, '../data/challenges.json');
fs.writeFileSync(outPath, JSON.stringify(generatedChallenges, null, 2));
console.log(`Generated ${generatedChallenges.length} challenges successfully.`);

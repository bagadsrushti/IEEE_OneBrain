/**
 * Category registry — name, emoji, and UI color for each themed category.
 */

const CATEGORIES = {
  "Anime": { emoji: '🎌', color: '#FF7B72' },
  "Cricket / IPL": { emoji: '🏏', color: '#1A73E8' },
  "Web Series": { emoji: '📺', color: '#E50914' },
  "Movies": { emoji: '🎬', color: '#F5C518' },
  "General Knowledge": { emoji: '🧠', color: '#9C27B0' },
  "Locations": { emoji: '📍', color: '#4CAF50' },
  "Memes & Internet Culture": { emoji: '😂', color: '#FF9800' },
  "Tech & AI": { emoji: '💻', color: '#607D8B' },
  "VIT Pune & Pune Local": { emoji: '🏫', color: '#00BCD4' }
};

const CATEGORY_NAMES = Object.keys(CATEGORIES);

function getCategoryMeta(name) {
  return CATEGORIES[name] || null;
}

function getAllCategories() {
  return Object.entries(CATEGORIES).map(([name, meta]) => ({
    name,
    ...meta,
  }));
}

module.exports = { CATEGORIES, CATEGORY_NAMES, getCategoryMeta, getAllCategories };

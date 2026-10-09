/**
 * Category registry — name, emoji, and UI color for each themed category.
 */

const CATEGORIES = {
  "General Knowledge": { emoji: '🧠', color: '#9C27B0' },
  "Movies": { emoji: '🎬', color: '#F5C518' },
  "Animals": { emoji: '🐾', color: '#4CAF50' },
  "Trending Topics": { emoji: '🔥', color: '#FF9800' }
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

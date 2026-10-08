const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '../data/usageStats.json');

let stats = {
  domains: {},
  subfields: {},
  keywords: {},
  playerHistory: {},
  disabled: {
    subfields: {},
    keywords: {}
  },
  previousEventKeyword: null,
  previousDomainSubfield: {}
};

function save() {
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

function load() {
  if (fs.existsSync(statsPath)) {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    if (!stats.disabled) stats.disabled = { subfields: {}, keywords: {} };
    if (!stats.previousDomainSubfield) stats.previousDomainSubfield = {};
  }
}

load();

module.exports = {
  recordUsage: (domain, subfield, keywordId, playerTokens) => {
    const now = Date.now();
    stats.domains[domain] = now;
    stats.subfields[`${domain}::${subfield}`] = now;
    
    if (!stats.keywords[keywordId]) stats.keywords[keywordId] = { count: 0, lastUsedAt: 0 };
    stats.keywords[keywordId].count++;
    stats.keywords[keywordId].lastUsedAt = now;

    stats.previousEventKeyword = keywordId;
    stats.previousDomainSubfield[domain] = subfield;

    playerTokens.forEach(t => {
      if (t) {
        if (!stats.playerHistory[t]) stats.playerHistory[t] = [];
        if (!stats.playerHistory[t].includes(keywordId)) {
          stats.playerHistory[t].push(keywordId);
        }
      }
    });
    save();
  },
  getDomainLastUsed: (domain) => stats.domains[domain] || 0,
  getSubfieldLastUsed: (domain, subfield) => stats.subfields[`${domain}::${subfield}`] || 0,
  getKeywordLastUsed: (keywordId) => (stats.keywords[keywordId] ? stats.keywords[keywordId].lastUsedAt : 0),
  getKeywordCount: (keywordId) => (stats.keywords[keywordId] ? stats.keywords[keywordId].count : 0),
  getPreviousEventKeyword: () => stats.previousEventKeyword,
  getPreviousDomainSubfield: (domain) => stats.previousDomainSubfield[domain],
  
  hasAnyPlayerSeen: (keywordId, playerTokens) => {
    for (const t of playerTokens) {
      if (t && stats.playerHistory[t] && stats.playerHistory[t].includes(keywordId)) return true;
    }
    return false;
  },

  isSubfieldDisabled: (domain, subfield) => !!stats.disabled.subfields[`${domain}::${subfield}`],
  isKeywordDisabled: (keywordId) => !!stats.disabled.keywords[keywordId],
  
  setSubfieldDisabled: (domain, subfield, disabled) => {
    stats.disabled.subfields[`${domain}::${subfield}`] = disabled;
    save();
  },
  setKeywordDisabled: (keywordId, disabled) => {
    stats.disabled.keywords[keywordId] = disabled;
    save();
  },

  resetRotation: () => {
    stats.domains = {};
    stats.subfields = {};
    stats.keywords = {};
    stats.previousEventKeyword = null;
    stats.previousDomainSubfield = {};
    save();
  },
  
  getStats: () => stats
};

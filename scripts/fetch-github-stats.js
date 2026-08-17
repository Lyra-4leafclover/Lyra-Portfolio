// scripts/fetch-github-stats.js
// Runs in GitHub Actions & local CLI. Fetches contribution + language data and writes
// them to static JSON files that the website can fetch with zero API rate limits.

const fs = require('fs');
const path = require('path');

const USERNAME = 'Lyra-4leafclover';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const headers = TOKEN
  ? { Authorization: `Bearer ${TOKEN}`, 'User-Agent': USERNAME }
  : { 'User-Agent': USERNAME };

async function fetchContributions() {
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USERNAME}`);
  if (!res.ok) throw new Error(`Contributions API failed: ${res.status}`);
  const data = await res.json();

  const commitMap = {};
  let totalCount = 0;
  (data.contributions || []).forEach(item => {
    if (item.count > 0) {
      commitMap[item.date] = item.count;
      totalCount += item.count;
    }
  });

  return { commitMap, totalCount, generatedAt: new Date().toISOString() };
}

async function fetchLanguages() {
  const repoRes = await fetch(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100`,
    { headers }
  );
  if (!repoRes.ok) throw new Error(`Repos API failed: ${repoRes.status}`);
  const repos = await repoRes.json();

  const totals = {};
  for (const repo of repos) {
    if (repo.fork) continue;
    try {
      const lRes = await fetch(repo.languages_url, { headers });
      if (!lRes.ok) {
        console.error(`Languages fetch failed for ${repo.name}: ${lRes.status}`);
        continue;
      }
      const lData = await lRes.json();
      for (const [lang, bytes] of Object.entries(lData)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    } catch(e) {
      console.error(`Languages fetch error for ${repo.name}:`, e);
    }
  }

  return { totals, generatedAt: new Date().toISOString() };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching contributions data...');
  const contributions = await fetchContributions();
  fs.writeFileSync(
    path.join(outDir, 'contributions.json'),
    JSON.stringify(contributions, null, 2)
  );
  console.log(`Wrote contributions.json — ${contributions.totalCount} total contributions`);

  console.log('Fetching language breakdown data...');
  const languages = await fetchLanguages();
  fs.writeFileSync(
    path.join(outDir, 'languages.json'),
    JSON.stringify(languages, null, 2)
  );
  console.log(`Wrote languages.json — ${Object.keys(languages.totals).length} languages detected`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

// scripts/fetch-github-stats.js
// Runs in GitHub Actions & local CLI. Fetches contribution + language data using GitHub's
// authenticated GraphQL API (not the cached HTML calendar page) when GH_TOKEN is present,
// and writes them to static JSON files the website can fetch with zero API rate limits and zero staleness.

const fs = require('fs');
const path = require('path');

const USERNAME = 'Lyra-4leafclover';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const headers = TOKEN
  ? {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': USERNAME,
      'Content-Type': 'application/json',
    }
  : {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Content-Type': 'application/json',
    };

// 1. FETCH CONTRIBUTIONS VIA GRAPHQL (authenticated, structured, no HTML scraping/caching issues)
async function fetchContributionsGraphQL() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 365);

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables: {
        login: USERNAME,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL contributions request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const calendar = json.data.user.contributionsCollection.contributionCalendar;
  const commitMap = {};
  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.contributionCount > 0) {
        commitMap[day.date] = day.contributionCount;
      }
    }
  }

  return { commitMap, totalCount: calendar.totalContributions };
}

// Fallback HTML parser if unauthenticated local CLI run
async function fetchContributionsHTML() {
  const res = await fetch(`https://github.com/users/${USERNAME}/contributions`, { headers });
  if (!res.ok) throw new Error(`Official GitHub contributions HTML failed: ${res.status}`);
  const html = await res.text();

  let totalCount = 0;
  const headingMatch = html.match(/([0-9,]+)\s+contributions\s+in\s+the\s+last\s+year/i);
  if (headingMatch) {
    totalCount = parseInt(headingMatch[1].replace(/,/g, ''), 10);
  }

  const commitMap = {};
  const dayMatches = html.matchAll(/data-date="([0-9]{4}-[0-9]{2}-[0-9]{2})"[^>]*id="([^"]+)"/g);
  
  for (const match of dayMatches) {
    const dStr = match[1];
    const compId = match[2];
    const ttRegex = new RegExp(`for="${compId}"[^>]*>\\s*([0-9]+)\\s+contribution`, 'i');
    const ttMatch = html.match(ttRegex);
    if (ttMatch) {
      const cnt = parseInt(ttMatch[1], 10);
      if (cnt > 0) commitMap[dStr] = cnt;
    }
  }

  const sumCount = Object.values(commitMap).reduce((a, b) => a + b, 0);
  if (totalCount === 0) totalCount = sumCount;

  return { commitMap, totalCount };
}

async function fetchContributions() {
  if (TOKEN) {
    try {
      console.log('Fetching contributions via GitHub GraphQL API...');
      return await fetchContributionsGraphQL();
    } catch (err) {
      console.warn('GraphQL fetch failed, falling back to HTML calendar:', err.message);
    }
  }
  console.log('Fetching contributions via official GitHub HTML calendar...');
  return await fetchContributionsHTML();
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
    } catch (e) {
      console.error(`Languages fetch error for ${repo.name}:`, e);
    }
  }

  return { totals };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  const { commitMap, totalCount } = await fetchContributions();

  fs.writeFileSync(
    path.join(outDir, 'contributions.json'),
    JSON.stringify({ commitMap, totalCount, generatedAt }, null, 2)
  );
  console.log(`Wrote contributions.json — ${totalCount} total contributions`);

  console.log('Fetching language breakdown data...');
  try {
    const { totals } = await fetchLanguages();
    if (Object.keys(totals).length > 0) {
      fs.writeFileSync(
        path.join(outDir, 'languages.json'),
        JSON.stringify({ totals, generatedAt }, null, 2)
      );
      console.log(`Wrote languages.json — ${Object.keys(totals).length} languages detected`);
    }
  } catch (err) {
    console.warn('Language sync skipped:', err.message);
  }
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

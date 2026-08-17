// scripts/fetch-github-stats.js
// Runs in GitHub Actions. Fetches contribution + language data straight from
// GitHub's own APIs (GraphQL for contributions, REST for languages) and
// writes them to static JSON files the website can fetch with zero API calls
// and zero third-party staleness.

const fs = require('fs');
const path = require('path');

const USERNAME = 'Lyra-4leafclover';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.warn('No GH_TOKEN/GITHUB_TOKEN found — GraphQL contributions fetch will require authenticated token in GitHub Actions.');
}

const headers = TOKEN
  ? { Authorization: `Bearer ${TOKEN}`, 'User-Agent': USERNAME }
  : { 'User-Agent': USERNAME };

async function fetchContributions() {
  if (TOKEN) {
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
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
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { username: USERNAME } }),
    });

    if (res.ok) {
      const json = await res.json();
      if (!json.errors && json.data && json.data.user) {
        const calendar = json.data.user.contributionsCollection.contributionCalendar;
        const commitMap = {};
        const totalCount = calendar.totalContributions;

        calendar.weeks.forEach(week => {
          week.contributionDays.forEach(day => {
            if (day.contributionCount > 0) {
              commitMap[day.date] = day.contributionCount;
            }
          });
        });

        return { commitMap, totalCount };
      }
    }
  }

  // Fallback to jogruber API if running locally without token
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

  return { commitMap, totalCount };
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

  return { totals };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  console.log('Fetching contributions data via GraphQL / API...');
  const { commitMap, totalCount } = await fetchContributions();
  fs.writeFileSync(
    path.join(outDir, 'contributions.json'),
    JSON.stringify({ commitMap, totalCount, generatedAt }, null, 2)
  );
  console.log(`Wrote contributions.json — ${totalCount} total contributions`);

  console.log('Fetching language breakdown data...');
  const { totals } = await fetchLanguages();
  fs.writeFileSync(
    path.join(outDir, 'languages.json'),
    JSON.stringify({ totals, generatedAt }, null, 2)
  );
  console.log(`Wrote languages.json — ${Object.keys(totals).length} languages detected`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

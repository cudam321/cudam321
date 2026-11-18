// Fetches what the profile is drawn from and writes data/profile.json.
// Only public data is asked for, and only the fields listed below are written: never the raw API response.
// Usage: GITHUB_TOKEN=... node scripts/fetch.mjs      (in Actions the workflow passes its own token)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.config.json'), 'utf8'));
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is not set');
const MAX_COMMIT_PAGES = 20;                       // newest 2,000 commits per featured repository are enough to draw its pond

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { authorization: `bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': 'profile-readme-build' }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors || json.message)}`);
  return json.data;
}
const repoFields = 'name owner{login} description isPrivate isArchived isFork stargazerCount primaryLanguage{name} pushedAt url';
const pickRepo = (r) => ({ owner: r.owner.login, name: r.name, description: r.description || '', language: r.primaryLanguage?.name || '', stars: r.stargazerCount, pushedAt: r.pushedAt.slice(0, 10), url: r.url, archived: r.isArchived });

const { user } = await gql(`query($login:String!){ user(login:$login){
  login name websiteUrl twitterUsername company
  contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date weekday contributionCount } } } }
  repositories(first:100, privacy:PUBLIC, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}){ nodes{ ${repoFields} } }
} }`, { login: config.username });
if (!user) throw new Error(`no such user: ${config.username}`);

const featured = [];
for (const full of config.featured) {
  const [owner, name] = full.split('/');
  let after = null, total = 0, repo = null; const dates = [];
  for (let page = 0; page < MAX_COMMIT_PAGES; page++) {
    const { repository } = await gql(`query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){ ${repoFields}
      defaultBranchRef{ target{ ... on Commit{ history(first:100, after:$after){ totalCount pageInfo{ hasNextPage endCursor } nodes{ committedDate } } } } } } }`, { owner, name, after });
    if (!repository) throw new Error(`${full}: not found`);
    if (repository.isPrivate) throw new Error(`${full} is private: it cannot be featured`);
    repo = repository;
    const h = repository.defaultBranchRef?.target?.history;
    if (!h) break;
    total = h.totalCount; dates.push(...h.nodes.map((n) => n.committedDate.slice(0, 16)));   // to the minute; nothing else about a commit is kept
    if (!h.pageInfo.hasNextPage) break;
    after = h.pageInfo.endCursor;
  }
  featured.push({ ...pickRepo(repo), commits: { total, dates } });
}

const out = {
  fetched: new Date().toISOString().slice(0, 10),
  user: { login: user.login, name: user.name || user.login, websiteUrl: user.websiteUrl || '', twitterUsername: user.twitterUsername || '', company: user.company || '' },
  calendar: { total: user.contributionsCollection.contributionCalendar.totalContributions, weeks: user.contributionsCollection.contributionCalendar.weeks.map((w) => w.contributionDays.map((d) => ({ date: d.date, weekday: d.weekday, count: d.contributionCount }))) },
  repos: user.repositories.nodes.filter((r) => !r.isPrivate).map(pickRepo),
  featured,
};
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'profile.json'), JSON.stringify(out));
console.log(`data/profile.json: ${out.calendar.total} contributions, ${out.repos.length} public repositories, featured: ${featured.map((f) => `${f.name} (${f.commits.dates.length} of ${f.commits.total} commits)`).join(', ')}`);

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const configDir = path.join(os.homedir(), '.config', 'git-viewer');
const recentReposFile = path.join(configDir, 'recent-repos.json');
const MAX_RECENT = 10;

export interface RecentRepo {
  path: string;
  name: string;
  lastOpened: string;
}

function readRecentRepos(): RecentRepo[] {
  try {
    const data = fs.readFileSync(recentReposFile, 'utf8');
    return JSON.parse(data) as RecentRepo[];
  } catch {
    return [];
  }
}

function writeRecentRepos(repos: RecentRepo[]): void {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(recentReposFile, JSON.stringify(repos, null, 2));
  } catch {
    // Ignore write errors — not critical
  }
}

export function addRecentRepo(repoPath: string): void {
  const name = path.basename(repoPath);
  const repos = readRecentRepos().filter(r => r.path !== repoPath);
  repos.unshift({ path: repoPath, name, lastOpened: new Date().toISOString() });
  writeRecentRepos(repos.slice(0, MAX_RECENT));
}

export function getRecentRepos(): RecentRepo[] {
  return readRecentRepos();
}

export function removeRecentRepo(repoPath: string): void {
  writeRecentRepos(readRecentRepos().filter(r => r.path !== repoPath));
}

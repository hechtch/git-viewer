import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export class GitService {
  constructor(private repoPath: string) {
    this.repoPath = path.resolve(repoPath);
  }

  private async git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.repoPath,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin' },
    });
    return stdout.trim();
  }

  async isValidRepo(): Promise<boolean> {
    try {
      await this.git('rev-parse', '--git-dir');
      return true;
    } catch {
      return false;
    }
  }

  async getBranches(): Promise<{ branches: BranchInfo[]; current: string }> {
    const current = await this.git('branch', '--show-current');
    const localRaw = await this.git(
      'for-each-ref',
      '--format=%(refname:short)\t%(objectname:short)\t%(committerdate:iso8601)\t%(upstream:short)\t%(upstream:track)\t%(subject)',
      'refs/heads/'
    );
    const parsed = localRaw.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t');
      const name = parts[0];
      const sha = parts[1];
      const date = parts[2];
      const upstream = parts[3] || undefined;
      const upstreamTrack = parts[4] || '';
      const subject = parts.slice(5).join('\t');
      const { localAhead, localBehind } = parseUpstreamTrack(upstreamTrack);
      return { name, sha, date, subject, upstream, localAhead, localBehind };
    });

    // Also fetch remote tracking refs so the graph can determine their merged status.
    const remoteRaw = await this.git(
      'for-each-ref',
      '--format=%(refname:short)\t%(objectname:short)\t%(committerdate:iso8601)\t%(subject)',
      'refs/remotes/'
    ).catch(() => '');
    const remotes = remoteRaw.split('\n').filter(Boolean)
      .map((line) => {
        const parts = line.split('\t');
        return { name: parts[0], sha: parts[1], date: parts[2], subject: parts.slice(3).join('\t') };
      })
      .filter(r => !r.name.endsWith('/HEAD')); // skip symbolic refs like origin/HEAD

    // Compute ahead/behind relative to the stable trunk branch, not the current checkout.
    // This way "merged" means "merged into master/main", regardless of what's checked out.
    const preferredBases = ['master', 'main', 'develop'];
    const baseBranch = preferredBases.find(n => parsed.some(b => b.name === n))
      || current
      || parsed[0]?.name;

    const revListCount = async (base: string, ref: string): Promise<{ ahead: number; behind: number }> => {
      try {
        const counts = await this.git('rev-list', '--left-right', '--count', `${base}...${ref}`);
        const [behind, ahead] = counts.split('\t').map(Number);
        return { ahead, behind };
      } catch {
        return { ahead: 0, behind: 0 };
      }
    };

    // For remote branches, always compare against trunk.
    // For local branches, also check whether a closer local branch (smaller ahead count)
    // makes a better base — e.g. a feature branch off a release candidate should report
    // "ahead of rc-1.0" rather than "ahead of main".
    const computeAheadBehind = async (refName: string, checkNearerBase = false):
        Promise<{ ahead: number; behind: number; base: string } | Record<string, never>> => {
      if (!baseBranch || refName === baseBranch) return {};

      const trunkCounts = await revListCount(baseBranch, refName);
      let best: { base: string; ahead: number; behind: number } = { base: baseBranch, ...trunkCounts };

      if (checkNearerBase) {
        for (const candidate of parsed) {
          if (candidate.name === refName || candidate.name === baseBranch) continue;
          try {
            const aheadRaw = await this.git('rev-list', '--count', `${candidate.name}..${refName}`);
            const aheadCount = parseInt(aheadRaw, 10);
            if (aheadCount < best.ahead) {
              const behindRaw = await this.git('rev-list', '--count', `${refName}..${candidate.name}`);
              best = { base: candidate.name, ahead: aheadCount, behind: parseInt(behindRaw, 10) };
            }
          } catch { /* skip candidates that fail */ }
        }
      }

      return best;
    };

    // Build a set of remote ref names for fast lookup
    const remoteRefNames = new Set(remotes.map(r => r.name));

    // For local branches with no configured upstream, check if a matching remote ref exists
    // (e.g. origin/branch-name). This handles the case where the branch was pushed without -u.
    const resolveLocalPushStatus = async (b: typeof parsed[0]): Promise<typeof parsed[0]> => {
      if (b.upstream) return b; // already has a configured upstream
      // Look for any remote ref matching <remote>/<branchname>
      const matchingRemote = remotes.find(r => {
        const slash = r.name.indexOf('/');
        return slash !== -1 && r.name.slice(slash + 1) === b.name;
      });
      if (!matchingRemote) return b; // no remote branch found — truly unpushed
      try {
        const counts = await this.git('rev-list', '--left-right', '--count', `${matchingRemote.name}...${b.name}`);
        const [localBehind, localAhead] = counts.split('\t').map(Number);
        return { ...b, upstream: matchingRemote.name, localAhead, localBehind };
      } catch {
        return { ...b, upstream: matchingRemote.name, localAhead: 0, localBehind: 0 };
      }
    };

    const [localBranches, remoteBranches] = await Promise.all([
      Promise.all(parsed.map(async (b) => ({ ...await resolveLocalPushStatus(b), ...await computeAheadBehind(b.name, true) }))),
      Promise.all(remotes.map(async (r) => ({ ...r, isRemote: true, ...await computeAheadBehind(r.name) }))),
    ]);

    return { branches: [...localBranches, ...remoteBranches], current };
  }

  async getCommits(options: {
    branch?: string;
    all?: boolean;
    limit?: number;
  }): Promise<CommitSummary[]> {
    const args = [
      'log',
      '--format=%H\t%h\t%an\t%aI\t%P\t%s',
      `--max-count=${options.limit || 50}`,
    ];
    if (options.all) {
      args.push('--all');
    } else if (options.branch) {
      args.push(options.branch);
    }
    const raw = await this.git(...args);
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map((line) => {
      const [sha, short, author, date, parents, ...rest] = line.split('\t');
      return {
        sha,
        short,
        author,
        date,
        parents: parents ? parents.split(' ') : [],
        message: rest.join('\t'),
      };
    });
  }

  async getCommitDetail(sha: string): Promise<CommitDetail> {
    const info = await this.git('log', '-1', '--format=%H\t%h\t%an\t%aI\t%P\t%B', sha);
    const [hash, short, author, date, parents, ...rest] = info.split('\t');
    const message = rest.join('\t');
    const parentShas = parents ? parents.split(' ').filter(Boolean) : [];
    const isMerge = parentShas.length > 1;

    let files: { status: string; path: string }[];
    let diff: string;

    if (isMerge) {
      // Diff against first parent to show what the merge brought in
      const diffStat = await this.git('diff-tree', '-r', '--name-status', parentShas[0], sha);
      files = diffStat.split('\n').filter(Boolean).map((line) => {
        const [status, ...fileParts] = line.split('\t');
        return { status: statusLabel(status), path: fileParts.join('\t') };
      });

      // Try combined diff (--cc) to surface conflict resolutions
      const ccDiff = await this.git('diff-tree', '--cc', '--no-commit-id', sha).catch(() => '');
      if (ccDiff.trim()) {
        diff = ccDiff;
      } else {
        // Clean merge — show first-parent diff so the view isn't blank
        diff = await this.git('diff-tree', '-p', parentShas[0], sha);
      }
    } else {
      const diffStat = await this.git('diff-tree', '--no-commit-id', '-r', '--name-status', sha);
      files = diffStat.split('\n').filter(Boolean).map((line) => {
        const [status, ...fileParts] = line.split('\t');
        return { status: statusLabel(status), path: fileParts.join('\t') };
      });
      diff = await this.git('diff-tree', '-p', '--no-commit-id', sha);
    }

    return {
      sha: hash,
      short,
      author,
      date,
      parents: parentShas,
      message,
      files,
      diff,
    };
  }

  async getStatus(): Promise<RepoStatus> {
    const branch = await this.git('branch', '--show-current');
    const raw = await this.git('status', '--porcelain');
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const untracked: string[] = [];

    for (const line of raw.split('\n').filter(Boolean)) {
      const index = line[0];
      const worktree = line[1];
      const filePath = line.substring(3);

      if (index === '?' && worktree === '?') {
        untracked.push(filePath);
      } else {
        if (index !== ' ' && index !== '?') {
          staged.push({ status: statusLabel(index), path: filePath });
        }
        if (worktree !== ' ' && worktree !== '?') {
          unstaged.push({ status: statusLabel(worktree), path: filePath });
        }
      }
    }

    return { branch, staged, unstaged, untracked };
  }

  async getFileTree(ref: string): Promise<TreeEntry[]> {
    const raw = await this.git('ls-tree', '-r', '--name-only', ref);
    return raw.split('\n').filter(Boolean).map((p) => ({ path: p }));
  }

  async getFileContent(ref: string, filePath: string): Promise<string> {
    return this.git('show', `${ref}:${filePath}`);
  }

  async getGraph(): Promise<GraphEntry[]> {
    const raw = await this.git(
      'log',
      '--all',
      '--format=%H\t%h\t%P\t%D\t%aI\t%s',
      '--topo-order'
    );
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map((line) => {
      const [sha, short, parents, refs, date, ...rest] = line.split('\t');
      return {
        sha,
        short,
        parents: parents ? parents.split(' ') : [],
        refs: refs ? refs.split(', ').map((r) => r.trim()).filter(Boolean) : [],
        date,
        message: rest.join('\t'),
      };
    });
  }
}

function parseUpstreamTrack(track: string): { localAhead: number; localBehind: number } {
  const aheadMatch = track.match(/ahead (\d+)/);
  const behindMatch = track.match(/behind (\d+)/);
  return {
    localAhead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
    localBehind: behindMatch ? parseInt(behindMatch[1], 10) : 0,
  };
}

function statusLabel(code: string): string {
  const map: Record<string, string> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    U: 'unmerged',
  };
  return map[code] || code;
}

export interface BranchInfo {
  name: string;
  sha: string;
  date: string;
  subject: string;
  ahead?: number;      // commits ahead of base; undefined for the trunk branch itself
  behind?: number;     // commits behind base; undefined for the trunk branch itself
  base?: string;       // branch this is compared against (trunk, or nearest ancestor branch)
  upstream?: string;   // remote tracking ref, e.g. "origin/main"; undefined = no remote
  localAhead?: number; // unpushed commits (local commits not on remote)
  localBehind?: number;// commits on remote not yet fetched locally
  isRemote?: boolean;  // true for refs/remotes/* entries
}

export interface CommitSummary {
  sha: string;
  short: string;
  author: string;
  date: string;
  parents: string[];
  message: string;
}

export interface CommitDetail extends CommitSummary {
  files: FileChange[];
  diff: string;
}

export interface FileChange {
  status: string;
  path: string;
}

export interface RepoStatus {
  branch: string;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

export interface TreeEntry {
  path: string;
}

export interface GraphEntry {
  sha: string;
  short: string;
  parents: string[];
  refs: string[];
  date: string;
  message: string;
}

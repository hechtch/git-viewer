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
    const raw = await this.git(
      'for-each-ref',
      '--format=%(refname:short)\t%(objectname:short)\t%(committerdate:iso8601)\t%(subject)',
      'refs/heads/'
    );
    const parsed = raw.split('\n').filter(Boolean).map((line) => {
      const [name, sha, date, ...rest] = line.split('\t');
      return { name, sha, date, subject: rest.join('\t') };
    });

    // Compute ahead/behind relative to default branch (current branch)
    const baseBranch = current || parsed[0]?.name;
    const branches: BranchInfo[] = await Promise.all(
      parsed.map(async (b) => {
        if (!baseBranch || b.name === baseBranch) {
          return { ...b, ahead: 0, behind: 0 };
        }
        try {
          const counts = await this.git(
            'rev-list', '--left-right', '--count',
            `${baseBranch}...${b.name}`
          );
          const [behind, ahead] = counts.split('\t').map(Number);
          return { ...b, ahead, behind };
        } catch {
          return { ...b, ahead: 0, behind: 0 };
        }
      })
    );

    return { branches, current };
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
      '--format=%H\t%h\t%P\t%D\t%s',
      '--topo-order'
    );
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map((line) => {
      const [sha, short, parents, refs, ...rest] = line.split('\t');
      return {
        sha,
        short,
        parents: parents ? parents.split(' ') : [],
        refs: refs ? refs.split(', ').map((r) => r.trim()).filter(Boolean) : [],
        message: rest.join('\t'),
      };
    });
  }
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
  ahead: number;
  behind: number;
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
  message: string;
}

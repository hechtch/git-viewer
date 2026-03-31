import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface BranchInfo {
  name: string;
  sha: string;
  date: string;
  subject: string;
  ahead?: number;      // commits ahead of base; undefined for the trunk branch itself
  behind?: number;     // commits behind base; undefined for the trunk branch itself
  base?: string;       // branch this is compared against (trunk, or nearest ancestor branch)
  upstream?: string;   // remote tracking ref e.g. "origin/main"; undefined = no remote
  localAhead?: number; // unpushed commits (local commits not on remote)
  localBehind?: number;// commits on remote not yet fetched locally
  isRemote?: boolean;  // true for refs/remotes/* entries
}

export interface BranchesResponse {
  branches: BranchInfo[];
  current: string;
}

export interface CommitSummary {
  sha: string;
  short: string;
  author: string;
  date: string;
  parents: string[];
  message: string;
}

export interface FileChange {
  status: string;
  path: string;
}

export interface CommitDetail extends CommitSummary {
  files: FileChange[];
  diff: string;
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

export interface RepoInfo {
  path: string | null;
}

export interface RecentRepo {
  path: string;
  name: string;
  lastOpened: string;
}

export interface BrowseEntry {
  name: string;
  type: 'dir' | 'file';
  isGitRepo: boolean;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

@Injectable({ providedIn: 'root' })
export class GitApiService {
  private http = inject(HttpClient);

  private base = '/api';

  pickFolder(startPath?: string): Observable<{ path: string } | null> {
    return this.http.post<{ path: string }>(
      `${this.base}/browse/pick`,
      { path: startPath },
      { observe: 'response' }
    ).pipe(
      map(res => res.status === 204 ? null : res.body)
    );
  }

  browse(path?: string): Observable<BrowseResponse> {
    let params = new HttpParams();
    if (path) params = params.set('path', path);
    return this.http.get<BrowseResponse>(`${this.base}/browse`, { params });
  }

  getRepo(): Observable<RepoInfo> {
    return this.http.get<RepoInfo>(`${this.base}/repo`);
  }

  setRepo(path: string): Observable<RepoInfo> {
    return this.http.post<RepoInfo>(`${this.base}/repo`, { path });
  }

  getRecentRepos(): Observable<RecentRepo[]> {
    return this.http.get<RecentRepo[]>(`${this.base}/recent-repos`);
  }

  removeRecentRepo(path: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/recent-repos`, { body: { path } });
  }

  getBranches(): Observable<BranchesResponse> {
    return this.http.get<BranchesResponse>(`${this.base}/branches`);
  }

  getCommits(branch?: string, all = false, limit = 50): Observable<CommitSummary[]> {
    let params = new HttpParams().set('limit', limit);
    if (all) params = params.set('all', 'true');
    else if (branch) params = params.set('branch', branch);
    return this.http.get<CommitSummary[]>(`${this.base}/commits`, { params });
  }

  getCommitDetail(sha: string): Observable<CommitDetail> {
    return this.http.get<CommitDetail>(`${this.base}/commits/${sha}`);
  }

  getGraph(): Observable<GraphEntry[]> {
    return this.http.get<GraphEntry[]>(`${this.base}/commits/graph`);
  }

  getStatus(): Observable<RepoStatus> {
    return this.http.get<RepoStatus>(`${this.base}/status`);
  }

  getFileTree(ref: string): Observable<TreeEntry[]> {
    return this.http.get<TreeEntry[]>(`${this.base}/files/${ref}`);
  }

  getFileContent(ref: string, path: string): Observable<string> {
    return this.http.get(`${this.base}/files/${ref}/${path}`, { responseType: 'text' });
  }
}

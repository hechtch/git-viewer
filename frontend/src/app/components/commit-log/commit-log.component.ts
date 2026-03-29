import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitApiService, BranchInfo, CommitSummary, GraphEntry } from '../../services/git-api.service';
import { CommitGraphComponent } from '../commit-graph/commit-graph.component';

interface CommitRow extends CommitSummary {
  refs: string[];
}

@Component({
  selector: 'app-commit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, CommitGraphComponent],
  template: `
    <div class="commit-log">
      <div class="log-header">
        <span *ngIf="branch" class="viewing-label">
          Commits on <span class="branch-name">{{ branch }}</span>
        </span>
        <span *ngIf="!branch" class="viewing-label">All branches</span>
        <span class="count" *ngIf="branch && filteredCommits.length !== commits.length">
          {{ filteredCommits.length }}/{{ commits.length }}
        </span>
        <span class="count" *ngIf="branch && filteredCommits.length === commits.length && commits.length">
          {{ commits.length }}
        </span>
        <button *ngIf="!branch" class="toggle-merged-btn" (click)="showMerged = !showMerged">
          {{ showMerged ? 'Hide merged' : 'Show merged' }}
        </button>
      </div>
      <div class="search-row">
        <input
          class="search-input"
          type="text"
          placeholder="Search commits… (regex ok)"
          [(ngModel)]="searchQuery"
          (ngModelChange)="onSearchChange()"
        />
        <span *ngIf="searchError" class="search-error">{{ searchError }}</span>
      </div>

      <!-- Graph view for "All branches" -->
      <app-commit-graph
        *ngIf="!branch && visibleGraphEntries.length"
        [entries]="visibleGraphEntries"
        [branches]="visibleBranchInfos"
        (commitSelected)="selectCommit($event)">
      </app-commit-graph>

      <!-- Flat list for single branch -->
      <ng-container *ngIf="branch">
        <div
          *ngFor="let c of filteredCommits"
          class="commit-row"
          [class.selected]="c.sha === selectedSha"
          [class.merge]="c.parents.length > 1"
          (click)="selectCommit(c.sha)">

          <div class="commit-main">
            <span class="short-hash">{{ c.short }}</span>
            <span class="message">{{ c.message }}</span>
          </div>

          <div class="commit-meta">
            <span *ngFor="let ref of c.refs" class="ref-badge" [class.head-badge]="ref.startsWith('HEAD')">
              {{ ref.replace('HEAD -> ', '') }}
            </span>
            <span class="author">{{ c.author }}</span>
            <span class="date">{{ c.date | date:'MMM d' }}</span>
          </div>
        </div>
      </ng-container>

      <div *ngIf="branch && filteredCommits.length === 0" class="empty">
        {{ commits.length ? 'No matches' : 'No commits found' }}
      </div>
    </div>
  `,
  styles: [`
    .commit-log { padding: 12px; }
    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .viewing-label { font-size: 13px; color: #9399b2; }
    .branch-name { color: #89b4fa; font-weight: 600; }
    .count {
      font-size: 11px;
      background: #313244;
      color: #9399b2;
      padding: 1px 7px;
      border-radius: 10px;
    }
    .commit-row {
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      border-left: 2px solid transparent;
    }
    .commit-row:hover { background: #313244; }
    .commit-row.selected { background: #45475a; }
    .commit-row.merge { border-left-color: #cba6f7; }
    .commit-main {
      display: flex;
      gap: 10px;
      align-items: baseline;
    }
    .short-hash {
      font-family: monospace;
      color: #f9e2af;
      font-size: 12px;
      flex-shrink: 0;
    }
    .message {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cdd6f4;
    }
    .commit-meta {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-top: 3px;
      padding-left: 2px;
      flex-wrap: wrap;
    }
    .ref-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: #313244;
      color: #89b4fa;
      border: 1px solid #45475a;
      font-family: monospace;
    }
    .head-badge {
      background: #a6e3a1;
      color: #1e1e2e;
      border-color: #a6e3a1;
    }
    .author { color: #9399b2; font-size: 11px; margin-left: auto; }
    .date { color: #6c7086; font-size: 11px; flex-shrink: 0; }
    .empty { color: #9399b2; font-style: italic; padding: 16px; }
    .toggle-merged-btn {
      margin-left: auto;
      font-size: 10px;
      color: #6c7086;
      background: none;
      border: 1px solid #45475a;
      border-radius: 3px;
      padding: 2px 7px;
      cursor: pointer;
    }
    .toggle-merged-btn:hover { color: #cdd6f4; border-color: #6c7086; }
    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .search-input {
      flex: 1;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 12px;
      padding: 4px 8px;
      outline: none;
      font-family: monospace;
    }
    .search-input:focus { border-color: #89b4fa; }
    .search-input::placeholder { color: #45475a; }
    .search-error { font-size: 11px; color: #f38ba8; }
  `]
})
export class CommitLogComponent implements OnChanges {
  @Input() branch: string | null = null;
  @Input() repoPath: string | null = null;
  @Output() commitSelected = new EventEmitter<string>();

  commits: CommitRow[] = [];
  graphEntries: GraphEntry[] = [];
  branchInfos: BranchInfo[] = [];
  currentBranch = '';
  selectedSha = '';
  showMerged = false;
  searchQuery = '';
  searchError = '';
  private searchRegex: RegExp | null = null;

  onSearchChange() {
    this.searchError = '';
    if (!this.searchQuery) {
      this.searchRegex = null;
      return;
    }
    try {
      this.searchRegex = new RegExp(this.searchQuery, 'i');
    } catch {
      this.searchError = 'invalid regex';
      this.searchRegex = null;
    }
  }

  private matchesSearch(message: string, author: string, sha: string): boolean {
    if (!this.searchRegex) return true;
    return this.searchRegex.test(message) || this.searchRegex.test(author) || this.searchRegex.test(sha);
  }

  get filteredCommits(): CommitRow[] {
    if (!this.searchRegex) return this.commits;
    return this.commits.filter(c => this.matchesSearch(c.message, c.author, c.sha));
  }

  get mergedNames(): Set<string> {
    return new Set(
      this.branchInfos
        .filter(b => (b.ahead ?? -1) === 0 && b.name !== this.currentBranch)
        .map(b => b.name)
    );
  }

  get visibleBranchInfos(): BranchInfo[] {
    if (this.showMerged) return this.branchInfos;
    const merged = this.mergedNames;
    return this.branchInfos.filter(b => !merged.has(b.name));
  }

  get visibleGraphEntries(): GraphEntry[] {
    if (this.showMerged) return this.graphEntries;
    const merged = this.mergedNames;
    return this.graphEntries.map(e => ({
      ...e,
      refs: e.refs.filter(r => !merged.has(r.replace('HEAD -> ', ''))),
    }));
  }

  // sha -> refs map built from graph data
  private refMap = new Map<string, string[]>();

  constructor(private api: GitApiService) {}

  ngOnChanges() {
    this.loadCommits();
  }

  loadCommits() {
    this.api.getGraph().subscribe(graph => {
      this.graphEntries = graph;
      this.refMap.clear();
      for (const g of graph) {
        if (g.refs.length) this.refMap.set(g.sha, g.refs);
      }
      if (this.branch) {
        this.fetchCommits();
      }
    });
    this.api.getBranches().subscribe(res => {
      this.branchInfos = res.branches;
      this.currentBranch = res.current;
    });
  }

  fetchCommits() {
    this.api.getCommits(this.branch!).subscribe(commits => {
      this.commits = commits.map(c => ({
        ...c,
        refs: this.refMap.get(c.sha) ?? [],
      }));
    });
  }

  selectCommit(sha: string) {
    this.selectedSha = sha;
    this.commitSelected.emit(sha);
  }
}

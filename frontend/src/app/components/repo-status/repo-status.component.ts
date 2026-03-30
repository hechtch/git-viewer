import { Component, OnInit, inject } from '@angular/core';

import { GitApiService, RepoStatus } from '../../services/git-api.service';

@Component({
    selector: 'app-repo-status',
    imports: [],
    template: `
    @if (status) {
      <div class="status-bar">
        <span class="branch-badge">{{ status.branch || 'detached' }}</span>
        @if (isClean) {
          <span class="status-item clean">Clean working tree</span>
        }
        @if (status.staged.length) {
          <span class="status-item staged">
            {{ status.staged.length }} staged
          </span>
        }
        @if (status.unstaged.length) {
          <span class="status-item unstaged">
            {{ status.unstaged.length }} unstaged
          </span>
        }
        @if (status.untracked.length) {
          <span class="status-item untracked">
            {{ status.untracked.length }} untracked
          </span>
        }
        <button class="refresh-btn" (click)="load()">Refresh</button>
      </div>
    }
    `,
    styles: [`
    .status-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 13px;
      border-bottom: 1px solid #313244;
    }
    .branch-badge {
      background: #89b4fa;
      color: #1e1e2e;
      padding: 2px 10px;
      border-radius: 4px;
      font-weight: 600;
    }
    .status-item { padding: 2px 8px; border-radius: 3px; }
    .clean { color: #a6e3a1; }
    .staged { background: #313244; color: #a6e3a1; }
    .unstaged { background: #313244; color: #fab387; }
    .untracked { background: #313244; color: #9399b2; }
    .refresh-btn {
      margin-left: auto;
      background: #313244;
      color: #cdd6f4;
      border: 1px solid #45475a;
      padding: 3px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .refresh-btn:hover { background: #45475a; }
  `]
})
export class RepoStatusComponent implements OnInit {
  private api = inject(GitApiService);

  status: RepoStatus | null = null;

  get isClean(): boolean {
    return !!this.status &&
      !this.status.staged.length &&
      !this.status.unstaged.length &&
      !this.status.untracked.length;
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getStatus().subscribe(s => this.status = s);
  }
}

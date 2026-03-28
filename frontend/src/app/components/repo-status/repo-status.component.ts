import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitApiService, RepoStatus } from '../../services/git-api.service';

@Component({
  selector: 'app-repo-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="status-bar" *ngIf="status">
      <span class="branch-badge">{{ status.branch || 'detached' }}</span>
      <span class="status-item clean" *ngIf="isClean">Clean working tree</span>
      <span class="status-item staged" *ngIf="status.staged.length">
        {{ status.staged.length }} staged
      </span>
      <span class="status-item unstaged" *ngIf="status.unstaged.length">
        {{ status.unstaged.length }} unstaged
      </span>
      <span class="status-item untracked" *ngIf="status.untracked.length">
        {{ status.untracked.length }} untracked
      </span>
      <button class="refresh-btn" (click)="load()">Refresh</button>
    </div>
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
  status: RepoStatus | null = null;

  get isClean(): boolean {
    return !!this.status &&
      !this.status.staged.length &&
      !this.status.unstaged.length &&
      !this.status.untracked.length;
  }

  constructor(private api: GitApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.api.getStatus().subscribe(s => this.status = s);
  }
}

import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GitApiService, RecentRepo } from '../../services/git-api.service';

@Component({
    selector: 'app-repo-selector',
    standalone: true,
    templateUrl: './repo-selector.component.html',
    styleUrls: ['./repo-selector.component.css']
})
export class RepoSelectorComponent implements OnInit {
  private api = inject(GitApiService);

  @Input() canCancel = false;
  @Input() initialPath = '';

  @Output() repoOpened = new EventEmitter<string>();

  recentRepos: RecentRepo[] = [];
  loading = false;
  picking = false;
  loadingPath: string | null = null;
  error = '';

  ngOnInit(): void {
    this.api.getRecentRepos().subscribe({
      next: (repos) => { this.recentRepos = repos; },
      error: () => {}
    });
  }

  pickFolder(): void {
    this.picking = true;
    this.error = '';
    this.api.pickFolder(this.initialPath || undefined).subscribe({
      next: (result) => {
        this.picking = false;
        if (result?.path) {
          this.openPath(result.path);
        }
      },
      error: () => {
        this.picking = false;
        this.error = 'Could not open folder picker (is the backend running?)';
      }
    });
  }

  openRecent(repo: RecentRepo): void {
    if (this.loadingPath || this.loading) return;
    this.loadingPath = repo.path;
    this.error = '';
    this.openPath(repo.path);
  }

  openPath(path: string): void {
    this.loading = true;
    this.error = '';
    this.api.setRepo(path).subscribe({
      next: (info) => {
        this.loading = false;
        this.loadingPath = null;
        this.repoOpened.emit(info.path!);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.loadingPath = null;
        this.error = (err.error as { error?: string })?.error ?? 'Failed to open repository';
      }
    });
  }

  cancel(): void {
    this.repoOpened.emit('');
  }

  removeRecent(repo: RecentRepo, event: MouseEvent): void {
    event.stopPropagation();
    this.recentRepos = this.recentRepos.filter(r => r.path !== repo.path);
    this.api.removeRecentRepo(repo.path).subscribe();
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }
}

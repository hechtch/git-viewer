import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GitApiService, RecentRepo, BrowseResponse, BrowseEntry } from '../../services/git-api.service';

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
  loadingPath: string | null = null;
  error = '';

  // In-app folder browser state
  browsing = false;
  browseData: BrowseResponse | null = null;
  browseLoading = false;
  browseError = '';

  ngOnInit(): void {
    this.api.getRecentRepos().subscribe({
      next: (repos) => { this.recentRepos = repos; },
      error: () => {}
    });
  }

  startBrowse(): void {
    this.browsing = true;
    this.browseError = '';
    this.navigateTo(this.initialPath || undefined);
  }

  navigateTo(path?: string): void {
    this.browseLoading = true;
    this.browseError = '';
    this.api.browse(path).subscribe({
      next: (data) => {
        this.browseData = data;
        this.browseLoading = false;
      },
      error: () => {
        this.browseError = 'Could not load directory';
        this.browseLoading = false;
      }
    });
  }

  selectBrowseEntry(entry: BrowseEntry): void {
    if (!this.browseData) return;
    const fullPath = this.browseData.path.replace(/\/$/, '') + '/' + entry.name;
    if (entry.isGitRepo) {
      this.browsing = false;
      this.openPath(fullPath);
    } else {
      this.navigateTo(fullPath);
    }
  }

  cancelBrowse(): void {
    this.browsing = false;
    this.browseData = null;
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

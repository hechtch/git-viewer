import { Component, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GitApiService, RecentRepo } from '../../services/git-api.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {
  private api = inject(GitApiService);

  @Output() repoOpened = new EventEmitter<string>();
  @Output() openSelector = new EventEmitter<void>();

  recentRepos: RecentRepo[] = [];
  loadingPath: string | null = null;
  error = '';

  ngOnInit(): void {
    this.api.getRecentRepos().subscribe({
      next: (repos) => { this.recentRepos = repos; },
      error: () => {}
    });
  }

  openRecent(repo: RecentRepo): void {
    if (this.loadingPath) return;
    this.loadingPath = repo.path;
    this.error = '';
    this.api.setRepo(repo.path).subscribe({
      next: (info) => {
        this.loadingPath = null;
        this.repoOpened.emit(info.path!);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingPath = null;
        this.error = (err.error as { error?: string })?.error ?? 'Failed to open repository';
      }
    });
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }
}

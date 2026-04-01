import { Component, OnInit, HostListener, inject } from '@angular/core';
import { GitApiService } from './services/git-api.service';
import { LandingComponent } from './components/landing/landing.component';
import { RepoSelectorComponent } from './components/repo-selector/repo-selector.component';
import { RepoStatusComponent } from './components/repo-status/repo-status.component';
import { CommitLogComponent } from './components/commit-log/commit-log.component';
import { CommitDetailComponent } from './components/commit-detail/commit-detail.component';
import { FileTreeComponent } from './components/file-tree/file-tree.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    standalone: true,
    imports: [
        LandingComponent,
        RepoSelectorComponent,
        RepoStatusComponent,
        CommitLogComponent,
        CommitDetailComponent,
        FileTreeComponent,
    ]
})
export class AppComponent implements OnInit {
  private api = inject(GitApiService);

  repoPath: string | null = null;
  showSelector = false;
  contentZoom = 1.0;

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      this.contentZoom = +(Math.min(3.0, this.contentZoom + 0.1)).toFixed(1);
    } else if (event.key === '-') {
      event.preventDefault();
      this.contentZoom = +(Math.max(0.4, this.contentZoom - 0.1)).toFixed(1);
    } else if (event.key === '0') {
      event.preventDefault();
      this.contentZoom = 1.0;
    }
  }

  selectedCommit: string | null = null;
  activeTab: 'timeline' | 'commits' | 'files' = 'timeline';
  refreshTick = 0;
  logPanelHeight = Math.round(window.innerHeight * 0.45);

  ngOnInit(): void {
    this.api.getRepo().subscribe({
      next: (info) => {
        // info.path is null when no repo is selected — landing page handles that
        this.repoPath = info.path;
      },
      error: () => {
        // Backend unreachable — landing page shown (repoPath stays null)
      }
    });
  }

  onRepoOpened(path: string): void {
    if (path) {
      this.repoPath = path;
      this.selectedCommit = null;
    }
    this.showSelector = false;
  }

  openSelector(): void {
    this.showSelector = true;
  }

  onRefreshed(): void {
    this.refreshTick++;
  }

  startResizeLog(event: MouseEvent): void {
    event.preventDefault();
    const startY = event.clientY;
    const startH = this.logPanelHeight;
    const onMove = (e: MouseEvent) => {
      this.logPanelHeight = Math.max(80, startH + e.clientY - startY);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onCommitSelected(sha: string): void {
    this.selectedCommit = sha;
  }

  get repoName(): string {
    if (!this.repoPath) return '';
    return this.repoPath.split('/').pop() || this.repoPath;
  }
}

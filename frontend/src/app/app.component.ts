import { Component, OnInit, HostListener } from '@angular/core';
import { GitApiService } from './services/git-api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  repoPath: string | null = null;
  showSelector = false;
  contentZoom = 1.0;

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
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

  selectedBranch: string | null = null;
  selectedCommit: string | null = null;
  activeTab: 'commits' | 'files' = 'commits';

  constructor(private api: GitApiService) {}

  ngOnInit() {
    this.api.getRepo().subscribe({
      next: (info) => {
        this.repoPath = info.path;
      },
      error: () => {
        // Backend unreachable or no repo configured — show selector
        this.showSelector = true;
      }
    });
  }

  onRepoOpened(path: string) {
    if (path) {
      this.repoPath = path;
      this.selectedBranch = null;
      this.selectedCommit = null;
    }
    this.showSelector = false;
  }

  openSelector() {
    this.showSelector = true;
  }

  onBranchSelected(branch: string | null) {
    this.selectedBranch = branch;
    this.selectedCommit = null;
  }

  onCommitSelected(sha: string) {
    this.selectedCommit = sha;
  }

  get repoName(): string {
    if (!this.repoPath) return '';
    return this.repoPath.split('/').pop() || this.repoPath;
  }
}

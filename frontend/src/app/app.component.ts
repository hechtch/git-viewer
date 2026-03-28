import { Component, OnInit } from '@angular/core';
import { GitApiService } from './services/git-api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  repoPath: string | null = null;
  showSelector = false;

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

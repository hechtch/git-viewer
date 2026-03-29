import { Component, Input, OnChanges, Output, EventEmitter, inject } from '@angular/core';

import { GitApiService, BranchInfo } from '../../services/git-api.service';

@Component({
    selector: 'app-branch-list',
    imports: [],
    template: `
    <div class="branch-panel">
      <div class="panel-header">
        <h3>Branches</h3>
        <button class="toggle-merged-btn" (click)="showMerged = !showMerged">
          {{ showMerged ? 'Hide merged' : 'Show merged' }}
        </button>
      </div>
      <button
        class="branch-btn"
        [class.active]="selectedBranch === null"
        (click)="selectAll()"
        (keydown)="onBtnKeydown($event)">
        All branches
      </button>
      @for (b of visibleBranches; track b) {
        <button
          class="branch-btn"
          [class.active]="selectedBranch === b.name"
          [class.current]="b.name === currentBranch"
          [class.unmerged]="b.name !== currentBranch && (b.ahead ?? -1) > 0"
          (click)="select(b.name)"
          (keydown)="onBtnKeydown($event)">
          <span class="branch-name">{{ b.name }}</span>
          <span class="branch-status">
            @if (b.name === currentBranch) {
              <span class="current-marker">HEAD</span>
            }
            @if (b.name !== currentBranch) {
              @if ((b.ahead ?? -1) === 0) {
                <span class="merged">merged</span>
              }
              @if ((b.ahead ?? 0) > 0) {
                <span class="ahead-behind">
                  <span class="ahead" [title]="'commits ahead of trunk'">▲{{ b.ahead }}</span>
                  @if ((b.behind ?? 0) > 0) {
                    <span class="behind" [title]="'commits behind trunk'">▼{{ b.behind }}</span>
                  }
                </span>
              }
            }
          </span>
        </button>
      }
    </div>
    `,
    styles: [`
    .branch-panel {
      padding: 12px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    h3 {
      margin: 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9399b2;
    }
    .toggle-merged-btn {
      font-size: 10px;
      color: #6c7086;
      background: none;
      border: 1px solid #45475a;
      border-radius: 3px;
      padding: 2px 7px;
      cursor: pointer;
    }
    .toggle-merged-btn:hover {
      color: #cdd6f4;
      border-color: #6c7086;
    }
    .branch-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 6px 10px;
      margin-bottom: 2px;
      background: none;
      border: none;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      gap: 8px;
    }
    .branch-btn:hover { background: #313244; }
    .branch-btn.active { background: #45475a; }
    .branch-btn.unmerged { color: #cdd6f4; font-weight: 600; }
    .branch-btn.unmerged .branch-name { color: #cdd6f4; }
    .branch-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .branch-status {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
    .merged {
      font-size: 10px;
      font-family: monospace;
      color: #6c7086;
      background: #1e1e2e;
      border: 1px solid #45475a;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .ahead-behind {
      font-size: 10px;
      font-family: monospace;
      display: flex;
      gap: 5px;
    }
    .ahead {
      color: #a6e3a1;
    }
    .behind {
      color: #fab387;
    }
    .current-marker {
      font-size: 10px;
      background: #a6e3a1;
      color: #1e1e2e;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 600;
    }
  `]
})
export class BranchListComponent implements OnChanges {
  private api = inject(GitApiService);

  @Input() repoPath: string | null = null;
  @Output() branchSelected = new EventEmitter<string | null>();

  branches: BranchInfo[] = [];
  currentBranch = '';
  selectedBranch: string | null = null;
  showMerged = false;

  get visibleBranches(): BranchInfo[] {
    return this.showMerged ? this.branches : this.branches.filter(b => (b.ahead ?? -1) !== 0 || b.name === this.currentBranch);
  }

  ngOnChanges(): void {
    this.loadBranches();
  }

  loadBranches(): void {
    this.api.getBranches().subscribe(res => {
      this.branches = res.branches;
      this.currentBranch = res.current;
      // Default to "All branches" (graph view)
      this.selectedBranch = null;
      this.branchSelected.emit(null);
    });
  }

  onBtnKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const panel = (event.target as HTMLElement).closest('.branch-panel');
    if (!panel) return;
    const buttons = Array.from(panel.querySelectorAll<HTMLElement>('button.branch-btn'));
    const idx = buttons.indexOf(event.target as HTMLElement);
    const next = event.key === 'ArrowDown' ? buttons[idx + 1] : buttons[idx - 1];
    if (next) {
      next.focus();
      next.click();
    }
  }

  select(name: string): void {
    this.selectedBranch = name;
    this.branchSelected.emit(name);
  }

  selectAll(): void {
    this.selectedBranch = null;
    this.branchSelected.emit(null);
  }
}

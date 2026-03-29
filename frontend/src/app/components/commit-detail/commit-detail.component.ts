import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitApiService, CommitDetail } from '../../services/git-api.service';

interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'file-header' | 'hunk-header' | 'neutral';
}

@Component({
    selector: 'app-commit-detail',
    imports: [CommonModule],
    template: `
    @if (detail) {
      <div class="detail">
        <div class="meta-block">
          <div class="msg">{{ detail.message }}</div>
          <div class="meta-row">
            <span class="sha">{{ detail.sha }}</span>
            <button class="copy-btn" (click)="copySha(detail.sha)" [title]="'Copy SHA'">{{ copyConfirmed ? '✓' : '⎘' }}</button>
            <span class="sep">·</span>
            <span class="author">{{ detail.author }}</span>
            <span class="sep">·</span>
            <span class="date">{{ detail.date | date:'MMM d, y, h:mm a' }}</span>
            @if (detail.parents.length) {
              <span class="sep">·</span>
              <span class="label">parent@if (detail.parents.length > 1) {
                s
              }</span>
              @for (p of detail.parents; track p) {
                <span class="parent-sha">{{ p.substring(0, 7) }}</span>
              }
            }
          </div>
          <div class="files-row">
            @for (f of detail.files; track f) {
              <span class="file-chip" [class]="f.status">
                <span class="file-status">{{ f.status[0].toUpperCase() }}</span>{{ f.path }}
              </span>
            }
          </div>
        </div>
        <div class="diff-section">
          <pre class="diff">@for (line of diffLines; track $index) {<span [class]="line.type">{{ line.text }}
</span>}</pre>
        </div>
      </div>
    }
    
    @if (!detail && !sha) {
      <div class="placeholder">
        Select a commit to view details
      </div>
    }
    @if (!detail && sha) {
      <div class="placeholder">
        Loading...
      </div>
    }
    `,
    styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .detail {
      padding: 12px;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      box-sizing: border-box;
    }
    .placeholder {
      padding: 32px;
      text-align: center;
      color: #9399b2;
      font-style: italic;
    }
    .meta-block {
      flex-shrink: 0;
      padding-bottom: 6px;
      margin-bottom: 4px;
    }
    .msg { color: #cdd6f4; font-size: 14px; font-weight: 600; margin-bottom: 3px; }
    .meta-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      font-size: 11px;
      color: #6c7086;
      font-family: monospace;
      margin-bottom: 4px;
    }
    .sha { color: #f9e2af; }
    .copy-btn {
      font-size: 11px;
      background: none;
      border: 1px solid #45475a;
      border-radius: 3px;
      color: #6c7086;
      padding: 0 3px;
      cursor: pointer;
      line-height: 1.3;
    }
    .copy-btn:hover { color: #cdd6f4; border-color: #6c7086; }
    .sep { color: #45475a; }
    .author { color: #9399b2; }
    .date { color: #6c7086; }
    .label { color: #45475a; }
    .parent-sha { color: #f9e2af; margin-left: 2px; }
    .files-row { display: flex; flex-wrap: wrap; gap: 4px; }
    .file-chip {
      font-family: monospace;
      font-size: 11px;
      color: #9399b2;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 3px;
      padding: 1px 5px;
      white-space: nowrap;
    }
    .file-chip .file-status { margin-right: 3px; font-weight: 700; }
    .file-chip.added .file-status { color: #a6e3a1; }
    .file-chip.modified .file-status { color: #f9e2af; }
    .file-chip.deleted .file-status { color: #f38ba8; }
    .diff-section {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .diff {
      flex: 1;
      min-height: 0;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      padding: 8px 12px;
      overflow: auto;
      font-size: calc(12px * var(--text-zoom, 1));
      line-height: 1.5;
      color: #cdd6f4;
      white-space: pre;
      margin: 0;
    }
    .diff .added { color: #a6e3a1; background: rgba(166,227,161,0.08); display: block; }
    .diff .removed { color: #f38ba8; background: rgba(243,139,168,0.08); display: block; }
    .diff .file-header { color: #45475a; font-size: 10px; line-height: 1.1; display: block; }
    .diff .hunk-header { color: #6c7086; font-size: 11px; line-height: 1.3; display: block; }
    .diff .neutral { display: block; }
  `]
})
export class CommitDetailComponent implements OnChanges {
  private api = inject(GitApiService);

  @Input() sha: string | null = null;

  detail: CommitDetail | null = null;
  copyConfirmed = false;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  get diffLines(): DiffLine[] {
    if (!this.detail?.diff) return [];
    return this.detail.diff.split('\n').map(text => {
      let type: DiffLine['type'] = 'neutral';
      if (text.startsWith('+') && !text.startsWith('+++')) type = 'added';
      else if (text.startsWith('-') && !text.startsWith('---')) type = 'removed';
      else if (text.startsWith('@@')) type = 'hunk-header';
      else if (text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('+++') || text.startsWith('---')) type = 'file-header';
      return { text, type };
    });
  }

  copySha(sha: string): void {
    navigator.clipboard.writeText(sha).then(() => {
      this.copyConfirmed = true;
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => { this.copyConfirmed = false; }, 1500);
    });
  }

  ngOnChanges(): void {
    if (this.sha) {
      this.detail = null;
      this.api.getCommitDetail(this.sha).subscribe(d => this.detail = d);
    } else {
      this.detail = null;
    }
  }
}

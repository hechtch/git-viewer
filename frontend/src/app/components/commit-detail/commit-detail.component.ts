import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitApiService, CommitDetail } from '../../services/git-api.service';

interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'header' | 'neutral';
}

@Component({
  selector: 'app-commit-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="detail" *ngIf="detail">
      <div class="header">
        <h3>{{ detail.message }}</h3>
        <div class="meta">
          <span class="sha-row">
            <span class="sha">{{ detail.sha }}</span>
            <button class="copy-btn" (click)="copySha(detail.sha)" [title]="'Copy SHA'">
              {{ copyConfirmed ? '✓' : '⎘' }}
            </button>
          </span>
          <span class="author">{{ detail.author }}</span>
          <span class="date">{{ detail.date | date:'medium' }}</span>
        </div>
        <div class="parents" *ngIf="detail.parents.length">
          Parents: <span *ngFor="let p of detail.parents" class="parent-sha">{{ p.substring(0, 7) }}</span>
        </div>
      </div>

      <div class="files">
        <h4>Changed Files ({{ detail.files.length }})</h4>
        <div *ngFor="let f of detail.files" class="file-entry" [ngClass]="f.status">
          <span class="status-badge">{{ f.status }}</span>
          <span class="file-path">{{ f.path }}</span>
        </div>
      </div>

      <div class="diff-section">
        <h4>Diff</h4>
        <pre class="diff"><ng-container *ngFor="let line of diffLines"><span [class]="line.type">{{ line.text }}
</span></ng-container></pre>
      </div>
    </div>

    <div class="placeholder" *ngIf="!detail && !sha">
      Select a commit to view details
    </div>
    <div class="placeholder" *ngIf="!detail && sha">
      Loading...
    </div>
  `,
  styles: [`
    .detail { padding: 12px; }
    .placeholder {
      padding: 32px;
      text-align: center;
      color: #9399b2;
      font-style: italic;
    }
    .header {
      border-bottom: 1px solid #313244;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    h3 { margin: 0 0 6px 0; color: #cdd6f4; font-size: 16px; }
    h4 { margin: 12px 0 6px 0; color: #a6adc8; font-size: 13px; }
    .meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #9399b2;
    }
    .sha-row { display: flex; align-items: center; gap: 4px; }
    .sha { font-family: monospace; color: #f9e2af; }
    .copy-btn {
      font-size: 12px;
      background: none;
      border: 1px solid #45475a;
      border-radius: 3px;
      color: #9399b2;
      padding: 0 4px;
      cursor: pointer;
      line-height: 1.4;
    }
    .copy-btn:hover { color: #cdd6f4; border-color: #6c7086; }
    .parents {
      font-size: 12px;
      color: #9399b2;
      margin-top: 4px;
    }
    .parent-sha {
      font-family: monospace;
      color: #f9e2af;
      margin-left: 6px;
    }
    .file-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 13px;
    }
    .status-badge {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      background: #313244;
      min-width: 60px;
      text-align: center;
    }
    .added .status-badge { color: #a6e3a1; }
    .modified .status-badge { color: #f9e2af; }
    .deleted .status-badge { color: #f38ba8; }
    .file-path { font-family: monospace; color: #cdd6f4; font-size: 12px; }
    .diff {
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      color: #cdd6f4;
      white-space: pre;
      max-height: 500px;
      overflow-y: auto;
    }
    .diff .added { color: #a6e3a1; background: rgba(166,227,161,0.08); display: block; }
    .diff .removed { color: #f38ba8; background: rgba(243,139,168,0.08); display: block; }
    .diff .header { color: #89b4fa; display: block; }
    .diff .neutral { display: block; }
  `]
})
export class CommitDetailComponent implements OnChanges {
  @Input() sha: string | null = null;

  detail: CommitDetail | null = null;
  copyConfirmed = false;
  private copyTimer: any = null;

  get diffLines(): DiffLine[] {
    if (!this.detail?.diff) return [];
    return this.detail.diff.split('\n').map(text => {
      let type: DiffLine['type'] = 'neutral';
      if (text.startsWith('+') && !text.startsWith('+++')) type = 'added';
      else if (text.startsWith('-') && !text.startsWith('---')) type = 'removed';
      else if (text.startsWith('@@') || text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('+++') || text.startsWith('---')) type = 'header';
      return { text, type };
    });
  }

  copySha(sha: string) {
    navigator.clipboard.writeText(sha).then(() => {
      this.copyConfirmed = true;
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => { this.copyConfirmed = false; }, 1500);
    });
  }

  constructor(private api: GitApiService) {}

  ngOnChanges() {
    if (this.sha) {
      this.detail = null;
      this.api.getCommitDetail(this.sha).subscribe(d => this.detail = d);
    } else {
      this.detail = null;
    }
  }
}

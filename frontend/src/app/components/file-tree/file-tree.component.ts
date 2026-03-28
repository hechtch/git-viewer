import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitApiService, TreeEntry } from '../../services/git-api.service';

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="file-tree" *ngIf="ref">
      <h3>Files at {{ ref }}</h3>
      <div *ngFor="let f of files" class="file-row" (click)="viewFile(f.path)"
           [class.selected]="f.path === selectedFile">
        <span class="icon">{{ getIcon(f.path) }}</span>
        <span class="path">{{ f.path }}</span>
      </div>

      <div class="file-content-wrapper" *ngIf="fileContent !== null">
        <h4>{{ selectedFile }}</h4>
        <pre class="file-content"><code>{{ fileContent }}</code></pre>
      </div>
    </div>
  `,
  styles: [`
    .file-tree { padding: 12px; }
    h3 { margin: 0 0 8px 0; font-size: 14px; color: #cdd6f4; }
    h4 {
      margin: 12px 0 6px 0;
      font-size: 13px;
      color: #89b4fa;
      font-family: monospace;
    }
    .file-row {
      display: flex;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .file-row:hover { background: #313244; }
    .file-row.selected { background: #45475a; }
    .icon { width: 16px; text-align: center; }
    .path { font-family: monospace; color: #cdd6f4; font-size: 12px; }
    .file-content {
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      color: #cdd6f4;
      overflow: auto;
      max-height: 400px;
      white-space: pre;
    }
  `]
})
export class FileTreeComponent implements OnChanges {
  @Input() ref: string | null = null;

  files: TreeEntry[] = [];
  selectedFile: string | null = null;
  fileContent: string | null = null;

  constructor(private api: GitApiService) {}

  ngOnChanges() {
    this.selectedFile = null;
    this.fileContent = null;
    if (this.ref) {
      this.api.getFileTree(this.ref).subscribe(f => this.files = f);
    }
  }

  viewFile(path: string) {
    if (!this.ref) return;
    this.selectedFile = path;
    this.api.getFileContent(this.ref, path).subscribe(c => this.fileContent = c);
  }

  getIcon(path: string): string {
    if (path.endsWith('.py')) return 'Py';
    if (path.endsWith('.md')) return 'Md';
    if (path.endsWith('.json')) return '{}';
    return '--';
  }
}

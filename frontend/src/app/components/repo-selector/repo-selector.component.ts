import { Component, Input, Output, EventEmitter, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { GitApiService } from '../../services/git-api.service';

@Component({
    selector: 'app-repo-selector',
    imports: [FormsModule],
    templateUrl: './repo-selector.component.html',
    styleUrls: ['./repo-selector.component.css']
})
export class RepoSelectorComponent {
  private api = inject(GitApiService);

  @Input() canCancel = false;
  @Input() initialPath = '';

  @Output() repoOpened = new EventEmitter<string>();

  selectedPath = '';
  loading = false;
  picking = false;
  error = '';
  dragOver = false;

  pickFolder(): void {
    this.picking = true;
    this.error = '';
    this.api.pickFolder(this.initialPath || undefined).subscribe({
      next: (result) => {
        this.picking = false;
        if (result?.path) {
          this.selectedPath = result.path;
          this.open();
        }
      },
      error: () => {
        this.picking = false;
        this.error = 'Could not open folder picker (is the backend running?)';
      }
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(): void {
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;

    const items = event.dataTransfer?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        // Browsers can't expose the full OS path from a drop.
        // Populate the text field with the folder name so the user can
        // complete the path manually, or use Browse above for a full path.
        this.selectedPath = entry.name;
        this.error = 'Drag & drop cannot get the full path — use Browse or type the full path below.';
        return;
      }
    }
  }

  cancel(): void {
    this.repoOpened.emit('');
  }

  open(): void {
    const trimmed = this.selectedPath.trim();
    if (!trimmed) return;
    this.loading = true;
    this.error = '';
    this.api.setRepo(trimmed).subscribe({
      next: (info) => {
        this.loading = false;
        this.repoOpened.emit(info.path);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.error = (err.error as { error?: string })?.error ?? 'Failed to open repository';
      }
    });
  }
}

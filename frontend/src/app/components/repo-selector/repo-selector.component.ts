import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitApiService } from '../../services/git-api.service';

@Component({
  selector: 'app-repo-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './repo-selector.component.html',
  styleUrls: ['./repo-selector.component.css'],
})
export class RepoSelectorComponent {
  @Input() canCancel = false;
  @Input() initialPath = '';

  @Output() repoOpened = new EventEmitter<string>();

  selectedPath = '';
  loading = false;
  picking = false;
  error = '';
  dragOver = false;

  constructor(private api: GitApiService) {}

  pickFolder() {
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

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave() {
    this.dragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;

    const items = event.dataTransfer?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
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

  cancel() {
    this.repoOpened.emit('');
  }

  open() {
    const trimmed = this.selectedPath.trim();
    if (!trimmed) return;
    this.loading = true;
    this.error = '';
    this.api.setRepo(trimmed).subscribe({
      next: (info) => {
        this.loading = false;
        this.repoOpened.emit(info.path);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Failed to open repository';
      }
    });
  }
}

import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { AppComponent } from './app.component';

import { RepoStatusComponent } from './components/repo-status/repo-status.component';
import { RepoSelectorComponent } from './components/repo-selector/repo-selector.component';
import { BranchListComponent } from './components/branch-list/branch-list.component';
import { CommitLogComponent } from './components/commit-log/commit-log.component';
import { CommitDetailComponent } from './components/commit-detail/commit-detail.component';
import { FileTreeComponent } from './components/file-tree/file-tree.component';
import { CommitGraphComponent } from './components/commit-graph/commit-graph.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    RepoStatusComponent,
    RepoSelectorComponent,
    BranchListComponent,
    CommitLogComponent,
    CommitDetailComponent,
    FileTreeComponent,
    CommitGraphComponent,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

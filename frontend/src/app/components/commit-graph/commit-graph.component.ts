import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ViewChild, ElementRef, inject } from '@angular/core';

import { BranchInfo, GraphEntry } from '../../services/git-api.service';
import { computeLayout, LayoutNode, LayoutEdge } from './graph-layout';

interface RenderEdge {
  path: string;
  color: string;
}

interface RefBadge {
  label: string;
  width: number;
  color: string;
  textColor: string;
  borderColor: string;
}

interface StatusBadge {
  label: string;
  width: number;
  isMerged: boolean;
}

interface RenderNode extends LayoutNode {
  badges: RefBadge[];
}

export interface LaneLabel {
  name: string;
  col: number;
  color: string;
  merged?: boolean;
}

@Component({
    selector: 'app-commit-graph',
    imports: [],
    templateUrl: './commit-graph.component.html',
    styleUrls: ['./commit-graph.component.css']
})
export class CommitGraphComponent implements OnChanges {
  @Input() entries: GraphEntry[] = [];
  @Input() branches: BranchInfo[] = [];
  @Input() showMerged = true;
  @Input() jumpToBranch: string | null = null;
  @Input() viewMode: 'lr' | 'td' = 'lr';
  @Input() reversed = false;
  @Output() commitSelected = new EventEmitter<string>();

  readonly COMMIT_SPACING = 60;
  readonly LANE_HEIGHT = 44;
  readonly NODE_RADIUS = 5;
  readonly MARGIN = 36;
  readonly CHAR_WIDTH = 7;
  readonly BADGE_PAD = 12;
  // Extra space at the start of the time axis in TD mode for lane labels
  readonly TD_LABEL_OFFSET = 28;

  @ViewChild('graphScroll') graphScrollRef: ElementRef<HTMLElement> | undefined;
  private hostEl = inject(ElementRef<HTMLElement>);

  renderNodes: RenderNode[] = [];
  allEdges: RenderEdge[] = [];
  laneLabels: LaneLabel[] = [];
  laneStatus = new Map<number, StatusBadge>();
  selectedSha = '';
  selectedCol = -1;
  toastMessage = '';
  toastVisible = false;

  private childrenOf = new Map<string, string[]>();

  svgWidth = 800;
  svgHeight = 200;
  zoom = 1.0;

  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.0;
  readonly ZOOM_STEP = 0.15;

  private _maxCol = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private mouseInactivityTimer: ReturnType<typeof setTimeout> | null = null;

  mouseActive = false;
  usingKeyboard = false;

  get showMouseHover(): boolean {
    return this.mouseActive && !this.usingKeyboard;
  }

  onMouseMove(): void {
    if (this.usingKeyboard) this.usingKeyboard = false;
    if (!this.mouseActive) this.mouseActive = true;
    if (this.mouseInactivityTimer) clearTimeout(this.mouseInactivityTimer);
    this.mouseInactivityTimer = setTimeout(() => { this.mouseActive = false; }, 2000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entries'] || changes['branches'] || changes['showMerged'] ||
        changes['viewMode'] || changes['reversed']) {
      const nodes = computeLayout(this.entries);
      this._maxCol = 0;
      for (const n of nodes) {
        if (n.col > this._maxCol) this._maxCol = n.col;
      }
      this.buildRenderNodes(nodes);
      this.buildLaneLabels(nodes);
      this.buildEdges();
      this.computeDimensions();
      this.buildChildrenMap();
    }
    if (this.jumpToBranch) {
      this.jumpToNamedBranch(this.jumpToBranch);
    }
  }

  private jumpToNamedBranch(name: string): void {
    const node = this.renderNodes.find(n =>
      n.entry.refs.some(r => r.replace('HEAD -> ', '') === name)
    );
    if (node) {
      this.selectNode(node);
      setTimeout(() => this.scrollToNode(node));
    }
  }

  // ── Position helpers ──────────────────────────────────────────────────────

  /** Position along the time axis (commits). Row 0 = newest. */
  private timePos(row: number): number {
    const maxRow = this.entries.length - 1;
    const offset = this.viewMode === 'td' ? this.MARGIN + this.TD_LABEL_OFFSET : this.MARGIN;
    return this.reversed
      ? (maxRow - row) * this.COMMIT_SPACING + offset
      : row * this.COMMIT_SPACING + offset;
  }

  /** Position along the lane axis (branches). */
  private lanePos(col: number): number {
    return col * this.LANE_HEIGHT + this.MARGIN;
  }

  /** Node X: time axis in LR, lane axis in TD. */
  nodeX(row: number, col: number): number {
    return this.viewMode === 'lr' ? this.timePos(row) : this.lanePos(col);
  }

  /** Node Y: lane axis in LR, time axis in TD. */
  nodeY(row: number, col: number): number {
    return this.viewMode === 'lr' ? this.lanePos(col) : this.timePos(row);
  }

  /** The lane's position on its primary axis (Y in LR, X in TD). */
  lanePrimaryPos(col: number): number {
    return this.lanePos(col);
  }

  // Badge positioning helpers
  badgeRectX(row: number, col: number, badgeWidth: number, i: number): number {
    if (this.viewMode === 'lr') return this.nodeX(row, col) - badgeWidth / 2;
    return this.nodeX(row, col) + this.NODE_RADIUS + 6;
  }
  badgeRectY(row: number, col: number, i: number): number {
    if (this.viewMode === 'lr') return this.nodeY(row, col) - 26 - i * 20;
    return this.nodeY(row, col) - 8 + i * 20;
  }
  badgeTextX(row: number, col: number, i: number): number {
    if (this.viewMode === 'lr') return this.nodeX(row, col);
    return this.nodeX(row, col) + this.NODE_RADIUS + 6 + 6;
  }
  badgeTextY(row: number, col: number, i: number): number {
    if (this.viewMode === 'lr') return this.nodeY(row, col) - 14 - i * 20;
    return this.nodeY(row, col) + 4 + i * 20;
  }
  get badgeTextAnchor(): string { return this.viewMode === 'lr' ? 'middle' : 'start'; }

  // Hash label helpers
  hashLabelX(row: number, col: number): number {
    return this.viewMode === 'lr' ? this.nodeX(row, col) : this.nodeX(row, col) + this.NODE_RADIUS + 4;
  }
  hashLabelY(row: number, col: number): number {
    return this.viewMode === 'lr' ? this.nodeY(row, col) + 18 : this.nodeY(row, col) + 4;
  }
  get hashTextAnchor(): string { return this.viewMode === 'lr' ? 'middle' : 'start'; }

  // ── Interaction ───────────────────────────────────────────────────────────

  onCommitClick(sha: string): void {
    this.selectedSha = sha;
    const node = this.renderNodes.find(n => n.entry.sha === sha);
    this.selectedCol = node ? node.col : -1;
    this.commitSelected.emit(sha);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.renderNodes.length) return;

    const selected = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
    if (!selected) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        this.selectNode(this.renderNodes[0]);
        event.preventDefault();
      }
      return;
    }

    let target: RenderNode | undefined;
    // In TD mode, Up/Down navigate along time; Left/Right navigate across lanes.
    // In LR mode, Left/Right navigate time; Up/Down navigate lanes.
    const isTD = this.viewMode === 'td';

    const newerKey   = isTD ? 'ArrowUp'    : 'ArrowRight';
    const olderKey   = isTD ? 'ArrowDown'  : 'ArrowLeft';
    const laneUpKey  = isTD ? 'ArrowLeft'  : 'ArrowUp';
    const laneDnKey  = isTD ? 'ArrowRight' : 'ArrowDown';

    switch (event.key) {
      case newerKey:
        target = this.findNeighborInLane(selected, -1);
        if (!target) {
          const lane = this.laneLabels.find(l => l.col === selected.col);
          this.showToast(`At head of ${lane?.name ?? 'lane'} (${selected.entry.short})`);
        }
        break;

      case olderKey: {
        target = this.findNeighborInLane(selected, 1);
        if (!target) {
          if (selected.col !== 0 && selected.entry.parents.length > 0) {
            target = this.renderNodes.find(n => n.entry.sha === selected.entry.parents[0]);
          } else {
            const lane = this.laneLabels.find(l => l.col === selected.col);
            this.showToast(`First commit of ${lane?.name ?? 'lane'} (${selected.entry.short})`);
          }
        }
        break;
      }

      case laneUpKey:
        target = this.findCrossLaneNeighbor(selected, -1);
        break;

      case laneDnKey:
        target = this.findCrossLaneNeighbor(selected, +1);
        break;

      case '+': case '=':
        if (event.ctrlKey || event.metaKey) return;
        this.adjustZoom(this.ZOOM_STEP); event.preventDefault(); return;
      case '-':
        if (event.ctrlKey || event.metaKey) return;
        this.adjustZoom(-this.ZOOM_STEP); event.preventDefault(); return;
      case '0':
        if (event.ctrlKey || event.metaKey) { this.zoom = 1.0; event.preventDefault(); }
        return;
      default:
        return;
    }

    if (target) {
      this.usingKeyboard = true;
      this.mouseActive = false;
      if (this.mouseInactivityTimer) { clearTimeout(this.mouseInactivityTimer); this.mouseInactivityTimer = null; }
      this.selectNode(target);
      this.scrollToNode(target);
    }
    event.preventDefault();
  }

  private selectNode(node: RenderNode): void {
    this.selectedSha = node.entry.sha;
    this.selectedCol = node.col;
    this.commitSelected.emit(node.entry.sha);
  }

  onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.adjustZoom(event.deltaY < 0 ? this.ZOOM_STEP : -this.ZOOM_STEP);
    }
  }

  adjustZoom(delta: number): void {
    this.zoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, +(this.zoom + delta).toFixed(2)));
  }

  private scrollToNode(node: RenderNode): void {
    const el = this.graphScrollRef?.nativeElement;
    if (!el) return;

    if (this.viewMode === 'lr') {
      // Horizontal: center in graph-scroll
      const x = this.nodeX(node.row, node.col);
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });

      // Vertical: find scrollable ancestor, center the lane
      const hostEl = this.hostEl.nativeElement as HTMLElement;
      let parent: HTMLElement | null = hostEl.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
            (style.overflow + ' ' + style.overflowY).includes('scroll')) {
          const y = this.nodeY(node.row, node.col) * this.zoom;
          const hostRect = hostEl.getBoundingClientRect();
          const parentRect = parent.getBoundingClientRect();
          const graphTop = hostRect.top - parentRect.top + parent.scrollTop;
          parent.scrollTo({ top: Math.max(0, graphTop + y - parent.clientHeight / 2), behavior: 'smooth' });
          break;
        }
        parent = parent.parentElement;
      }
    } else {
      // TD: scroll graph-scroll vertically to center the node's row
      const y = this.nodeY(node.row, node.col) * this.zoom;
      el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2), behavior: 'smooth' });
    }
  }

  // ── Lane / cross-lane navigation ──────────────────────────────────────────

  private findNeighborInLane(current: RenderNode, direction: number): RenderNode | undefined {
    const sameLane = this.renderNodes
      .filter(n => n.col === current.col)
      .sort((a, b) => a.row - b.row);
    const idx = sameLane.findIndex(n => n.entry.sha === current.entry.sha);
    return sameLane[idx + direction];
  }

  private findCrossLaneNeighbor(current: RenderNode, dir: -1 | 1): RenderNode | undefined {
    const crossConnected = this.crossLaneConnections(current, dir);
    if (crossConnected.length > 0) return crossConnected[0];

    const sameLane = this.renderNodes
      .filter(n => n.col === current.col && n.entry.sha !== current.entry.sha)
      .sort((a, b) => Math.abs(a.row - current.row) - Math.abs(b.row - current.row));

    for (const candidate of sameLane) {
      if (this.crossLaneConnections(candidate, dir).length > 0) return candidate;
    }
    return undefined;
  }

  private crossLaneConnections(node: RenderNode, dir: -1 | 1): RenderNode[] {
    const childShas = this.childrenOf.get(node.entry.sha) ?? [];
    const connected: RenderNode[] = [
      ...node.entry.parents.map(sha => this.renderNodes.find(n => n.entry.sha === sha)).filter((n): n is RenderNode => !!n),
      ...childShas.map(sha => this.renderNodes.find(n => n.entry.sha === sha)).filter((n): n is RenderNode => !!n),
    ];
    const inDir = connected.filter(n => dir === -1 ? n.col < node.col : n.col > node.col);
    inDir.sort((a, b) => dir === -1 ? b.col - a.col : a.col - b.col);
    return inDir;
  }

  private buildChildrenMap(): void {
    this.childrenOf.clear();
    for (const node of this.renderNodes) {
      for (const parentSha of node.entry.parents) {
        const kids = this.childrenOf.get(parentSha) ?? [];
        kids.push(node.entry.sha);
        this.childrenOf.set(parentSha, kids);
      }
    }
  }

  private showToast(message: string): void {
    this.toastVisible = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    requestAnimationFrame(() => {
      this.toastMessage = message;
      this.toastVisible = true;
      this.toastTimer = setTimeout(() => { this.toastVisible = false; }, 2000);
    });
  }

  // ── Build helpers ─────────────────────────────────────────────────────────

  private buildLaneLabels(nodes: LayoutNode[]): void {
    const mergedSet = new Set(
      this.branches.filter(b => (b.ahead ?? -1) === 0).map(b => b.name)
    );
    const labelMap = new Map<number, LaneLabel>();
    for (const node of nodes) {
      if (labelMap.has(node.col)) continue;
      if (node.entry.refs.length > 0) {
        const name = node.entry.refs[0].replace('HEAD -> ', '');
        labelMap.set(node.col, { name, col: node.col, color: node.color, merged: mergedSet.has(name) });
      }
    }
    for (const node of nodes) {
      if (!labelMap.has(node.col)) {
        labelMap.set(node.col, { name: `lane ${node.col}`, col: node.col, color: node.color });
      }
    }
    this.laneLabels = [...labelMap.values()].sort((a, b) => a.col - b.col);
  }

  private buildRenderNodes(nodes: LayoutNode[]): void {
    const branchMap = new Map<string, BranchInfo>(this.branches.map(b => [b.name, b]));
    this.laneStatus.clear();

    this.renderNodes = nodes.map(node => {
      const badges: RefBadge[] = node.entry.refs.map(ref => {
        const isHead = ref.startsWith('HEAD');
        const label = ref.replace('HEAD -> ', '');
        return {
          label,
          width: label.length * this.CHAR_WIDTH + this.BADGE_PAD,
          color: isHead ? '#a6e3a1' : node.color,
          textColor: '#1e1e2e',
          borderColor: isHead ? '#a6e3a1' : node.color,
        };
      });

      if (!this.laneStatus.has(node.col)) {
        for (const ref of node.entry.refs) {
          const name = ref.replace('HEAD -> ', '');
          const info = branchMap.get(name);
          if (info) {
            const isMerged = (info.ahead ?? -1) === 0;
            const label = isMerged ? 'merged' : `▲${info.ahead}${info.behind ? ' ▼' + info.behind : ''}`;
            this.laneStatus.set(node.col, { label, width: label.length * this.CHAR_WIDTH + this.BADGE_PAD, isMerged });
            break;
          }
        }
      }

      return { ...node, badges };
    });
  }

  private buildEdges(): void {
    this.allEdges = [];
    for (const node of this.renderNodes) {
      for (const edge of node.edges) {
        this.allEdges.push({ path: this.edgePath(node.row, edge), color: edge.color });
      }
    }
  }

  private edgePath(fromRow: number, edge: LayoutEdge): string {
    const x1 = this.nodeX(fromRow, edge.fromCol);
    const y1 = this.nodeY(fromRow, edge.fromCol);
    const x2 = this.nodeX(edge.toRow, edge.toCol);
    const y2 = this.nodeY(edge.toRow, edge.toCol);

    if (this.viewMode === 'lr') {
      if (y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`;
      const midX = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    } else {
      if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    }
  }

  private computeDimensions(): void {
    const tdLabelSpace = this.TD_LABEL_OFFSET;
    if (this.viewMode === 'lr') {
      this.svgWidth = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2;
      this.svgHeight = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
    } else {
      this.svgWidth = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
      this.svgHeight = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2 + tdLabelSpace;
    }
  }
}

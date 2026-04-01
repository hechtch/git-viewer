import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, HostBinding, ViewChild, ElementRef, inject, ChangeDetectorRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { BranchInfo, GraphEntry } from '../../services/git-api.service';
import { computeLayout, LayoutNode, LayoutEdge } from './graph-layout';

interface RenderEdge {
  path: string;
  color: string;
  merged: boolean;
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
  localAhead: number;  // unpushed commits to show in yellow; 0 = none
  width: number;
  isMerged: boolean;
  tooltip: string;
}

interface RenderNode extends LayoutNode {
  badges: RefBadge[];
}

export interface LaneLabel {
  name: string;
  col: number;
  color: string;
  merged?: boolean;
  isCurrent?: boolean;
}

function buildStatusTooltip(info: BranchInfo): string {
  const base = info.base ?? 'trunk';
  if (info.ahead === 0) return `Merged into ${base}`;
  const lines: string[] = [];
  const a = info.ahead ?? 0;
  const b = info.behind ?? 0;
  lines.push(`${a} commit${a === 1 ? '' : 's'} ahead of ${base}`);
  if (b > 0) lines.push(`${b} commit${b === 1 ? '' : 's'} behind ${base}`);
  if (!info.isRemote) {
    if (!info.upstream) {
      lines.push('Not pushed to any remote');
    } else if ((info.localAhead ?? 0) > 0) {
      const u = info.localAhead!;
      lines.push(`${u} commit${u === 1 ? '' : 's'} not pushed to ${info.upstream}`);
    }
    if ((info.localBehind ?? 0) > 0) {
      const d = info.localBehind!;
      lines.push(`${d} commit${d === 1 ? '' : 's'} on remote not yet fetched`);
    }
  }
  return lines.join('\n');
}

@Component({
    selector: 'app-commit-graph',
    imports: [DecimalPipe],
    templateUrl: './commit-graph.component.html',
    styleUrls: ['./commit-graph.component.css']
})
export class CommitGraphComponent implements OnChanges {
  @Input() entries: GraphEntry[] = [];
  @Input() branches: BranchInfo[] = [];
  @Input() currentBranch = '';
  @Input() showMerged = true;
  @Input() showNames = true;
  @Input() jumpToBranch: string | null = null;
  @Input() viewMode: 'lr' | 'rl' | 'td' | 'bu' = 'lr';
  @Output() commitSelected = new EventEmitter<string>();

  readonly COMMIT_SPACING = 60;
  readonly LANE_HEIGHT = 44;
  readonly NODE_RADIUS = 5;
  readonly MARGIN = 72;
  readonly CHAR_WIDTH = 7;
  readonly BADGE_PAD = 12;

  @ViewChild('graphScroll') graphScrollRef: ElementRef<HTMLElement> | undefined;
  private hostEl = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);

  renderNodes: RenderNode[] = [];
  allEdges: RenderEdge[] = [];
  laneLabels: LaneLabel[] = [];
  laneStatus = new Map<number, StatusBadge>();
  mergedCols = new Set<number>();
  selectedSha = '';
  selectedCol = -1;
  toastMessage = '';
  toastVisible = false;
  toastProminent = false;
  toastCx = 0;
  toastCy = 0;

  private childrenOf = new Map<string, string[]>();

  svgWidth = 800;
  svgHeight = 200;
  zoom = 1.0;

  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.0;
  readonly ZOOM_STEP = 0.15;

  labelsWidth = 120;

  private _maxCol = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private mouseInactivityTimer: ReturnType<typeof setTimeout> | null = null;

  mouseActive = false;
  usingKeyboard = false;

  get showMouseHover(): boolean {
    return this.mouseActive && !this.usingKeyboard;
  }

  @HostBinding('class.resizing') private resizing = false;
  statusTooltip: { text: string; x: number; y: number } | null = null;

  showStatusTooltip(event: MouseEvent, text: string): void {
    const r = (event.target as HTMLElement).getBoundingClientRect();
    this.statusTooltip = { text, x: r.left, y: r.bottom + 6 };
  }

  hideStatusTooltip(): void {
    this.statusTooltip = null;
  }
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.labelsWidth;
  }


  onMouseMove(): void {
    if (this.usingKeyboard) this.usingKeyboard = false;
    if (!this.mouseActive) this.mouseActive = true;
    if (this.mouseInactivityTimer) clearTimeout(this.mouseInactivityTimer);
    this.mouseInactivityTimer = setTimeout(() => { this.mouseActive = false; }, 2000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entries'] || changes['branches'] || changes['currentBranch'] || changes['showMerged'] || changes['viewMode']) {
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
      if (changes['entries']) {
        if (!this.selectedSha && this.renderNodes.length) {
          this.selectNode(this.renderNodes[0]);
        }
        if (this.viewMode === 'lr') {
          setTimeout(() => {
            const el = this.graphScrollRef?.nativeElement;
            if (el) el.scrollLeft = el.scrollWidth;
          });
        }
      }
    }
    if (changes['viewMode'] && !changes['viewMode'].firstChange) {
      const labels: Record<string, string> = {
        lr: '← older · newer →',
        rl: '← newer · older →',
        td: '↑ newer · older ↓',
        bu: '↑ older · newer ↓',
      };
      const label = labels[this.viewMode];
      // Scroll first (instant), then measure the rect and show the toast
      setTimeout(() => {
        const node = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
        if (node) {
          this.scrollToNode(node, 'instant');
        } else if (this.viewMode === 'lr') {
          const el = this.graphScrollRef?.nativeElement;
          if (el) el.scrollLeft = el.scrollWidth;
        }
        this.showToast(label, true);
      });
    }
    if (changes['jumpToBranch'] && this.jumpToBranch) {
      setTimeout(() => this.jumpToNamedBranch(this.jumpToBranch!));
    }
  }

  jumpToNamedBranch(name: string): void {
    const node = this.renderNodes.find(n =>
      n.entry.refs.some(r => r.replace('HEAD -> ', '') === name)
    );
    if (node) {
      this.selectNode(node);
      setTimeout(() => this.scrollToNode(node));
    }
  }

  // ── Position helpers ──────────────────────────────────────────────────────

  /** True for LR/RL (horizontal time axis); false for TD/BU (vertical time axis). */
  get isHorizontal(): boolean { return this.viewMode === 'lr' || this.viewMode === 'rl'; }

  /** True when the position formula needs (maxRow - row) so row 0 (newest) lands at the far end. */
  private get isReversed(): boolean { return this.viewMode === 'lr' || this.viewMode === 'bu'; }

  /** Position along the time axis (commits). Row 0 = newest. */
  private timePos(row: number): number {
    const maxRow = this.entries.length - 1;
    return this.isReversed
      ? (maxRow - row) * this.COMMIT_SPACING + this.MARGIN
      : row * this.COMMIT_SPACING + this.MARGIN;
  }

  /** Position along the lane axis (branches). */
  private lanePos(col: number): number {
    return col * this.LANE_HEIGHT + this.MARGIN;
  }

  /** Node X: time axis in LR/RL, lane axis in TD/BU. */
  nodeX(row: number, col: number): number {
    return this.isHorizontal ? this.timePos(row) : this.lanePos(col);
  }

  /** Node Y: lane axis in LR/RL, time axis in TD/BU. */
  nodeY(row: number, col: number): number {
    return this.isHorizontal ? this.lanePos(col) : this.timePos(row);
  }

  /** The lane's position on its primary axis (Y in LR, X in TD). */
  lanePrimaryPos(col: number): number {
    return this.lanePos(col);
  }

  // Badge positioning helpers
  badgeRectX(row: number, col: number, badgeWidth: number, i: number): number {
    return this.isHorizontal
      ? this.nodeX(row, col) - badgeWidth / 2
      : this.nodeX(row, col) + this.NODE_RADIUS + 6;
  }
  badgeRectY(row: number, col: number, i: number): number {
    return this.isHorizontal
      ? this.nodeY(row, col) - 26 - i * 20
      : this.nodeY(row, col) - 8 + i * 20;
  }
  badgeTextX(row: number, col: number, i: number): number {
    return this.isHorizontal
      ? this.nodeX(row, col)
      : this.nodeX(row, col) + this.NODE_RADIUS + 12;
  }
  badgeTextY(row: number, col: number, i: number): number {
    return this.isHorizontal
      ? this.nodeY(row, col) - 14 - i * 20
      : this.nodeY(row, col) + 4 + i * 20;
  }
  get badgeTextAnchor(): string { return this.isHorizontal ? 'middle' : 'start'; }

  // Hash label helpers
  hashLabelX(row: number, col: number): number {
    return this.isHorizontal
      ? this.nodeX(row, col)
      : this.nodeX(row, col) + this.NODE_RADIUS + 4;
  }
  hashLabelY(row: number, col: number): number {
    return this.isHorizontal
      ? this.nodeY(row, col) + 18
      : this.nodeY(row, col) + 4;
  }
  get hashTextAnchor(): string { return this.isHorizontal ? 'middle' : 'start'; }

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

    // Let the commit detail handle its own scrolling when it has focus
    if (['PageUp', 'PageDown', 'Home', 'End'].includes(event.key) &&
        document.activeElement?.closest('app-commit-detail')) {
      return;
    }

    const selected = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
    if (!selected) {
      const initKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                        'PageUp', 'PageDown', 'Home', 'End'];
      if (initKeys.includes(event.key)) {
        this.selectNode(this.renderNodes[0]);
        event.preventDefault();
      }
      return;
    }

    // PageUp/PageDown/Home/End (vertical modes only)
    if (!this.isHorizontal && ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      // TD: up=newer(children), down=older(parents). BU is reversed.
      const upIsNewer = this.viewMode === 'td';

      let pageTarget: RenderNode | undefined;

      if (event.key === 'Home' || event.key === 'End') {
        // Jump to absolute top or bottom of the graph (by visual row position).
        // Home=top: TD→lowest row (newest), BU→highest row (oldest).
        // End=bottom: TD→highest row (oldest), BU→lowest row (newest).
        const goTop = event.key === 'Home';
        const wantMinRow = goTop ? upIsNewer : !upIsNewer;
        pageTarget = this.renderNodes.reduce((best, n) =>
          (wantMinRow ? n.row < best.row : n.row > best.row) ? n : best
        );
      } else {
        // PageUp/PageDown: jump to this lane's entry point; if already there, cross to parent/child lane.
        const goNewer = (event.key === 'PageUp') === upIsNewer;
        const laneNodes = (col: number) =>
          this.renderNodes.filter(n => n.col === col).sort((a, b) => a.row - b.row);

        if (goNewer) {
          // Newer direction: target = newest (lowest row) in current lane.
          // If already there, jump to newest of the child lane.
          const lane = laneNodes(selected.col);
          const laneHead = lane[0];
          if (selected.entry.sha !== laneHead.entry.sha) {
            pageTarget = laneHead;
          } else {
            const childShas = this.childrenOf.get(selected.entry.sha) ?? [];
            const childSha = childShas.find(
              sha => this.renderNodes.find(n => n.entry.sha === sha && n.col !== selected.col)
            ) ?? childShas[0];
            const child = this.renderNodes.find(n => n.entry.sha === childSha);
            if (child) pageTarget = laneNodes(child.col)[0];
          }
        } else {
          // Older direction: target = oldest (highest row) in current lane.
          // If already there, follow parent[0] and jump to oldest of that lane.
          const lane = laneNodes(selected.col);
          const laneTail = lane[lane.length - 1];
          if (selected.entry.sha !== laneTail.entry.sha) {
            pageTarget = laneTail;
          } else {
            const parentSha = selected.entry.parents[0];
            const parent = this.renderNodes.find(n => n.entry.sha === parentSha);
            if (parent) pageTarget = laneNodes(parent.col)[laneNodes(parent.col).length - 1];
          }
        }
      }

      if (pageTarget && pageTarget.entry.sha !== selected.entry.sha) {
        this.usingKeyboard = true;
        this.mouseActive = false;
        if (this.mouseInactivityTimer) { clearTimeout(this.mouseInactivityTimer); this.mouseInactivityTimer = null; }
        this.selectNode(pageTarget);
        this.scrollToNode(pageTarget);
      }
      event.preventDefault();
      return;
    }

    let target: RenderNode | undefined;

    // Arrow keys follow visual direction:
    //   LR: Right=newer, Left=older, Up/Down=cross-lane
    //   RL: Left=newer,  Right=older, Up/Down=cross-lane
    //   TD: Up=newer,    Down=older,  Left/Right=cross-lane
    //   BU: Down=newer,  Up=older,    Left/Right=cross-lane
    const keyMap: Record<string, 'newer' | 'older' | 'laneUp' | 'laneDn'> = {
      lr: { ArrowRight: 'newer', ArrowLeft: 'older',  ArrowUp: 'laneUp', ArrowDown: 'laneDn' },
      rl: { ArrowLeft:  'newer', ArrowRight: 'older', ArrowUp: 'laneUp', ArrowDown: 'laneDn' },
      td: { ArrowUp:    'newer', ArrowDown: 'older',  ArrowLeft: 'laneUp', ArrowRight: 'laneDn' },
      bu: { ArrowDown:  'newer', ArrowUp:   'older',  ArrowLeft: 'laneUp', ArrowRight: 'laneDn' },
    }[this.viewMode] as Record<string, 'newer' | 'older' | 'laneUp' | 'laneDn'>;

    const action = keyMap[event.key];

    switch (action) {
      case 'newer':
        target = this.findNeighborInLane(selected, -1);
        if (!target) {
          const lane = this.laneLabels.find(l => l.col === selected.col);
          this.showToast(`At head of ${lane?.name ?? 'lane'} (${selected.entry.short})`);
        }
        break;

      case 'older': {
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

      case 'laneUp':
        target = this.findAdjacentLane(selected, -1);
        break;

      case 'laneDn':
        target = this.findAdjacentLane(selected, +1);
        break;

      default:
        // Not a nav action — check zoom keys
        if (event.key === '+' || event.key === '=') {
          if (event.ctrlKey || event.metaKey) return;
          this.adjustZoom(this.ZOOM_STEP); event.preventDefault(); return;
        }
        if (event.key === '-') {
          if (event.ctrlKey || event.metaKey) return;
          this.adjustZoom(-this.ZOOM_STEP); event.preventDefault(); return;
        }
        if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
          this.zoom = 1.0; event.preventDefault();
          const sel = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
          if (sel) setTimeout(() => this.scrollToNode(sel, 'instant'));
        }
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

  // ── Ctrl+drag box zoom ────────────────────────────────────────────────────

  zoomBox: { x: number; y: number; w: number; h: number } | null = null;
  private dragStart: { clientX: number; clientY: number } | null = null;

  onGraphMouseDown(event: MouseEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    this.dragStart = { clientX: event.clientX, clientY: event.clientY };
    this.zoomBox = null;
  }

  @HostListener('document:mousemove', ['$event'])
  onDragMove(e: MouseEvent): void {
    if (this.resizing) {
      this.labelsWidth = Math.max(80, this.resizeStartWidth + e.clientX - this.resizeStartX);
      return;
    }
    if (!this.dragStart) return;

    const el = this.graphScrollRef?.nativeElement;
    if (!el) return;

    const svgRect = el.querySelector('.graph-svg')?.getBoundingClientRect();
    if (!svgRect) return;

    // Convert client coords to SVG viewBox coords
    const toSvg = (clientX: number, clientY: number) => ({
      x: (clientX - svgRect.left + el.scrollLeft) / this.zoom,
      y: (clientY - svgRect.top) / this.zoom,
    });

    // Also account for vertical scroll of scrollable ancestor
    const hostEl = this.hostEl.nativeElement as HTMLElement;
    const toSvgWithScroll = (clientX: number, clientY: number) => {
      let scrollTop = 0;
      if (!this.isHorizontal) {
        let parent: HTMLElement | null = hostEl.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
              (style.overflow + ' ' + style.overflowY).includes('scroll')) {
            scrollTop = parent.scrollTop;
            break;
          }
          parent = parent.parentElement;
        }
      }
      return {
        x: (clientX - svgRect.left + (this.isHorizontal ? el.scrollLeft : 0)) / this.zoom,
        y: (clientY - svgRect.top + (!this.isHorizontal ? scrollTop : 0)) / this.zoom,
      };
    };

    const p1 = toSvgWithScroll(this.dragStart.clientX, this.dragStart.clientY);
    const p2 = toSvgWithScroll(e.clientX, e.clientY);

    this.zoomBox = {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      w: Math.abs(p2.x - p1.x),
      h: Math.abs(p2.y - p1.y),
    };
    this.cdr.detectChanges();
  }

  @HostListener('document:mouseup')
  onDragEnd(): void {
    if (this.resizing) {
      this.resizing = false;
      return;
    }
    if (!this.dragStart) return;

    const box = this.zoomBox;
    this.dragStart = null;
    this.zoomBox = null;

    if (!box || box.w < 10 || box.h < 10) return;

    const el = this.graphScrollRef?.nativeElement;
    if (!el) return;

    // Determine visible viewport size
    let viewportW: number;
    let viewportH: number;

    if (this.isHorizontal) {
      viewportW = el.clientWidth;
      // Find scrollable ancestor for vertical viewport
      const hostEl = this.hostEl.nativeElement as HTMLElement;
      let parent: HTMLElement | null = hostEl.parentElement;
      viewportH = el.clientHeight;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
            (style.overflow + ' ' + style.overflowY).includes('scroll')) {
          viewportH = parent.clientHeight;
          break;
        }
        parent = parent.parentElement;
      }
    } else {
      viewportW = el.clientWidth;
      const hostEl = this.hostEl.nativeElement as HTMLElement;
      let parent: HTMLElement | null = hostEl.parentElement;
      viewportH = el.clientHeight;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
            (style.overflow + ' ' + style.overflowY).includes('scroll')) {
          viewportH = parent.clientHeight;
          break;
        }
        parent = parent.parentElement;
      }
    }

    // Compute zoom to fit the box in viewport
    const scaleX = viewportW / box.w;
    const scaleY = viewportH / box.h;
    const newZoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, Math.min(scaleX, scaleY)));
    this.zoom = +newZoom.toFixed(2);

    // Scroll to center the box
    setTimeout(() => {
      const centerX = (box.x + box.w / 2) * this.zoom;
      const centerY = (box.y + box.h / 2) * this.zoom;

      el.scrollTo({ left: Math.max(0, centerX - viewportW / 2), behavior: 'instant' });

      // Vertical scroll via ancestor
      const hostEl = this.hostEl.nativeElement as HTMLElement;
      let parent: HTMLElement | null = hostEl.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
            (style.overflow + ' ' + style.overflowY).includes('scroll')) {
          const hostRect = hostEl.getBoundingClientRect();
          const parentRect = parent.getBoundingClientRect();
          const graphTop = hostRect.top - parentRect.top + parent.scrollTop;
          parent.scrollTo({ top: Math.max(0, graphTop + centerY - viewportH / 2), behavior: 'instant' });
          break;
        }
        parent = parent.parentElement;
      }
    });
  }

  adjustZoom(delta: number): void {
    this.zoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, +(this.zoom + delta).toFixed(2)));
    const selected = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
    if (selected) {
      setTimeout(() => this.scrollToNode(selected, 'instant'));
    }
  }

  private scrollToNode(node: RenderNode, behavior: ScrollBehavior = 'smooth'): void {
    const el = this.graphScrollRef?.nativeElement;
    if (!el) return;

    if (this.isHorizontal) {
      // Horizontal: center in graph-scroll
      const x = this.nodeX(node.row, node.col) * this.zoom;
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior });

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
          parent.scrollTo({ top: Math.max(0, graphTop + y - parent.clientHeight / 2), behavior });
          break;
        }
        parent = parent.parentElement;
      }
    } else {
      // TD/BU: find scrollable ancestor (graph-scroll is not height-constrained), center the node
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
          parent.scrollTo({ top: Math.max(0, graphTop + y - parent.clientHeight / 2), behavior });
          break;
        }
        parent = parent.parentElement;
      }
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

  private findAdjacentLane(current: RenderNode, dir: -1 | 1): RenderNode | undefined {
    const lane = this.renderNodes.filter(n => n.col === current.col + dir);
    if (!lane.length) return undefined;
    return lane.reduce((best, n) =>
      Math.abs(n.row - current.row) < Math.abs(best.row - current.row) ? n : best
    );
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

  private showToast(message: string, prominent = false): void {
    this.toastVisible = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    requestAnimationFrame(() => {
      if (prominent) {
        // Walk up to the scrollable container (commit-log-panel) — it has a stable visible size
        // in all modes, unlike the host element which is SVG-height tall in TD/BU.
        const hostEl = this.hostEl.nativeElement as HTMLElement;
        let rect: DOMRect = hostEl.getBoundingClientRect();
        let parent: HTMLElement | null = hostEl.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if ((style.overflow + ' ' + style.overflowY).includes('auto') ||
              (style.overflow + ' ' + style.overflowY).includes('scroll')) {
            rect = parent.getBoundingClientRect();
            break;
          }
          parent = parent.parentElement;
        }
        this.toastCx = rect.left + rect.width / 2;
        this.toastCy = rect.top + rect.height / 2;
      }
      this.toastMessage = message;
      this.toastProminent = prominent;
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
        labelMap.set(node.col, {
          name, col: node.col, color: node.color,
          merged: mergedSet.has(name),
          isCurrent: name === this.currentBranch,
        });
      }
    }
    for (const node of nodes) {
      if (!labelMap.has(node.col)) {
        labelMap.set(node.col, { name: `lane ${node.col}`, col: node.col, color: node.color });
      }
    }
    this.laneLabels = [...labelMap.values()].sort((a, b) => a.col - b.col);
    this.labelsWidth = this.computeLabelsWidth();
  }

  private computeLabelsWidth(): number {
    const HEAD_BADGE_W = 34; // "HEAD" at 10px monospace + padding
    const GAP = 8;
    const PAD = 16; // left + right padding
    let max = 0;
    for (const lane of this.laneLabels) {
      let w = lane.name.length * this.CHAR_WIDTH + PAD;
      if (lane.isCurrent) w += GAP + HEAD_BADGE_W;
      const status = this.laneStatus.get(lane.col);
      if (status) w += GAP + status.width;
      if (w > max) max = w;
    }
    return Math.max(120, max);
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
        // Prefer local branches over remote refs when multiple refs share a commit,
        // so the tooltip shows accurate push status from the local branch's perspective.
        const refs = [...node.entry.refs].sort((a, b) => {
          const aInfo = branchMap.get(a.replace('HEAD -> ', ''));
          const bInfo = branchMap.get(b.replace('HEAD -> ', ''));
          return Number(aInfo?.isRemote ?? true) - Number(bInfo?.isRemote ?? true);
        });
        for (const ref of refs) {
          const name = ref.replace('HEAD -> ', '');
          const info = branchMap.get(name);
          if (info && info.ahead !== undefined) {
            const isMerged = info.ahead === 0;
            const label = isMerged ? 'merged' : `▲${info.ahead}${info.behind ? ' ▼' + info.behind : ''}`;
            const localAhead = (!info.isRemote && !isMerged) ? (info.localAhead ?? 0) : 0;
            const tooltip = buildStatusTooltip(info);
            this.laneStatus.set(node.col, { label, localAhead, width: label.length * this.CHAR_WIDTH + this.BADGE_PAD, isMerged, tooltip });
            break;
          }
        }
      }

      return { ...node, badges };
    });

    this.mergedCols.clear();
    for (const [col, status] of this.laneStatus) {
      if (status.isMerged) this.mergedCols.add(col);
    }
  }

  private buildEdges(): void {
    this.allEdges = [];
    for (const node of this.renderNodes) {
      for (const edge of node.edges) {
        const merged = this.mergedCols.has(node.col) && this.mergedCols.has(edge.toCol);
        this.allEdges.push({ path: this.edgePath(node.row, edge), color: edge.color, merged });
      }
    }
  }

  private edgePath(fromRow: number, edge: LayoutEdge): string {
    const x1 = this.nodeX(fromRow, edge.fromCol);
    const y1 = this.nodeY(fromRow, edge.fromCol);
    const x2 = this.nodeX(edge.toRow, edge.toCol);
    const y2 = this.nodeY(edge.toRow, edge.toCol);

    if (this.isHorizontal) {
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
    if (this.isHorizontal) {
      this.svgWidth = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2;
      this.svgHeight = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
    } else {
      this.svgWidth = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
      this.svgHeight = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2;
    }
  }
}

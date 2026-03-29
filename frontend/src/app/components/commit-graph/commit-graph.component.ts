import { Component, Input, Output, EventEmitter, OnChanges, HostListener, ViewChild, ElementRef } from '@angular/core';

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
  @Output() commitSelected = new EventEmitter<string>();

  readonly COMMIT_SPACING = 60;
  readonly LANE_HEIGHT = 44;
  readonly NODE_RADIUS = 5;
  readonly MARGIN = 36;
  readonly CHAR_WIDTH = 7;
  readonly BADGE_PAD = 12;

  @ViewChild('graphScroll') graphScrollRef: ElementRef<HTMLElement> | undefined;

  renderNodes: RenderNode[] = [];
  allEdges: RenderEdge[] = [];
  laneLabels: LaneLabel[] = [];
  laneStatus = new Map<number, StatusBadge>(); // col → status
  selectedSha = '';
  selectedCol = -1;
  toastMessage = '';
  toastVisible = false;

  /** sha → list of child shas (commits whose parents include this sha) */
  private childrenOf = new Map<string, string[]>();

  svgWidth = 800;
  svgHeight = 200;
  zoom = 1.0;

  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.0;
  readonly ZOOM_STEP = 0.15;

  private _maxCol = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(): void {
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

  /** X position: commit index → horizontal position (oldest on left, newest on right) */
  nodeX(row: number): number {
    const maxRow = this.entries.length - 1;
    return (maxRow - row) * this.COMMIT_SPACING + this.MARGIN;
  }

  /** Y position: branch lane → vertical position */
  nodeY(col: number): number {
    return col * this.LANE_HEIGHT + this.MARGIN;
  }

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

    switch (event.key) {
      case 'ArrowRight':
        // Next newer commit in same lane (lower row number)
        target = this.findNeighborInLane(selected, -1);
        break;

      case 'ArrowLeft': {
        // Next older commit in same lane; at boundary jump to parent lane (non-main only)
        target = this.findNeighborInLane(selected, 1);
        if (!target) {
          if (selected.col !== 0 && selected.entry.parents.length > 0) {
            // Jump to first parent (likely on main or another branch)
            target = this.renderNodes.find(n => n.entry.sha === selected.entry.parents[0]);
          } else {
            const lane = this.laneLabels.find(l => l.col === selected.col);
            const laneName = lane?.name ?? `lane ${selected.col}`;
            this.showToast(`First commit of ${laneName} (${selected.entry.short})`);
          }
        }
        break;
      }

      case 'ArrowUp': {
        // Move to visually higher lane (smaller col); prefer cross-lane, fall back to any
        target = this.findCrossLaneNeighbor(selected, -1);
        break;
      }

      case 'ArrowDown': {
        // Move to visually lower lane (larger col); prefer cross-lane, fall back to any
        target = this.findCrossLaneNeighbor(selected, +1);
        break;
      }

      case '+':
      case '=':
        if (event.ctrlKey || event.metaKey) return; // handled by AppComponent
        this.adjustZoom(this.ZOOM_STEP);
        event.preventDefault();
        return;
      case '-':
        if (event.ctrlKey || event.metaKey) return; // handled by AppComponent
        this.adjustZoom(-this.ZOOM_STEP);
        event.preventDefault();
        return;
      case '0':
        if (event.ctrlKey || event.metaKey) {
          this.zoom = 1.0;
          event.preventDefault();
        }
        return;

      default:
        return;
    }

    if (target) {
      this.selectNode(target);
      this.scrollToNode(target);
    } else if (event.key === 'ArrowRight') {
      const lane = this.laneLabels.find(l => l.col === selected.col);
      const laneName = lane?.name ?? `lane ${selected.col}`;
      this.showToast(`At head of ${laneName} (${selected.entry.short})`);
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
    const x = this.nodeX(node.row);
    const halfView = el.clientWidth / 2;
    const target = x - halfView;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  /** Move up (dir=-1) or down (dir=+1) by visual lane.
   *  First tries directly connected commits in the correct direction.
   *  If none, walks the current lane to find the nearest commit that has
   *  such a cross-lane connection (a branch/merge point), and navigates there. */
  private findCrossLaneNeighbor(current: RenderNode, dir: -1 | 1): RenderNode | undefined {
    const crossConnected = this.crossLaneConnections(current, dir);
    if (crossConnected.length > 0) return crossConnected[0];

    // Walk current lane — find nearest commit that has a cross-lane connection in dir
    const sameLane = this.renderNodes
      .filter(n => n.col === current.col && n.entry.sha !== current.entry.sha)
      .sort((a, b) => Math.abs(a.row - current.row) - Math.abs(b.row - current.row));

    for (const candidate of sameLane) {
      if (this.crossLaneConnections(candidate, dir).length > 0) {
        return candidate;
      }
    }
    return undefined;
  }

  /** Returns directly connected commits (parents + children) in the given visual direction. */
  private crossLaneConnections(node: RenderNode, dir: -1 | 1): RenderNode[] {
    const childShas = this.childrenOf.get(node.entry.sha) ?? [];
    const connected: RenderNode[] = [
      ...node.entry.parents
        .map(sha => this.renderNodes.find(n => n.entry.sha === sha))
        .filter((n): n is RenderNode => !!n),
      ...childShas
        .map(sha => this.renderNodes.find(n => n.entry.sha === sha))
        .filter((n): n is RenderNode => !!n),
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
    // Force re-trigger animation by toggling off then on
    this.toastVisible = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);

    requestAnimationFrame(() => {
      this.toastMessage = message;
      this.toastVisible = true;
      this.toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 2000);
    });
  }

  /** Find the closest commit in the same lane, moving by direction in row order */
  private findNeighborInLane(current: RenderNode, direction: number): RenderNode | undefined {
    const sameLane = this.renderNodes
      .filter(n => n.col === current.col)
      .sort((a, b) => a.row - b.row);
    const idx = sameLane.findIndex(n => n.entry.sha === current.entry.sha);
    const next = sameLane[idx + direction];
    return next;
  }

  private buildLaneLabels(nodes: LayoutNode[]): void {
    const labelMap = new Map<number, LaneLabel>();
    for (const node of nodes) {
      if (labelMap.has(node.col)) continue;
      if (node.entry.refs.length > 0) {
        const name = node.entry.refs[0].replace('HEAD -> ', '');
        labelMap.set(node.col, { name, col: node.col, color: node.color });
      }
    }
    // Ensure every lane gets a label
    for (const node of nodes) {
      if (!labelMap.has(node.col)) {
        labelMap.set(node.col, { name: `lane ${node.col}`, col: node.col, color: node.color });
      }
    }
    this.laneLabels = [...labelMap.values()].sort((a, b) => a.col - b.col);
  }

  private buildRenderNodes(nodes: LayoutNode[]): void {
    const branchMap = new Map<string, BranchInfo>(
      this.branches.map(b => [b.name, b])
    );

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

      // Build per-lane status from branch tip nodes
      if (!this.laneStatus.has(node.col)) {
        for (const ref of node.entry.refs) {
          const name = ref.replace('HEAD -> ', '');
          const info = branchMap.get(name);
          if (info) {
            const isMerged = (info.ahead ?? -1) === 0;
            const label = isMerged
              ? 'merged'
              : `▲${info.ahead}${info.behind ? ' ▼' + info.behind : ''}`;
            this.laneStatus.set(node.col, {
              label,
              width: label.length * this.CHAR_WIDTH + this.BADGE_PAD,
              isMerged,
            });
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
        this.allEdges.push({
          path: this.edgePath(node.row, edge),
          color: edge.color,
        });
      }
    }
  }

  private edgePath(fromRow: number, edge: LayoutEdge): string {
    const x1 = this.nodeX(fromRow);
    const y1 = this.nodeY(edge.fromCol);
    const x2 = this.nodeX(edge.toRow);
    const y2 = this.nodeY(edge.toCol);

    if (y1 === y2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  private computeDimensions(): void {
    this.svgWidth = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2;
    this.svgHeight = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
  }
}

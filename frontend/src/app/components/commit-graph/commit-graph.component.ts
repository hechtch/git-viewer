import { Component, Input, Output, EventEmitter, OnChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  standalone: true,
  imports: [CommonModule],
  templateUrl: './commit-graph.component.html',
  styleUrls: ['./commit-graph.component.css'],
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

  renderNodes: RenderNode[] = [];
  allEdges: RenderEdge[] = [];
  laneLabels: LaneLabel[] = [];
  laneStatus = new Map<number, StatusBadge>(); // col → status
  selectedSha = '';
  selectedCol = -1;
  toastMessage = '';
  toastVisible = false;

  svgWidth = 800;
  svgHeight = 200;

  private _maxCol = 0;
  private toastTimer: any = null;

  ngOnChanges() {
    const nodes = computeLayout(this.entries);
    this._maxCol = 0;
    for (const n of nodes) {
      if (n.col > this._maxCol) this._maxCol = n.col;
    }
    this.buildRenderNodes(nodes);
    this.buildLaneLabels(nodes);
    this.buildEdges();
    this.computeDimensions();
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

  onCommitClick(sha: string) {
    this.selectedSha = sha;
    const node = this.renderNodes.find(n => n.entry.sha === sha);
    this.selectedCol = node ? node.col : -1;
    this.commitSelected.emit(sha);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.renderNodes.length) return;

    const selected = this.renderNodes.find(n => n.entry.sha === this.selectedSha);
    if (!selected) {
      // Nothing selected — select the newest commit (row 0)
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
      case 'ArrowLeft':
        // Next older commit in same lane (higher row number)
        target = this.findNeighborInLane(selected, 1);
        break;
      case 'ArrowUp':
        // Same row position, move to lane above
        target = this.findNeighborInCol(selected, -1);
        break;
      case 'ArrowDown':
        // Same row position, move to lane below
        target = this.findNeighborInCol(selected, 1);
        break;
      default:
        return;
    }

    if (target) {
      this.selectNode(target);
    } else if (selected && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const isFirst = event.key === 'ArrowLeft';
      const lane = this.laneLabels.find(l => l.col === selected.col);
      const laneName = lane?.name ?? `lane ${selected.col}`;
      const msg = isFirst
        ? `You are at the first commit ${selected.entry.short} of ${laneName}`
        : `You are at the head of ${laneName} (${selected.entry.short})`;
      this.showToast(msg);
    }
    event.preventDefault();
  }

  private selectNode(node: RenderNode) {
    this.selectedSha = node.entry.sha;
    this.selectedCol = node.col;
    this.commitSelected.emit(node.entry.sha);
  }

  private showToast(message: string) {
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

  /** Find the nearest commit in an adjacent lane (up = -1, down = +1) */
  private findNeighborInCol(current: RenderNode, direction: number): RenderNode | undefined {
    const targetCol = current.col + direction;
    const inLane = this.renderNodes.filter(n => n.col === targetCol);
    if (inLane.length === 0) return undefined;
    // Pick the commit closest to current row
    inLane.sort((a, b) => Math.abs(a.row - current.row) - Math.abs(b.row - current.row));
    return inLane[0];
  }

  private buildLaneLabels(nodes: LayoutNode[]) {
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

  private buildRenderNodes(nodes: LayoutNode[]) {
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

  private buildEdges() {
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

  private computeDimensions() {
    this.svgWidth = this.entries.length * this.COMMIT_SPACING + this.MARGIN * 2;
    this.svgHeight = (this._maxCol + 1) * this.LANE_HEIGHT + this.MARGIN * 2;
  }
}

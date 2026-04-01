import { GraphEntry } from '../../services/git-api.service';

const LANE_COLORS = [
  '#89b4fa', // blue
  '#a6e3a1', // green
  '#f9e2af', // yellow
  '#cba6f7', // mauve
  '#fab387', // peach
  '#94e2d5', // teal
  '#f38ba8', // red
  '#89dceb', // sky
];

export interface LayoutEdge {
  toRow: number;
  fromCol: number;
  toCol: number;
  color: string;
}

export interface LayoutNode {
  entry: GraphEntry;
  row: number;
  col: number;
  color: string;
  edges: LayoutEdge[];
}

/**
 * Extract base branch names from a ref list, stripping remote prefixes.
 * e.g. ["origin/master", "work/master"] → {"master"}
 *      ["HEAD -> feature/foo"] → {"feature/foo"}
 */
function refBaseNames(refs: string[]): Set<string> {
  const bases = new Set<string>();
  for (const r of refs) {
    if (r.startsWith('tag: ')) continue;
    const clean = r.replace('HEAD -> ', '');
    const slash = clean.indexOf('/');
    bases.add(slash >= 0 ? clean.substring(slash + 1) : clean);
  }
  return bases;
}

/**
 * Assigns each branch its own dedicated column by tracing first-parent
 * lineage from each branch tip. Commits on the main line (first branch
 * tip with HEAD or column 0) get column 0; each other branch gets its
 * own column that persists from tip down to the fork point.
 */
export function computeLayout(entries: GraphEntry[]): LayoutNode[] {
  if (entries.length === 0) return [];

  const shaToIdx = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    shaToIdx.set(entries[i].sha, i);
  }

  // --- Step 1: identify branch tips and trace first-parent ownership ---
  // branchOf[sha] = column index assigned to that commit
  const branchOf = new Map<string, number>();

  // Collect branch tips: commits that carry a ref label
  // Sort so HEAD branch comes first (gets column 0)
  const tips: { idx: number; isHead: boolean }[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].refs.length > 0) {
      const isHead = entries[i].refs.some(r => r.startsWith('HEAD'));
      tips.push({ idx: i, isHead });
    }
  }
  tips.sort((a, b) => {
    if (a.isHead !== b.isHead) return a.isHead ? -1 : 1;
    return a.idx - b.idx;
  });

  // Set of tip SHAs so we don't consume another branch's starting commit
  const tipShas = new Set(tips.map(t => entries[t.idx].sha));

  let nextCol = 0;
  for (const tip of tips) {
    const col = nextCol++;
    const tipBases = refBaseNames(entries[tip.idx].refs);
    // Trace first-parent chain from this tip, stopping before another branch's tip
    let sha = entries[tip.idx].sha;
    let isFirst = true;
    while (sha) {
      if (branchOf.has(sha)) break; // already claimed by an earlier branch
      if (!isFirst && tipShas.has(sha)) {
        // Allow absorbing if the blocking tip shares a base branch name
        // (same logical branch on a different remote)
        const blockerIdx = shaToIdx.get(sha);
        if (blockerIdx !== undefined) {
          const blockerBases = refBaseNames(entries[blockerIdx].refs);
          const sameLogicalBranch = [...tipBases].some(b => blockerBases.has(b));
          if (!sameLogicalBranch) break;
        } else {
          break;
        }
      }
      branchOf.set(sha, col);
      const entry = entries[shaToIdx.get(sha) ?? 0];
      sha = entry.parents.length > 0 ? entry.parents[0] : '';
      isFirst = false;
    }
  }

  // Any commits not claimed (e.g. no ref pointed at them directly)
  // get assigned to their first parent's column, or a new column.
  // Iterate oldest→newest so parents are resolved before their children.
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!branchOf.has(entry.sha)) {
      // Try to inherit from first parent
      const parentCol = entry.parents.length > 0
        ? branchOf.get(entry.parents[0])
        : undefined;
      branchOf.set(entry.sha, parentCol ?? nextCol++);
    }
  }

  // --- Step 2: compact columns (remove gaps) ---
  const usedCols = [...new Set(branchOf.values())].sort((a, b) => a - b);
  const colRemap = new Map<number, number>();
  usedCols.forEach((c, i) => colRemap.set(c, i));

  // --- Step 3: build layout nodes with edges ---
  const nodes: LayoutNode[] = [];
  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row];
    const rawCol = branchOf.get(entry.sha) ?? 0;
    const col = colRemap.get(rawCol) ?? 0;
    const color = LANE_COLORS[col % LANE_COLORS.length];
    const edges: LayoutEdge[] = [];

    for (const parentSha of entry.parents) {
      const parentRow = shaToIdx.get(parentSha);
      if (parentRow === undefined) continue;

      const parentRawCol = branchOf.get(parentSha) ?? 0;
      const parentCol = colRemap.get(parentRawCol) ?? 0;

      edges.push({
        toRow: parentRow,
        fromCol: col,
        toCol: parentCol,
        color: LANE_COLORS[parentCol % LANE_COLORS.length],
      });
    }

    nodes.push({ entry, row, col, color, edges });
  }

  return nodes;
}

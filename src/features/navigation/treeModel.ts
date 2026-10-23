import type { Entry } from "../../platform/contracts";

export interface TreeNode {
  entry: Entry;
  children: TreeNode[];
}
export interface TreeRow {
  node: TreeNode;
  depth: number;
  parent: string | null;
}

export function parentOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

export function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function buildTree(entries: Entry[], locale: string): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  const attach = (node: TreeNode) => {
    const parent = parentOf(node.entry.path);
    if (!parent) roots.push(node);
    else folder(parent).children.push(node);
  };
  const folder = (path: string): TreeNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const node: TreeNode = {
      entry: {
        path,
        name: path.split("/").at(-1)!,
        kind: "folder",
        id: null,
        identityCollision: false,
      },
      children: [],
    };
    nodes.set(path, node);
    attach(node);
    return node;
  };
  for (const entry of entries) {
    const existing = nodes.get(entry.path);
    if (existing) {
      existing.entry = entry;
      continue;
    }
    const node: TreeNode = { entry, children: [] };
    nodes.set(entry.path, node);
    attach(node);
  }
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  const sort = (list: TreeNode[]) => {
    list.sort(
      (a, b) =>
        Number(a.entry.kind !== "folder") - Number(b.entry.kind !== "folder") ||
        collator.compare(a.entry.name, b.entry.name),
    );
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

export function visibleNodes(
  tree: TreeNode[],
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (list: TreeNode[], depth: number, parent: string | null) => {
    for (const node of list) {
      rows.push({ node, depth, parent });
      if (node.entry.kind === "folder" && expanded.has(node.entry.path))
        walk(node.children, depth + 1, node.entry.path);
    }
  };
  walk(tree, 0, null);
  return rows;
}

import { Order } from "effect";
import type { NoteOrFolder } from "$lib/schema";

export type TreeNode = NoteOrFolder & { children: TreeNode[] };

const byOrder = Order.mapInput<number, TreeNode>(
  Order.number,
  (node) => node.order,
);

/** Recursive function to sort children at all levels. */
function treeToSorted(tree: readonly TreeNode[]): TreeNode[] {
  return tree
    .toSorted(byOrder)
    .map((node) =>
      node.isFolder ? { ...node, children: treeToSorted(node.children) } : node,
    );
}

export function buildNotesTree(notesList: NoteOrFolder[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // First pass: create map entries
  for (const note of notesList) {
    map.set(note.id, { ...note, children: [] });
  }

  // Second pass: build tree
  for (const note of notesList) {
    const current = map.get(note.id);

    if (current === undefined) continue;

    if (note.parentId) {
      const parent = map.get(note.parentId);
      if (parent) {
        parent.children.push(current);
      } else {
        // Parent not found (maybe deleted?), treat as root or orphan
        roots.push(current);
      }
    } else {
      roots.push(current);
    }
  }

  return treeToSorted(roots);
}

export function findNode(tree: TreeNode[], id: string): TreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.isFolder) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

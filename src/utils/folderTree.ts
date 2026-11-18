import type { MatrixFolder, SavedMatrixSystem } from '@/types/matrix';

export interface FolderTreeNode {
  folder: MatrixFolder;
  children: FolderTreeNode[];
  matrices: SavedMatrixSystem[];
  totalMatricesCount: number; 
}

export function buildFolderTree(
  folders: MatrixFolder[],
  catalog: SavedMatrixSystem[]
): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();

  folders.forEach((f) => {
    folderMap.set(f.id, {
      folder: f,
      children: [],
      matrices: catalog.filter((s) => s.folderId === f.id),
      totalMatricesCount: 0,
    });
  });

  const roots: FolderTreeNode[] = [];

  folders.forEach((f) => {
    const node = folderMap.get(f.id)!;
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Вычисляем суммарное количество матриц (включая вложенные подпапки)
  function computeTotal(node: FolderTreeNode): number {
    let sum = node.matrices.length;
    for (const child of node.children) {
      sum += computeTotal(child);
    }
    node.totalMatricesCount = sum;
    return sum;
  }

  roots.forEach(computeTotal);

  // Сортировка по порядку и имени
  function sortNodes(nodes: FolderTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.folder.order !== b.folder.order) {
        return a.folder.order - b.folder.order;
      }
      return a.folder.name.localeCompare(b.folder.name, 'ru');
    });
    nodes.forEach((n) => sortNodes(n.children));
  }

  sortNodes(roots);
  return roots;
}

export function getDescendantFolderIds(folders: MatrixFolder[], folderId: string): string[] {
  const result: string[] = [];
  const children = folders.filter((f) => f.parentId === folderId);
  for (const child of children) {
    result.push(child.id);
    result.push(...getDescendantFolderIds(folders, child.id));
  }
  return result;
}

export function getFolderPath(
  folders: MatrixFolder[],
  folderId: string | null | undefined
): MatrixFolder[] {
  if (!folderId) return [];
  const path: MatrixFolder[] = [];
  let curr = folders.find((f) => f.id === folderId);
  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? folders.find((f) => f.id === curr?.parentId) : undefined;
  }
  return path;
}

export function getFolderBreadcrumbString(
  folders: MatrixFolder[],
  folderId: string | null | undefined
): string {
  const path = getFolderPath(folders, folderId);
  return path.map((f) => f.name).join(' / ');
}

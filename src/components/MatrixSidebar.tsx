import React, { useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import {
  useFoldersQuery,
  useCatalogQuery,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useDeleteFolderMutation,
  useMoveSystemMutation,
  useDeleteSystemMutation,
} from '@/hooks/useMatrixQueries';
import { buildFolderTree, type FolderTreeNode } from '@/utils/folderTree';
import type { MatrixFolder, SavedMatrixSystem } from '@/types/matrix';
import { FolderModal } from '@/components/FolderModal';
import { MoveMatrixModal } from '@/components/MoveMatrixModal';
import { DeleteFolderModal } from '@/components/DeleteFolderModal';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Layers,
  Database,
  Pencil,
  Trash2,
  FolderInput,
  PanelLeftClose,
  FileSpreadsheet,
} from 'lucide-react';

export const MatrixSidebar: React.FC = () => {
  const { data: folders = [] } = useFoldersQuery();
  const { data: catalog = [] } = useCatalogQuery();

  const createFolderMutation = useCreateFolderMutation();
  const updateFolderMutation = useUpdateFolderMutation();
  const deleteFolderMutation = useDeleteFolderMutation();
  const moveSystemMutation = useMoveSystemMutation();
  const deleteSystemMutation = useDeleteSystemMutation();

  const {
    activeSystemId,
    activeFolderId,
    isSidebarOpen,
    expandedFolderIds,
    toggleSidebar,
    toggleFolderExpanded,
    setActiveFolderId,
    selectSystem,
    draftSheets,
    draftName,
  } = useMatrixStore();

  // Состояния модалок
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MatrixFolder | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [matrixToMove, setMatrixToMove] = useState<SavedMatrixSystem | null>(null);

  const [deleteFolderModalOpen, setDeleteFolderModalOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<MatrixFolder | null>(null);

  // Drag and drop состояние
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  if (!isSidebarOpen) return null;

  const tree = buildFolderTree(folders, catalog);
  const rootMatrices = catalog.filter((s) => !s.folderId);
  const totalMatricesCount = catalog.length;

  const handleDragStart = (e: React.DragEvent, systemId: string) => {
    e.dataTransfer.setData('text/plain', systemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDragOverTargetId(null);
    const systemId = e.dataTransfer.getData('text/plain');
    if (!systemId) return;

    const currentSys = catalog.find((s) => s.id === systemId);
    if (!currentSys || currentSys.folderId === targetFolderId) return;

    await moveSystemMutation.mutateAsync({ systemId, folderId: targetFolderId });
  };

  const openCreateFolderModal = (parentId: string | null = null) => {
    setEditingFolder(null);
    setDefaultParentId(parentId);
    setFolderModalOpen(true);
  };

  const openEditFolderModal = (folder: MatrixFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setDefaultParentId(folder.parentId);
    setFolderModalOpen(true);
  };

  const openDeleteFolderModal = (folder: MatrixFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderToDelete(folder);
    setDeleteFolderModalOpen(true);
  };

  const openMoveMatrixModal = (matrix: SavedMatrixSystem, e: React.MouseEvent) => {
    e.stopPropagation();
    setMatrixToMove(matrix);
    setMoveModalOpen(true);
  };

  // Рекурсивный рендерер узла папки
  const renderFolderNode = (node: FolderTreeNode, depth = 0) => {
    const isExpanded = Boolean(expandedFolderIds[node.folder.id]);
    const isFolderActive = activeFolderId === node.folder.id;
    const isDragOver = dragOverTargetId === node.folder.id;

    return (
      <div key={node.folder.id} className="space-y-0.5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragOverTargetId !== node.folder.id) {
              setDragOverTargetId(node.folder.id);
            }
          }}
          onDragLeave={() => {
            if (dragOverTargetId === node.folder.id) {
              setDragOverTargetId(null);
            }
          }}
          onDrop={(e) => handleDrop(e, node.folder.id)}
          onClick={() => setActiveFolderId(node.folder.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between pr-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition ${
            isDragOver
              ? 'bg-blue-600/30 border border-blue-500 shadow-sm'
              : isFolderActive
              ? 'bg-blue-600/20 text-blue-300 font-medium'
              : 'text-zinc-300 hover:bg-zinc-800/60'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate pr-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpanded(node.folder.id);
              }}
              className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}

            <span className="truncate">{node.folder.name}</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 font-mono group-hover:hidden">
              {node.totalMatricesCount}
            </span>

            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateFolderModal(node.folder.id);
                }}
                title="Добавить подпапку"
                className="p-1 hover:bg-zinc-700/80 rounded text-zinc-400 hover:text-emerald-400"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => openEditFolderModal(node.folder, e)}
                title="Переименовать"
                className="p-1 hover:bg-zinc-700/80 rounded text-zinc-400 hover:text-blue-400"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => openDeleteFolderModal(node.folder, e)}
                title="Удалить"
                className="p-1 hover:bg-zinc-700/80 rounded text-zinc-400 hover:text-rose-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Раскрытое содержимое: подпапки и матрицы */}
        {isExpanded && (
          <div className="space-y-0.5">
            {/* Дочерние подпапки */}
            {node.children.map((child) => renderFolderNode(child, depth + 1))}

            {/* Матрицы в текущей папке */}
            {node.matrices.map((matrix) => {
              const isSelected = activeSystemId === matrix.id;
              const rowsCount = matrix.sheets.reduce((acc, s) => acc + s.rows.length, 0);

              return (
                <div
                  key={matrix.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, matrix.id)}
                  onClick={() => selectSystem(matrix.id)}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 18}px` }}
                  className={`group flex items-center justify-between pr-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition ${
                    isSelected
                      ? 'bg-blue-600 text-white font-medium shadow-xs'
                      : 'text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate pr-1">
                    <Database
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-white' : 'text-blue-400'
                      }`}
                    />
                    <span className="truncate">{matrix.name}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isSelected
                          ? 'bg-blue-700 text-blue-100'
                          : 'text-zinc-500 group-hover:hidden'
                      }`}
                    >
                      {rowsCount}
                    </span>

                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => openMoveMatrixModal(matrix, e)}
                        title="Переместить в другую папку..."
                        className={`p-1 rounded ${
                          isSelected
                            ? 'hover:bg-blue-700 text-blue-100'
                            : 'hover:bg-zinc-700/80 text-zinc-400 hover:text-emerald-400'
                        }`}
                      >
                        <FolderInput className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Удалить матрицу «${matrix.name}»?`)) {
                            deleteSystemMutation.mutate(matrix.id);
                          }
                        }}
                        title="Удалить матрицу"
                        className={`p-1 rounded ${
                          isSelected
                            ? 'hover:bg-blue-700 text-blue-100'
                            : 'hover:bg-zinc-700/80 text-zinc-400 hover:text-rose-400'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside className="w-64 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full select-none">
        {/* Заголовок сайдбара */}
        <div className="px-3.5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">
              Каталог
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openCreateFolderModal(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition"
              title="Создать папку в корне"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              title="Свернуть боковую панель"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Быстрые корневые переключатели */}
        <div className="p-2 space-y-1 border-b border-zinc-800/80">
          <button
            type="button"
            onClick={() => setActiveFolderId('ALL')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
              activeFolderId === 'ALL'
                ? 'bg-blue-600/20 text-blue-300 font-medium'
                : 'text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>Все матрицы</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">{totalMatricesCount}</span>
          </button>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverTargetId !== '__ROOT__') {
                setDragOverTargetId('__ROOT__');
              }
            }}
            onDragLeave={() => {
              if (dragOverTargetId === '__ROOT__') {
                setDragOverTargetId(null);
              }
            }}
            onDrop={(e) => handleDrop(e, null)}
            onClick={() => setActiveFolderId(null)}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
              dragOverTargetId === '__ROOT__'
                ? 'bg-blue-600/30 border border-blue-500'
                : activeFolderId === null
                ? 'bg-blue-600/20 text-blue-300 font-medium'
                : 'text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-zinc-400" />
              <span>Без папки (корень)</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">{rootMatrices.length}</span>
          </div>

          {/* Открытый несохраненный черновик */}
          {draftSheets.length > 0 && (
            <button
              type="button"
              onClick={() => selectSystem('DRAFT')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border border-amber-500/30 transition ${
                activeSystemId === 'DRAFT'
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Черновик: {draftName}</span>
              </div>
              <span className="text-[10px] text-amber-400/80 font-mono">
                {draftSheets.reduce((acc, s) => acc + s.rows.length, 0)}
              </span>
            </button>
          )}
        </div>

        {/* Дерево папок */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {tree.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500">
              <p>Папок пока нет</p>
              <button
                type="button"
                onClick={() => openCreateFolderModal(null)}
                className="mt-2 text-blue-400 hover:underline text-xs inline-flex items-center gap-1"
              >
                <FolderPlus className="w-3 h-3" />
                <span>Создать первую папку</span>
              </button>
            </div>
          ) : (
            tree.map((node) => renderFolderNode(node, 0))
          )}
        </div>

        {/* Футер сайдбара с подсказкой */}
        <div className="p-2.5 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between">
          <span>Папок: {folders.length}</span>
          <span>Перетащите для переноса</span>
        </div>
      </aside>

      {/* Модалки */}
      <FolderModal
        isOpen={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        initialFolder={editingFolder}
        defaultParentId={defaultParentId}
        folders={folders}
        onSubmit={async ({ name, parentId }) => {
          if (editingFolder) {
            await updateFolderMutation.mutateAsync({
              id: editingFolder.id,
              name,
              parentId,
            });
          } else {
            await createFolderMutation.mutateAsync({ name, parentId });
          }
        }}
      />

      <MoveMatrixModal
        isOpen={moveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          setMatrixToMove(null);
        }}
        matrix={matrixToMove}
        folders={folders}
        onMove={async (systemId, folderId) => {
          await moveSystemMutation.mutateAsync({ systemId, folderId });
        }}
      />

      <DeleteFolderModal
        isOpen={deleteFolderModalOpen}
        onClose={() => {
          setDeleteFolderModalOpen(false);
          setFolderToDelete(null);
        }}
        folder={folderToDelete}
        folders={folders}
        catalog={catalog}
        onConfirmDelete={async (folderId, deleteContents) => {
          await deleteFolderMutation.mutateAsync({ id: folderId, deleteContents });
        }}
      />
    </>
  );
};

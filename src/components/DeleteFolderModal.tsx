import React, { useState } from 'react';
import type { MatrixFolder, SavedMatrixSystem } from '@/types/matrix';
import { getDescendantFolderIds } from '@/utils/folderTree';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeleteFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: MatrixFolder | null;
  folders: MatrixFolder[];
  catalog: SavedMatrixSystem[];
  onConfirmDelete: (folderId: string, deleteContents: boolean) => Promise<void> | void;
}

const DeleteFolderDialog: React.FC<{
  onClose: () => void;
  folder: MatrixFolder;
  folders: MatrixFolder[];
  catalog: SavedMatrixSystem[];
  onConfirmDelete: (folderId: string, deleteContents: boolean) => Promise<void> | void;
}> = ({ onClose, folder, folders, catalog, onConfirmDelete }) => {
  const [deleteContents, setDeleteContents] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const descendantFolderIds = getDescendantFolderIds(folders, folder.id);
  const allFolderIds = [folder.id, ...descendantFolderIds];

  const affectedMatricesCount = catalog.filter(
    (m) => m.folderId && allFolderIds.includes(m.folderId)
  ).length;

  const hasNestedContent = affectedMatricesCount > 0 || descendantFolderIds.length > 0;

  const handleConfirm = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      await onConfirmDelete(folder.id, deleteContents);
      onClose();
    } catch {
      // handled
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Удалить папку</h3>
              <p className="text-xs text-zinc-400">
                Папка: <span className="text-zinc-200 font-medium">«{folder.name}»</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {hasNestedContent ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                В этой папке содержится:
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-zinc-300">
                  {affectedMatricesCount > 0 && (
                    <li>
                      Матриц доступа:{' '}
                      <span className="font-semibold text-amber-200">{affectedMatricesCount}</span>
                    </li>
                  )}
                  {descendantFolderIds.length > 0 && (
                    <li>
                      Вложенных подпапок:{' '}
                      <span className="font-semibold text-amber-200">
                        {descendantFolderIds.length}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Что сделать с содержимым?</label>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800/40 cursor-pointer transition">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={!deleteContents}
                    onChange={() => setDeleteContents(false)}
                    className="mt-0.5 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-medium text-zinc-200">
                      Сохранить матрицы (безопасно)
                    </span>
                    <span className="block text-[11px] text-zinc-400">
                      Переместить матрицы и подпапки на уровень выше (в родительскую папку или корень)
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteContents}
                    onChange={() => setDeleteContents(true)}
                    className="mt-0.5 text-rose-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-medium text-rose-300">
                      Удалить папку вместе со всеми матрицами
                    </span>
                    <span className="block text-[11px] text-rose-400/80">
                      Все матрицы и подпапки внутри будут безвозвратно удалены из БД
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-300">
            Вы уверены, что хотите удалить пустую папку «
            <span className="text-zinc-100 font-medium">{folder.name}</span>»?
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 border border-zinc-700 transition"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-40 shadow-sm"
          >
            {isDeleting ? 'Удаление...' : 'Удалить папку'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const DeleteFolderModal: React.FC<DeleteFolderModalProps> = ({
  isOpen,
  onClose,
  folder,
  folders,
  catalog,
  onConfirmDelete,
}) => {
  if (!isOpen || !folder) return null;
  return (
    <DeleteFolderDialog
      onClose={onClose}
      folder={folder}
      folders={folders}
      catalog={catalog}
      onConfirmDelete={onConfirmDelete}
    />
  );
};

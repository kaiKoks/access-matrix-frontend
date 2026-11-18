import React, { useState } from 'react';
import type { MatrixFolder, SavedMatrixSystem } from '@/types/matrix';
import { getFolderBreadcrumbString } from '@/utils/folderTree';
import { FolderInput, Database, X } from 'lucide-react';

interface MoveMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  matrix: SavedMatrixSystem | null;
  folders: MatrixFolder[];
  onMove: (systemId: string, folderId: string | null) => Promise<void> | void;
}

const MoveMatrixDialog: React.FC<{
  onClose: () => void;
  matrix: SavedMatrixSystem;
  folders: MatrixFolder[];
  onMove: (systemId: string, folderId: string | null) => Promise<void> | void;
}> = ({ onClose, matrix, folders, onMove }) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(matrix.folderId ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentFolderStr =
    getFolderBreadcrumbString(folders, matrix.folderId) || 'Корень (без папки)';

  const handleConfirm = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onMove(matrix.id, selectedFolderId);
      onClose();
    } catch {
      // handled
    } finally {
      setIsSubmitting(false);
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
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FolderInput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Переместить матрицу</h3>
              <p className="text-xs text-zinc-400 truncate max-w-72">
                Матрица: <span className="text-zinc-200 font-medium">«{matrix.name}»</span>
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

        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            Текущее расположение:{' '}
            <span className="font-medium text-blue-400">📁 {currentFolderStr}</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Выберите новую целевую папку
            </label>
            <div className="max-h-60 overflow-y-auto space-y-1 border border-zinc-800 rounded-lg p-1.5 bg-zinc-950">
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left transition ${
                  selectedFolderId === null
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span>📁 Корень (без папки)</span>
              </button>

              {folders.map((f) => {
                const pathStr = getFolderBreadcrumbString(folders, f.id);
                const isSelected = selectedFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFolderId(f.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left transition ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="truncate">📁 {pathStr}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 shadow-sm"
          >
            {isSubmitting ? 'Перемещение...' : 'Переместить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const MoveMatrixModal: React.FC<MoveMatrixModalProps> = ({
  isOpen,
  onClose,
  matrix,
  folders,
  onMove,
}) => {
  if (!isOpen || !matrix) return null;
  return <MoveMatrixDialog onClose={onClose} matrix={matrix} folders={folders} onMove={onMove} />;
};

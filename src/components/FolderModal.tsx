import React, { useState, useEffect } from 'react';
import type { MatrixFolder } from '@/types/matrix';
import { getDescendantFolderIds, getFolderBreadcrumbString } from '@/utils/folderTree';
import { Folder, FolderPlus, X } from 'lucide-react';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFolder?: MatrixFolder | null;
  defaultParentId?: string | null;
  folders: MatrixFolder[];
  onSubmit: (data: { name: string; parentId: string | null }) => Promise<void> | void;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  initialFolder,
  defaultParentId,
  folders,
  onSubmit,
}) => {
  const isEditing = Boolean(initialFolder);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialFolder) {
        setName(initialFolder.name);
        setParentId(initialFolder.parentId);
      } else {
        setName('');
        setParentId(defaultParentId ?? null);
      }
      setIsSubmitting(false);
    }
  }, [isOpen, initialFolder, defaultParentId]);

  if (!isOpen) return null;

  // Нельзя выбирать родителем саму себя или своих потомков
  const invalidParentIds = new Set<string>();
  if (initialFolder) {
    invalidParentIds.add(initialFolder.id);
    const descendants = getDescendantFolderIds(folders, initialFolder.id);
    descendants.forEach((id) => invalidParentIds.add(id));
  }

  const availableParents = folders.filter((f) => !invalidParentIds.has(f.id));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit({ name: cleanName, parentId });
      onClose();
    } catch {
      // Ошибка обрабатывается на уровне мутации
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
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {isEditing ? <Folder className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {isEditing ? 'Переименовать папку' : 'Создать новую папку'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isEditing
                  ? 'Измените название или расположение папки'
                  : 'Задайте имя и выберите расположение в дереве'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Название папки <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Продакшн, Сегмент БД, Серверы..."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Родительская папка (расположение)
            </label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value ? e.target.value : null)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="">📁 Корень (без родительской папки)</option>
              {availableParents.map((f) => {
                const pathStr = getFolderBreadcrumbString(folders, f.id);
                return (
                  <option key={f.id} value={f.id}>
                    📁 {pathStr}
                  </option>
                );
              })}
            </select>
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
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmitting ? 'Сохранение...' : isEditing ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  Plus,
  Pencil,
  Download,
  Play,
  Loader2,
  Layers,
  Save,
  X,
} from 'lucide-react';
import { SmartSearchInput } from '@/components/SmartSearchInput';
import { exportFilteredGroupsToExcel } from '@/services/networkTester';
import type {
  DetectedColumn,
  MatrixViewGroup,
  NetworkCheckStatus,
  SavedMatrixSystem,
} from '@/types/matrix';

export type StatusFilterOption = 'all' | NetworkCheckStatus;

interface MatrixToolbarProps {
  systems: SavedMatrixSystem[];
  activeSystemId: string;
  onSelectSystem: (systemId: string) => void;

  hasDraft: boolean;
  draftName: string;
  onDraftNameChange: (name: string) => void;
  onSaveDraftClick: () => void;
  onDiscardDraftClick: () => void;
  isSavingDraft?: boolean;

  searchQuery: string;
  onSearchChange: (query: string) => void;

  statusFilter: StatusFilterOption;
  onStatusFilterChange: (status: StatusFilterOption) => void;

  activeColumns: DetectedColumn[];
  filteredGroups: MatrixViewGroup[];
  totalRowsCount: number;
  filteredRowsCount: number;

  onOpenExcelClick: () => void;
  onCreateMatrixClick: () => void;
  onEditMatrixClick?: () => void;
  onRunBulkCheck?: () => void;
  isBulkChecking?: boolean;
}

const STATUS_TABS: Array<{ id: StatusFilterOption; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'accessible', label: 'Доступен' },
  { id: 'blocked', label: 'Закрыт' },
  { id: 'error', label: 'Ошибка API' },
  { id: 'untestable', label: 'Недоступно' },
  { id: 'idle', label: 'Не проверялось' },
];

export const MatrixToolbar: React.FC<MatrixToolbarProps> = ({
  systems,
  activeSystemId,
  onSelectSystem,
  hasDraft,
  draftName,
  onDraftNameChange,
  onSaveDraftClick,
  onDiscardDraftClick,
  isSavingDraft = false,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  activeColumns,
  filteredGroups,
  totalRowsCount,
  filteredRowsCount,
  onOpenExcelClick,
  onCreateMatrixClick,
  onEditMatrixClick,
  onRunBulkCheck,
  isBulkChecking = false,
}) => {
  const activeSystemName = useMemo(() => {
    if (activeSystemId === 'ALL') return 'all_matrices';
    if (activeSystemId === 'DRAFT') return draftName.trim() || 'draft_matrix';
    return systems.find((s) => s.id === activeSystemId)?.name || 'access_matrix';
  }, [activeSystemId, draftName, systems]);

  const testableFilteredCount = useMemo(
    () =>
      filteredGroups.reduce(
        (acc, g) => acc + g.rows.filter((r) => r.meta.isTestable).length,
        0
      ),
    [filteredGroups]
  );

  const handleExport = () => {
    if (filteredGroups.length === 0) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportFilteredGroupsToExcel(filteredGroups, `${activeSystemName}_${dateStamp}.xlsx`);
  };

  return (
    <header className="px-5 py-3.5 bg-zinc-950/90 border-b border-zinc-800/90 space-y-3 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Левая группа: селектор матрицы и работа с файлами/редактором */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Layers className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            <select
              value={activeSystemId}
              onChange={(e) => onSelectSystem(e.target.value)}
              className="pl-8 pr-7 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-100 focus:outline-none focus:border-blue-500/70 transition cursor-pointer"
            >
              <option value="ALL">Все матрицы ({systems.length})</option>
              {hasDraft && (
                <option value="DRAFT">
                  * Черновик: {draftName || 'Новая матрица'} (не сохранено)
                </option>
              )}
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenExcelClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-medium transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span>Открыть (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={onCreateMatrixClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Создать матрицу</span>
          </button>

          {onEditMatrixClick && (activeSystemId !== 'ALL' || hasDraft) && (
            <button
              type="button"
              onClick={onEditMatrixClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-medium transition"
            >
              <Pencil className="w-3.5 h-3.5 text-zinc-400" />
              <span>Редактировать</span>
            </button>
          )}
        </div>

        {/* Правая группа: сохранение открытого черновика, экспорт и массовая проверка */}
        <div className="flex flex-wrap items-center gap-2">
          {hasDraft && activeSystemId === 'DRAFT' && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <input
                type="text"
                value={draftName}
                onChange={(e) => onDraftNameChange(e.target.value)}
                placeholder="Название матрицы..."
                className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-400/60 w-44"
              />
              <button
                type="button"
                disabled={isSavingDraft}
                onClick={onSaveDraftClick}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold transition"
                title="Сохранить открытую матрицу в каталог"
              >
                {isSavingDraft ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Сохранить матрицу</span>
              </button>
              <button
                type="button"
                onClick={onDiscardDraftClick}
                className="p-1 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-zinc-900/60 transition"
                title="Закрыть черновик без сохранения"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={filteredRowsCount === 0}
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-medium transition"
            title="Выгрузить отфильтрованные строки в Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Экспорт (.xlsx)</span>
          </button>

          {onRunBulkCheck && (
            <button
              type="button"
              disabled={testableFilteredCount === 0 || isBulkChecking}
              onClick={onRunBulkCheck}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold transition shadow-sm"
            >
              {isBulkChecking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Проверка...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Проверить все ({testableFilteredCount})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Нижний ряд: умный поиск с поддержкой @матриц и фильтр статусов */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SmartSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          columns={activeColumns}
          systems={systems}
        />

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            {STATUS_TABS.map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onStatusFilterChange(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 text-[11px] text-zinc-400 font-mono">
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500" />
            {filteredRowsCount} / {totalRowsCount}
          </span>
        </div>
      </div>
    </header>
  );
};

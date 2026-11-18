import React from 'react';
import { Play, Loader2, Pencil } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import type { DynamicMatrixRow, MatrixViewGroup } from '@/types/matrix';

interface MatrixTableSectionProps {
  group: MatrixViewGroup;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onCheckRow: (row: DynamicMatrixRow) => void;
  onEditMatrix?: () => void;
}

export const MatrixTableSection: React.FC<MatrixTableSectionProps> = ({
  group,
  selectedRowId,
  onSelectRow,
  onCheckRow,
  onEditMatrix,
}) => {
  let lastRenderedSection: string | undefined;

  return (
    <section className="rounded-2xl bg-zinc-900/50 border border-zinc-800/90 overflow-hidden shadow-lg">
      <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
          <span className="text-blue-400">{group.systemName}</span>
          <span className="text-zinc-600">/</span>
          <span>{group.sheetName}</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400 font-mono">
            {group.rows.length}
          </span>
        </div>

        {onEditMatrix && (
          <button
            type="button"
            onClick={onEditMatrix}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
          >
            <Pencil className="w-3 h-3" />
            <span>Редактировать правила</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-950/60 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400">
              <th className="py-2.5 px-3 w-14">Тест</th>
              <th className="py-2.5 px-3 w-40">Статус доступа</th>
              {group.columns.map((col) => (
                <th key={col.key} className="py-2.5 px-3 min-w-[150px]">
                  {col.headerTitle}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800/70">
            {group.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={group.columns.length + 2}
                  className="py-8 px-4 text-center text-xs text-zinc-500"
                >
                  В этой матрице пока нет правил доступа. Нажмите «Редактировать», чтобы добавить строки.
                </td>
              </tr>
            ) : (
              group.rows.map((row) => {
                const isSelected = row.__id === selectedRowId;
                const isRowChecking = row.checkStatus === 'checking';
                const showSectionHeader =
                  row.__sectionTitle && row.__sectionTitle !== lastRenderedSection;

                if (row.__sectionTitle) {
                  lastRenderedSection = row.__sectionTitle;
                }

                return (
                  <React.Fragment key={row.__id}>
                    {showSectionHeader && (
                      <tr className="bg-zinc-950/90">
                        <td
                          colSpan={group.columns.length + 2}
                          className="py-2 px-4 text-[11px] font-semibold text-blue-300/90 tracking-wide"
                        >
                          {row.__sectionTitle}
                        </td>
                      </tr>
                    )}

                    <tr
                      onClick={() => onSelectRow(row.__id)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-blue-500/10' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <td
                        className="py-2.5 px-3 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={!row.meta.isTestable || isRowChecking}
                          onClick={() => onCheckRow(row)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600 disabled:opacity-30 disabled:pointer-events-none text-zinc-200 hover:text-white transition"
                          title="Проверить это правило"
                        >
                          {isRowChecking ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        <StatusBadge
                          status={row.checkStatus}
                          reason={row.meta.untestableReason}
                          errorMessage={row.errorMessage}
                          socketResults={row.socketResults}
                        />
                      </td>

                      {group.columns.map((col) => (
                        <td
                          key={col.key}
                          className="py-2.5 px-3 align-top text-zinc-200 whitespace-pre-line font-mono text-[11px] leading-relaxed"
                        >
                          {String(row.rawValues[col.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

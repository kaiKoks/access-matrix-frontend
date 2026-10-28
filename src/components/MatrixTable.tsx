import React, { useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import { useCatalogQuery, useCheckRowMutation } from '@/hooks/useMatrixQueries';
import type { DetectedColumn, MatrixViewGroup } from '@/types/matrix';
import { StatusBadge } from '@/components/StatusBadge';
import { PortCell } from '@/components/PortCell';
import { EndpointCell } from '@/components/EndpointCell';
import { buildVisibleMatrixGroups } from '@/components/Toolbar';
import { Play, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface SortConfig {
  groupId: string;
  key: string;
  direction: 'asc' | 'desc';
}

// Определяет, нужно ли центрировать содержимое колонки по горизонтали
function isColumnCentered(col: DetectedColumn): boolean {
  return (
    col.semanticRole === 'index' ||
    col.semanticRole === 'protocol' ||
    col.semanticRole === 'term' ||
    col.semanticRole === 'port' ||
    col.semanticRole === 'port_tcp' ||
    col.semanticRole === 'port_udp'
  );
}

export const MatrixTable: React.FC = () => {
  const { data: catalog = [] } = useCatalogQuery();
  const checkRowMutation = useCheckRowMutation();

  const {
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    statusFilter,
    selectedRowId,
    setSelectedRowId,
  } = useMatrixStore();

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const visibleGroups = buildVisibleMatrixGroups({
    catalog,
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    statusFilter,
  });
  const handleSort = (groupId: string, key: string) => {
    setSortConfig((prev) => {
      if (prev?.groupId === groupId && prev.key === key) {
        return prev.direction === 'asc' ? { groupId, key, direction: 'desc' } : null;
      }
      return { groupId, key, direction: 'asc' };
    });
  };

  if (visibleGroups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-12 space-y-1">
        <p className="text-sm text-zinc-300">
          Загрузите Excel-файл матрицы (.xlsx) для начала работы
        </p>
        <p className="text-xs text-zinc-500">
          После загрузки нажмите «Сохранить на бэк», чтобы вызывать матрицу через @ в поиске
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {visibleGroups.map((group: MatrixViewGroup) => {
        const sortedRows =
          sortConfig && sortConfig.groupId === group.groupId
            ? [...group.rows].sort((a, b) => {
              const aVal = String(a.rawValues[sortConfig.key] ?? '');
              const bVal = String(b.rawValues[sortConfig.key] ?? '');
              const cmp = aVal.localeCompare(bVal, 'ru', { numeric: true });
              return sortConfig.direction === 'asc' ? cmp : -cmp;
            })
            : group.rows;

        return (
          <div
            key={group.groupId}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl shadow-sm overflow-hidden"
          >
            {/* Заголовок матрицы (отображается при выводе нескольких матриц или всегда для наглядности) */}
            <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-100">{group.systemName}</span>
                <span className="text-xs text-zinc-500">/ {group.sheetName}</span>
              </div>
              <span className="text-[11px] text-zinc-400">
                Правил: {sortedRows.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-900/95 border-b border-zinc-800 text-zinc-400 font-medium">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">№</th>
                    <th className="py-3 px-4 w-40 text-center">Статус доступа</th>
                    {group.columns.map((col) => {
                      const isSorted =
                        sortConfig?.groupId === group.groupId && sortConfig.key === col.key;
                      const centered = isColumnCentered(col);

                      return (
                        <th
                          key={col.key}
                          className={`py-3 px-4 whitespace-nowrap ${centered ? 'text-center' : 'text-left'
                            }`}
                        >
                          <button
                            onClick={() => handleSort(group.groupId, col.key)}
                            className={`inline-flex items-center gap-1.5 hover:text-zinc-200 transition font-medium ${centered ? 'justify-center mx-auto' : 'text-left'
                              }`}
                          >
                            <span>{col.headerTitle}</span>
                            {isSorted ? (
                              sortConfig.direction === 'asc' ? (
                                <ArrowUp className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                    <th className="py-3 px-4 w-20 text-center">Тест</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  {sortedRows.map((row, index) => {
                    const isSelected = row.__id === selectedRowId;
                    const prevSection =
                      index > 0 ? sortedRows[index - 1].__sectionTitle : undefined;
                    const showSectionBanner =
                      row.__sectionTitle && row.__sectionTitle !== prevSection;

                    return (
                      <React.Fragment key={row.__id}>
                        {showSectionBanner && (
                          <tr className="bg-zinc-800/70 border-y border-zinc-700/60">
                            <td
                              colSpan={group.columns.length + 3}
                              className="py-2 px-4 font-semibold text-zinc-200 tracking-wide uppercase text-[11px] text-center"
                            >
                              {row.__sectionTitle}
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => setSelectedRowId(row.__id)}
                          className={`transition cursor-pointer ${isSelected ? 'bg-blue-950/30' : 'hover:bg-zinc-800/40'
                            }`}
                        >
                          <td className="py-3 px-4 text-center font-mono text-zinc-500 align-middle">
                            {row.__rowNumber}
                          </td>
                          <td className="py-3 px-4 text-center align-middle">
                            <StatusBadge
                              status={row.checkStatus}
                              reason={row.meta.untestableReason}
                              socketResults={row.socketResults}
                            />
                          </td>
                          {group.columns.map((col) => {
                            const val = row.rawValues[col.key];
                            const isEndpoint =
                              col.semanticRole === 'source' || col.semanticRole === 'destination';
                            const isPort =
                              col.semanticRole === 'port_tcp' ||
                              col.semanticRole === 'port_udp' ||
                              col.semanticRole === 'port';
                            const centered = isColumnCentered(col);

                            return (
                              <td
                                key={col.key}
                                className={`py-3 px-4 max-w-md align-middle ${centered ? 'text-center' : 'text-left'
                                  }`}
                              >
                                {isEndpoint ? (
                                  <EndpointCell value={val} />
                                ) : isPort ? (
                                  <PortCell
                                    value={val}
                                    isTcp={col.semanticRole === 'port_tcp'}
                                    isUdp={col.semanticRole === 'port_udp'}
                                    dictionary={group.portDictionary}
                                  />
                                ) : (
                                  <span className="leading-relaxed">{String(val ?? '—')}</span>
                                )}
                              </td>
                            );
                          })}
                          <td
                            className="py-3 px-4 text-center align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              disabled={!row.meta.isTestable || row.checkStatus === 'checking'}
                              onClick={() => checkRowMutation.mutate(row)}
                              title={
                                row.meta.untestableReason || 'Проверить доступность правила'
                              }
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white transition disabled:opacity-20 disabled:pointer-events-none"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {sortedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={group.columns.length + 3}
                        className="py-8 text-center text-zinc-500"
                      >
                        Записи не найдены
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};
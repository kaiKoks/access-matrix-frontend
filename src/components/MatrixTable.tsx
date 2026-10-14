import React, { useMemo, useState } from 'react';
import { useMatrixStore } from '../store/useMatrixStore';
import type { DynamicMatrixRow } from '../types/matrix';
import { StatusBadge } from './StatusBadge';
import { PortCell } from './PortCell';
import { EndpointCell } from './EndpointCell';
import { Play, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export const MatrixTable: React.FC = () => {
  const {
    sheets,
    activeSheetIndex,
    searchQuery,
    statusFilter,
    selectedRowId,
    setSelectedRowId,
    checkSingleRow,
  } = useMatrixStore();

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const activeSheet = sheets[activeSheetIndex];

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  };

  const processedRows = useMemo<DynamicMatrixRow[]>(() => {
    if (!activeSheet) return [];

    // 1. Фильтрация по статусу и поисковому запросу
    const filtered = activeSheet.rows.filter((row: DynamicMatrixRow) => {
      if (statusFilter !== 'all' && row.checkStatus !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return Object.values(row.rawValues).some((v) =>
        String(v ?? '').toLowerCase().includes(q)
      );
    });

    // 2. Сортировка по выбранной колонке
    if (!sortConfig) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = String(a.rawValues[sortConfig.key] ?? '');
      const bVal = String(b.rawValues[sortConfig.key] ?? '');
      const cmp = aVal.localeCompare(bVal, 'ru', { numeric: true });
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [activeSheet, searchQuery, statusFilter, sortConfig]);

  if (!activeSheet) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-12">
        <p className="text-sm">
          Загрузите любой Excel-файл матрицы (.xlsx) для автоматического разбора
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-zinc-900/50 border border-zinc-800 rounded-xl shadow-sm">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-zinc-900/95 sticky top-0 z-10 backdrop-blur border-b border-zinc-800 text-zinc-400 font-medium">
          <tr>
            <th className="py-3 px-4 w-12 text-center">№</th>
            <th className="py-3 px-4 w-36">Статус доступа</th>
            {activeSheet.columns.map((col) => {
              const isSorted = sortConfig?.key === col.key;
              return (
                <th key={col.key} className="py-3 px-4 whitespace-nowrap">
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1.5 hover:text-zinc-200 transition text-left font-medium"
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
          {processedRows.map((row, index) => {
            const isSelected = row.__id === selectedRowId;
            const prevSection = index > 0 ? processedRows[index - 1].__sectionTitle : undefined;
            const showSectionBanner = row.__sectionTitle && row.__sectionTitle !== prevSection;

            return (
              <React.Fragment key={row.__id}>
                {showSectionBanner && (
                  <tr className="bg-zinc-800/70 border-y border-zinc-700/60">
                    <td
                      colSpan={activeSheet.columns.length + 3}
                      className="py-2 px-4 font-semibold text-zinc-200 tracking-wide uppercase text-[11px]"
                    >
                      {row.__sectionTitle}
                    </td>
                  </tr>
                )}
                <tr
                  onClick={() => setSelectedRowId(row.__id)}
                  className={`transition cursor-pointer ${
                    isSelected ? 'bg-blue-950/30' : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <td className="py-3 px-4 text-center font-mono text-zinc-500 align-top">
                    {row.__rowNumber}
                  </td>
                  <td className="py-3 px-4 align-top">
                    <StatusBadge
                      status={row.checkStatus}
                      reason={row.meta.untestableReason}
                    />
                  </td>
                  {activeSheet.columns.map((col) => {
                    const val = row.rawValues[col.key];
                    const isEndpoint =
                      col.semanticRole === 'source' || col.semanticRole === 'destination';
                    const isPort =
                      col.semanticRole === 'port_tcp' ||
                      col.semanticRole === 'port_udp' ||
                      col.semanticRole === 'port';

                    return (
                      <td key={col.key} className="py-3 px-4 max-w-md align-top">
                        {isEndpoint ? (
                          <EndpointCell value={val} />
                        ) : isPort ? (
                          <PortCell
                            value={val}
                            isTcp={col.semanticRole === 'port_tcp'}
                            isUdp={col.semanticRole === 'port_udp'}
                            dictionary={activeSheet.portDictionary}
                          />
                        ) : (
                          <span className="leading-relaxed">{String(val ?? '—')}</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className="py-3 px-4 text-center align-top"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      disabled={!row.meta.isTestable || row.checkStatus === 'checking'}
                      onClick={() => checkSingleRow(row.__id)}
                      title={row.meta.untestableReason || 'Проверить доступность правила'}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white transition disabled:opacity-20 disabled:pointer-events-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
          {processedRows.length === 0 && (
            <tr>
              <td
                colSpan={activeSheet.columns.length + 3}
                className="py-12 text-center text-zinc-500"
              >
                Записи, удовлетворяющие условиям фильтра, не найдены
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
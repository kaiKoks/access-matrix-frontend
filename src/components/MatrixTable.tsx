import React from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import { StatusBadge } from '@/components/StatusBadge';
import { PortCell } from '@/components/PortCell';
import { Play } from 'lucide-react';

export const MatrixTable: React.FC = () => {
  const { sheets, activeSheetIndex, searchQuery, statusFilter, setSelectedRow, checkSingleRow } = useMatrixStore();
  const activeSheet = sheets[activeSheetIndex];

  if (!activeSheet) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-12">
        <p className="text-base">Загрузите Excel-файл матрицы для начала работы</p>
      </div>
    );
  }

  // Фильтрация
  const filteredRows = activeSheet.rows.filter(row => {
    if (statusFilter !== 'all' && row.checkStatus !== statusFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return Object.values(row.rawValues).some(v => String(v || '').toLowerCase().includes(query));
  });

  return (
    <div className="flex-1 overflow-auto bg-zinc-900/50 border border-zinc-800 rounded-xl shadow-sm">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-zinc-900/90 sticky top-0 z-10 backdrop-blur border-b border-zinc-800 text-zinc-400 font-medium">
          <tr>
            <th className="py-3 px-4 w-12 text-center">№</th>
            <th className="py-3 px-4 w-36">Статус</th>
            {activeSheet.columns.map(col => (
              <th key={col.key} className="py-3 px-4 whitespace-nowrap">
                {col.headerTitle}
              </th>
            ))}
            <th className="py-3 px-4 w-20 text-center">Тест</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
          {filteredRows.map((row) => (
            <tr 
              key={row.__id}
              onClick={() => setSelectedRow(row)}
              className="hover:bg-zinc-800/40 transition cursor-pointer group"
            >
              <td className="py-3 px-4 text-center font-mono text-zinc-500">{row.__rowNumber}</td>
              <td className="py-3 px-4">
                <StatusBadge status={row.checkStatus} />
              </td>
              {activeSheet.columns.map(col => {
                const val = row.rawValues[col.key];
                const isTcp = col.semanticRole === 'port_tcp';
                const isUdp = col.semanticRole === 'port_udp';
                const isPort = isTcp || isUdp || col.semanticRole === 'port';

                return (
                  <td key={col.key} className="py-3 px-4 max-w-md break-words">
                    {isPort ? (
                      <PortCell value={val} isTcp={isTcp} isUdp={isUdp} />
                    ) : (
                      <span className="leading-relaxed">{String(val ?? '—')}</span>
                    )}
                  </td>
                );
              })}
              <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                <button
                  disabled={!row.meta?.isTestable || row.checkStatus === 'checking'}
                  onClick={() => checkSingleRow(row.__id)}
                  title={row.meta?.isTestable ? 'Запустить проверку' : 'Хост недоступен для проверки'}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white transition disabled:opacity-20 disabled:pointer-events-none"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </td>
            </tr>
          ))}
          {filteredRows.length === 0 && (
            <tr>
              <td colSpan={activeSheet.columns.length + 3} className="py-12 text-center text-zinc-500">
                Записи, удовлетворяющие условиям фильтра, не найдены
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
import React from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import { StatusBadge } from '@/components/StatusBadge';
import { X, Play, Terminal } from 'lucide-react';

export const RowDetailDrawer: React.FC = () => {
  const { selectedRow, setSelectedRow, checkSingleRow } = useMatrixStore();

  if (!selectedRow) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col p-6 animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h3 className="font-semibold text-zinc-100">Правило доступа #{selectedRow.__rowNumber}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Диагностика сетевого правила</p>
        </div>
        <button 
          onClick={() => setSelectedRow(null)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-5 space-y-5 text-sm">
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Статус</label>
          <div className="mt-1.5 flex items-center gap-3">
            <StatusBadge status={selectedRow.checkStatus} />
            {selectedRow.lastCheckedAt && (
              <span className="text-xs text-zinc-500">Проверено: {selectedRow.lastCheckedAt}</span>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Сетевые узлы</label>
          <div className="mt-2 space-y-2 bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-xs">
            <div>
              <span className="text-zinc-400">Source:</span>
              <p className="text-zinc-200 break-all">{selectedRow.meta?.sources?.join(', ') || '—'}</p>
            </div>
            <div className="pt-2 border-t border-zinc-900">
              <span className="text-zinc-400">Destination:</span>
              <p className="text-zinc-200 break-all">{selectedRow.meta?.destinations?.join(', ') || '—'}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            Лог проверки
          </label>
          <pre className="mt-2 p-3 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-lg border border-zinc-800 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {selectedRow.checkLog || 'Проверка еще не запускалась.'}
          </pre>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800">
        <button
          disabled={!selectedRow.meta?.isTestable || selectedRow.checkStatus === 'checking'}
          onClick={() => checkSingleRow(selectedRow.__id)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" />
          Запустить сетевой тест
        </button>
      </div>
    </div>
  );
};
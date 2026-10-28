import React, { useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import { useCatalogQuery, useCheckRowMutation } from '@/hooks/useMatrixQueries';
import { StatusBadge } from '@/components/StatusBadge';
import { buildAllSocketCombinations } from '@/services/networkTester';
import type { DynamicMatrixRow } from '@/types/matrix';
import { X, Play, Terminal, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';

export const RowDetailDrawer: React.FC = () => {
  const { data: catalog = [] } = useCatalogQuery();
  const checkRowMutation = useCheckRowMutation();

  const { draftSheets, selectedRowId, setSelectedRowId } = useMatrixStore();
  const [comboFilter, setComboFilter] = useState<'all' | 'accessible' | 'blocked'>('all');

  let selectedRow: DynamicMatrixRow | null = null;
  if (selectedRowId) {
    for (const sh of draftSheets) {
      const found = sh.rows.find((r) => r.__id === selectedRowId);
      if (found) {
        selectedRow = found;
        break;
      }
    }
    if (!selectedRow) {
      for (const sys of catalog) {
        for (const sh of sys.sheets) {
          const found = sh.rows.find((r) => r.__id === selectedRowId);
          if (found) {
            selectedRow = found;
            break;
          }
        }
        if (selectedRow) break;
      }
    }
  }

  if (!selectedRow) return null;

  const previewCombinations = buildAllSocketCombinations(selectedRow);
  const results = selectedRow.socketResults || [];
  const openCount = results.filter((r) => r.status === 'accessible').length;
  const blockedCount = results.filter((r) => r.status === 'blocked').length;

  const filteredResults = results.filter((r) => {
    if (comboFilter === 'all') return true;
    return r.status === comboFilter;
  });

  return (
    <div className="fixed inset-y-0 right-0 w-[460px] max-w-full bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col p-6">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-100">
              Правило доступа #{selectedRow.__rowNumber}
            </h3>
            {selectedRow.__systemName && (
              <span className="px-2 py-0.5 rounded border border-blue-500/20 text-[11px] font-medium">
                {selectedRow.__systemName}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {selectedRow.__sectionTitle || 'Детализация всех сетевых связок'}
          </p>
        </div>
        <button
          onClick={() => setSelectedRowId(null)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-5 space-y-5 text-sm">
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
            Статус правила
          </label>
          <div className="mt-1.5 flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <StatusBadge
              status={selectedRow.checkStatus}
              reason={selectedRow.meta.untestableReason}
              socketResults={selectedRow.socketResults}
            />
            {selectedRow.lastCheckedAt && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {selectedRow.lastCheckedAt}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
              Связки IP × Порт ({results.length || previewCombinations.length})
            </label>

            {results.length > 0 && (
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={() => setComboFilter('all')}
                  className={`px-2 py-0.5 rounded ${
                    comboFilter === 'all'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Все ({results.length})
                </button>
                <button
                  onClick={() => setComboFilter('accessible')}
                  className={`px-2 py-0.5 rounded ${
                    comboFilter === 'accessible'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Открыты ({openCount})
                </button>
                <button
                  onClick={() => setComboFilter('blocked')}
                  className={`px-2 py-0.5 rounded ${
                    comboFilter === 'blocked'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Закрыты ({blockedCount})
                </button>
              </div>
            )}
          </div>

          <div className="divide-y divide-zinc-800/70 bg-zinc-950 rounded-lg border border-zinc-800 max-h-80 overflow-y-auto text-xs font-mono">
            {results.length > 0
              ? filteredResults.map((s) => (
                  <div key={s.id} className="p-3 space-y-1.5 hover:bg-zinc-900/60 transition">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                        {s.protocol} : {s.port}
                      </span>
                      {s.status === 'accessible' ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-sans font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Доступен (lastvalue: 1)
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1 font-sans font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Закрыт (lastvalue: 0)
                        </span>
                      )}
                    </div>

                    <div className="text-zinc-300 break-all flex items-center gap-1.5 text-[11px]">
                      <span className="text-zinc-400">{s.source}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="text-zinc-100">{s.destination}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                      <span>Ключ: {s.zabbixKey}</span>
                      <span>
                        lastclock: {new Date(s.lastclock * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              : previewCombinations.map((c) => (
                  <div key={c.id} className="p-3 space-y-1 text-zinc-400">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">
                        {c.protocol} порт {c.port}
                      </span>
                      <span className="text-[10px] text-zinc-500">Ожидает опроса</span>
                    </div>
                    <div className="text-[11px] break-all">
                      {c.source} → {c.destination}
                    </div>
                    <div className="text-[10px] text-zinc-600">Zabbix key: {c.zabbixKey}</div>
                  </div>
                ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            Лог проверки 
          </label>
          <pre className="mt-2 p-3 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-lg border border-zinc-800 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-52">
            {selectedRow.checkLog || 'Проверка еще не запускалась.'}
          </pre>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800">
        <button
          disabled={!selectedRow.meta.isTestable || selectedRow.checkStatus === 'checking'}
          onClick={() => checkRowMutation.mutate(selectedRow)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" />
          Запустить сетевой тест ({previewCombinations.length})
        </button>
      </div>
    </div>
  );
};
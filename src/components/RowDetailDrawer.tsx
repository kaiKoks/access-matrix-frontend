import React, { useState, useMemo } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import { useCatalogQuery, useCheckRowMutation } from '@/hooks/useMatrixQueries';
import { buildAllSocketCombinations } from '@/services/networkTester';
import { StatusBadge } from '@/components/StatusBadge';
import type { DynamicMatrixRow } from '@/types/matrix';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Terminal,
  AlertTriangle,
  Clock,
  Info,
  Loader2,
} from 'lucide-react';

type SocketFilterTab = 'all' | 'accessible' | 'blocked' | 'untestable';

export const RowDetailDrawer: React.FC = () => {
  const { data: catalog = [] } = useCatalogQuery();
  const checkRowMutation = useCheckRowMutation();

  const {
    selectedRowId,
    setSelectedRowId,
    activeSystemId,
    draftSheets,
  } = useMatrixStore();

  const [socketFilter, setSocketFilter] = useState<SocketFilterTab>('all');

  const selectedRow: DynamicMatrixRow | null = useMemo(() => {
    if (!selectedRowId) return null;

    if (activeSystemId === 'DRAFT') {
      for (const sh of draftSheets) {
        const found = sh.rows.find((r) => r.__id === selectedRowId);
        if (found) return found;
      }
    }

    for (const sys of catalog) {
      for (const sh of sys.sheets) {
        const found = sh.rows.find((r) => r.__id === selectedRowId);
        if (found) return found;
      }
    }

    return null;
  }, [selectedRowId, activeSystemId, draftSheets, catalog]);

  if (!selectedRow) return null;

  const hasActualResults =
    Array.isArray(selectedRow.socketResults) && selectedRow.socketResults.length > 0;

  const displayedSockets = hasActualResults
    ? selectedRow.socketResults!
    : buildAllSocketCombinations(selectedRow);

  const openCount = displayedSockets.filter((s) => s.status === 'accessible').length;
  const blockedCount = displayedSockets.filter((s) => s.status === 'blocked').length;
  const untestableCount = displayedSockets.filter((s) => s.status === 'untestable').length;

  const filteredSockets = displayedSockets.filter((s) => {
    if (socketFilter === 'all') return true;
    return s.status === socketFilter;
  });

  const isChecking = selectedRow.checkStatus === 'checking';

  return (
    <aside className="w-[430px] shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shadow-2xl z-30">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Правило доступа #{selectedRow.__rowNumber}
            </h2>
            {selectedRow.__systemName && (
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-medium text-zinc-300 border border-zinc-700/70">
                {selectedRow.__systemName}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Детализация всех сетевых связок
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedRowId(null)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          title="Закрыть панель"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Статус правила
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/90 flex items-center justify-between gap-2">
            <StatusBadge
              status={selectedRow.checkStatus}
              reason={selectedRow.meta.untestableReason}
              errorMessage={selectedRow.errorMessage}
              socketResults={selectedRow.socketResults}
            />

            {selectedRow.lastCheckedAt && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
                <Clock className="w-3 h-3 text-zinc-500" />
                {selectedRow.lastCheckedAt}
              </span>
            )}
          </div>

          {selectedRow.errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-500/40 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Ошибка выполнения запроса</span>
              </div>
              <p className="text-rose-200/90 leading-relaxed break-words">
                {selectedRow.errorMessage}
              </p>
            </div>
          )}

          {!selectedRow.meta.isTestable && selectedRow.meta.untestableReason && (
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs flex items-start gap-2 text-zinc-400">
              <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{selectedRow.meta.untestableReason}</span>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Связки IP × Порт ({displayedSockets.length})
            </span>

            {hasActualResults && (
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSocketFilter('all')}
                  className={`px-2 py-0.5 rounded transition ${
                    socketFilter === 'all'
                      ? 'bg-zinc-700 text-zinc-100 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Все ({displayedSockets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSocketFilter('accessible')}
                  className={`px-2 py-0.5 rounded transition ${
                    socketFilter === 'accessible'
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'text-zinc-400 hover:text-emerald-400'
                  }`}
                >
                  Открыты ({openCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSocketFilter('blocked')}
                  className={`px-2 py-0.5 rounded transition ${
                    socketFilter === 'blocked'
                      ? 'bg-rose-500/20 text-rose-300 font-medium'
                      : 'text-zinc-400 hover:text-rose-400'
                  }`}
                >
                  Закрыты ({blockedCount})
                </button>
                {untestableCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSocketFilter('untestable')}
                    className={`px-2 py-0.5 rounded transition ${
                      socketFilter === 'untestable'
                        ? 'bg-zinc-700 text-zinc-200 font-medium'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Пропущено ({untestableCount})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
            {filteredSockets.length === 0 ? (
              <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/80 text-center text-xs text-zinc-500">
                Нет связок для выбранного фильтра
              </div>
            ) : (
              filteredSockets.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/90 space-y-1.5 font-mono text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-semibold">
                      {s.protocol} : {s.port}
                    </span>

                    {!hasActualResults ? (
                      <span className="text-zinc-400 font-sans text-[11px]">
                        {s.status === 'untestable' ? 'Пропущено' : 'Ожидает опроса'}
                      </span>
                    ) : s.status === 'accessible' ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-sans text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Доступен (lastvalue: 1)
                      </span>
                    ) : s.status === 'untestable' ? (
                      <span className="text-zinc-400 flex items-center gap-1 font-sans text-[11px] font-medium">
                        Не проверялось
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1 font-sans text-[11px] font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        Закрыт (lastvalue: 0)
                      </span>
                    )}
                  </div>

                  <div className="text-zinc-300 break-all flex items-center gap-1.5 text-[11px]">
                    <span className="text-zinc-400">{s.source}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <span className="text-zinc-100">{s.destination}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 pt-0.5">
                    <span className="truncate" title={s.zabbixKey}>
                      Ключ: {s.zabbixKey}
                    </span>
                    <span className="shrink-0">
                      lastclock:{' '}
                      {hasActualResults && s.status !== 'untestable' && s.lastclock > 0
                        ? new Date(s.lastclock * 1000).toLocaleTimeString()
                        : '—'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            <span>Лог проверки</span>
          </div>

          <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/90 text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed">
            {selectedRow.checkLog ||
              'Проверка для данного правила еще не запускалась. Нажмите «Запустить сетевой тест» ниже.'}
          </pre>
        </div>
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-900">
        <button
          type="button"
          disabled={!selectedRow.meta.isTestable || isChecking}
          onClick={() => checkRowMutation.mutate(selectedRow)}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Выполняется опрос Zabbix...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Запустить сетевой тест ({displayedSockets.length})</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};

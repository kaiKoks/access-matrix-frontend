import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { buildRowFromRawValues } from '@/utils/excelWorkbookParser';
import type { DetectedColumn, ParsedMatrixSheet } from '@/types/matrix';

interface MatrixEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialName: string;
  initialSheets: ParsedMatrixSheet[];
  onClose: () => void;
  onSaveToCatalog: (name: string, sheets: ParsedMatrixSheet[]) => Promise<void>;
  onDeleteMatrix?: () => Promise<void>;
}

const DEFAULT_COLUMNS: DetectedColumn[] = [
  { key: 'col_0', headerTitle: '№ п/п', semanticRole: 'index' },
  { key: 'col_1', headerTitle: 'Функциональная роль сервера/узла', semanticRole: 'role' },
  {
    key: 'col_2',
    headerTitle: 'IP-адрес сервера/узла (Source IP)/FQDN или подсеть',
    semanticRole: 'source',
  },
  {
    key: 'col_3',
    headerTitle: 'IP-адрес назначения (Destination IP)/FQDN или подсеть',
    semanticRole: 'destination',
  },
  { key: 'col_4', headerTitle: 'Порт (TCP)', semanticRole: 'port_tcp' },
  { key: 'col_5', headerTitle: 'Порт (UDP)', semanticRole: 'port_udp' },
];

function createEmptyRowValues(columns: DetectedColumn[], rowNum: number): Record<string, any> {
  const values: Record<string, any> = {};
  for (const col of columns) {
    values[col.key] = col.semanticRole === 'index' ? String(rowNum) : '';
  }
  return values;
}

export const MatrixEditorModal: React.FC<MatrixEditorModalProps> = ({
  isOpen,
  mode,
  initialName,
  initialSheets,
  onClose,
  onSaveToCatalog,
  onDeleteMatrix,
}) => {
  const [matrixName, setMatrixName] = useState('');
  const [columns, setColumns] = useState<DetectedColumn[]>(DEFAULT_COLUMNS);
  const [rawRows, setRawRows] = useState<Array<{ id?: string; values: Record<string, any> }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && initialSheets.length > 0) {
      const firstSheet = initialSheets[0];
      setMatrixName(initialName || 'Матрица_доступа');
      setColumns(firstSheet.columns.length > 0 ? firstSheet.columns : DEFAULT_COLUMNS);
      setRawRows(
        firstSheet.rows.length > 0
          ? firstSheet.rows.map((r) => ({ id: r.__id, values: { ...r.rawValues } }))
          : [{ values: createEmptyRowValues(firstSheet.columns, 1) }]
      );
    } else {
      setMatrixName('Новая_матрица');
      setColumns(DEFAULT_COLUMNS);
      setRawRows([{ values: createEmptyRowValues(DEFAULT_COLUMNS, 1) }]);
    }
  }, [isOpen, mode, initialName, initialSheets]);

  if (!isOpen) return null;

  const handleCellChange = (rowIdx: number, colKey: string, val: string) => {
    setRawRows((prev) =>
      prev.map((item, idx) =>
        idx === rowIdx ? { ...item, values: { ...item.values, [colKey]: val } } : item
      )
    );
  };

  const handleAddRow = () => {
    setRawRows((prev) => [
      ...prev,
      { values: createEmptyRowValues(columns, prev.length + 1) },
    ]);
  };

  const handleRemoveRow = (rowIdx: number) => {
    setRawRows((prev) => prev.filter((_, idx) => idx !== rowIdx));
  };

  const handleSave = async () => {
    const cleanName = matrixName.trim() || 'Матрица_доступа';
    const sheetName = initialSheets[0]?.sheetName || 'Матрица доступа';

    const nonEmptyRows = rawRows.filter((item) =>
      columns.some((col) => {
        if (col.semanticRole === 'index') return false;
        return String(item.values[col.key] ?? '').trim().length > 0;
      })
    );

    const builtRows = nonEmptyRows.map((item, idx) =>
      buildRowFromRawValues(sheetName, idx + 1, columns, item.values, undefined, item.id)
    );

    const sheet: ParsedMatrixSheet = {
      sheetName,
      columns,
      rows: builtRows,
      portDictionary: initialSheets[0]?.portDictionary || {},
      stats: {
        totalRows: builtRows.length,
        testableRows: builtRows.filter((r) => r.meta.isTestable).length,
      },
    };

    const restSheets = mode === 'edit' && initialSheets.length > 1 ? initialSheets.slice(1) : [];

    setIsSaving(true);
    try {
      await onSaveToCatalog(cleanName, [sheet, ...restSheets]);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-6xl max-h-[90vh] rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Шапка модального окна */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100 shrink-0">
              {mode === 'create' ? 'Создание новой матрицы' : 'Редактирование матрицы'}
            </h2>
            <input
              type="text"
              value={matrixName}
              onChange={(e) => setMatrixName(e.target.value)}
              placeholder="Название матрицы..."
              className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 w-72 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            {mode === 'edit' && onDeleteMatrix && (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteMatrix();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить матрицу</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Таблица редактирования правил */}
        <div className="flex-1 overflow-auto p-5">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-[11px] text-zinc-400">
                {columns.map((col) => (
                  <th key={col.key} className="p-2.5 text-left font-semibold min-w-[140px]">
                    {col.headerTitle}
                  </th>
                ))}
                <th className="p-2.5 w-12 text-center">Удалить</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {rawRows.map((rowItem, rIdx) => (
                <tr key={rowItem.id || rIdx} className="hover:bg-zinc-800/30">
                  {columns.map((col) => (
                    <td key={col.key} className="p-1.5 align-top">
                      <textarea
                        rows={2}
                        value={String(rowItem.values[col.key] ?? '')}
                        onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                        placeholder={
                          col.semanticRole === 'source'
                            ? '10.194.196.76'
                            : col.semanticRole === 'destination'
                            ? '10.194.199.86'
                            : col.semanticRole === 'port_tcp'
                            ? '22, 443, 10050'
                            : col.semanticRole === 'port_udp'
                            ? '53, 123'
                            : ''
                        }
                        className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-blue-500/70 focus:outline-none text-zinc-100 font-mono text-[11px] resize-y"
                      />
                    </td>
                  ))}
                  <td className="p-2 align-middle text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(rIdx)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition"
                      title="Удалить строку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={handleAddRow}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить правило</span>
          </button>
        </div>

        {/* Подвал с кнопкой сохранения */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition shadow-sm"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Сохранить в каталог</span>
          </button>
        </div>
      </div>
    </div>
  );
};

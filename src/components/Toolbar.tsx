import React, { useRef } from 'react';
import { useMatrixStore } from '../store/useMatrixStore';
import { parseExcelMatrix } from '../services/excelParser';
import { exportMatrixToExcel } from '../services/networkTester';
import { Upload, Play, Search, Layers, Download } from 'lucide-react';

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    sheets,
    activeSheetIndex,
    searchQuery,
    statusFilter,
    isBatchChecking,
    setSheets,
    setActiveSheetIndex,
    setSearchQuery,
    setStatusFilter,
    checkAllTestableRows,
  } = useMatrixStore();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelMatrix(file);
      setSheets(parsed);
    } catch (err) {
      alert('Ошибка при чтении Excel-файла');
      console.error(err);
    }
  };

  const activeSheet = sheets[activeSheetIndex];

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between">
      <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".xlsx, .xls"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
        >
          <Upload className="w-4 h-4" />
          Загрузить матрицу (.xlsx)
        </button>

        {sheets.length > 1 && (
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <Layers className="w-4 h-4 text-zinc-500 ml-1.5" />
            {sheets.map((s, idx) => (
              <button
                key={s.sheetName}
                onClick={() => setActiveSheetIndex(idx)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeSheetIndex === idx
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s.sheetName}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeSheet && (
        <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск по IP / порту / роли..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="accessible">Доступен</option>
            <option value="partial">Частично доступен</option>
            <option value="blocked">Закрыт</option>
            <option value="untestable">Недоступно</option>
            <option value="idle">Не проверен</option>
          </select>

          <button
            onClick={() => exportMatrixToExcel(activeSheet)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт (.xlsx)
          </button>

          <button
            disabled={isBatchChecking || activeSheet.stats.testableRows === 0}
            onClick={checkAllTestableRows}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isBatchChecking
              ? 'Проверка...'
              : `Проверить всё (${activeSheet.stats.testableRows})`}
          </button>
        </div>
      )}
    </div>
  );
};
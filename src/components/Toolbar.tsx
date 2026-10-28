import React, { useRef, useState, useEffect } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import {
  useCatalogQuery,
  useSaveSystemMutation,
  useCheckBatchMutation,
} from '@/hooks/useMatrixQueries';
import { parseExcelMatrix } from '@/services/excelParser';
import { exportMatrixToExcel } from '@/services/networkTester';
import type { SavedMatrixSystem, ParsedMatrixSheet, MatrixViewGroup } from '@/types/matrix';
import {
  Upload,
  Play,
  Search,
  Layers,
  Download,
  Save,
  Check,
  AtSign,
} from 'lucide-react';

export function formatMatrixTag(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

export function parseSearchInput(rawQuery: string): { matrixTags: string[]; textQuery: string } {
  const matrixTags: string[] = [];
  const textParts: string[] = [];

  rawQuery
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith('@') && token.length > 1) {
        matrixTags.push(token.slice(1).toLowerCase().replace(/_/g, ' '));
      } else if (token !== '@') {
        textParts.push(token);
      }
    });

  return {
    matrixTags,
    textQuery: textParts.join(' ').toLowerCase(),
  };
}

// Формирует список независимых табличных групп (каждая со своими колонками)
export function buildVisibleMatrixGroups(
  catalog: SavedMatrixSystem[],
  activeSystemId: string,
  draftName: string,
  draftSheets: ParsedMatrixSheet[],
  activeSheetIndex: number,
  searchQuery: string,
  statusFilter: string
): MatrixViewGroup[] {
  const { matrixTags, textQuery } = parseSearchInput(searchQuery);
  const isMultiMode = activeSystemId === 'ALL' || matrixTags.length > 0;

  const filterRows = (sheet: ParsedMatrixSheet, sysName: string) =>
    sheet.rows.filter((row) => {
      if (statusFilter !== 'all' && row.checkStatus !== statusFilter) return false;
      if (!textQuery) return true;
      const inValues = Object.values(row.rawValues).some((v) =>
        String(v ?? '').toLowerCase().includes(textQuery)
      );
      const inSys = sysName.toLowerCase().includes(textQuery);
      return inValues || inSys;
    });

  if (!isMultiMode) {
    if (activeSystemId === 'DRAFT') {
      const sh = draftSheets[activeSheetIndex];
      if (!sh) return [];
      return [
        {
          groupId: `draft_${sh.sheetName}`,
          systemName: draftName || 'Черновик',
          sheetName: sh.sheetName,
          columns: sh.columns,
          portDictionary: sh.portDictionary,
          rows: filterRows(sh, draftName),
        },
      ];
    }

    const sys = catalog.find((c) => c.id === activeSystemId);
    const sh = sys?.sheets[activeSheetIndex];
    if (!sys || !sh) return [];
    return [
      {
        groupId: `${sys.id}_${sh.sheetName}`,
        systemName: sys.name,
        sheetName: sh.sheetName,
        columns: sh.columns,
        portDictionary: sh.portDictionary,
        rows: filterRows(sh, sys.name),
      },
    ];
  }

  // Мульти-матричный режим: каждая подходящая матрица идет отдельной группой со своей шапкой
  const targetSystems =
    matrixTags.length > 0
      ? catalog.filter((sys) =>
          matrixTags.some(
            (tag) =>
              sys.name.toLowerCase().includes(tag) ||
              formatMatrixTag(sys.name).toLowerCase().includes(tag.replace(/\s+/g, '_'))
          )
        )
      : catalog;

  const groups: MatrixViewGroup[] = [];
  targetSystems.forEach((sys) => {
    sys.sheets.forEach((sh) => {
      const matchingRows = filterRows(sh, sys.name);
      if (matchingRows.length > 0 || (!textQuery && statusFilter === 'all')) {
        groups.push({
          groupId: `${sys.id}_${sh.sheetName}`,
          systemName: sys.name,
          sheetName: sh.sheetName,
          columns: sh.columns,
          portDictionary: sh.portDictionary,
          rows: matchingRows,
        });
      }
    });
  });

  return groups;
}

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  const [customSystemName, setCustomSystemName] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const { data: catalog = [] } = useCatalogQuery();
  const saveMutation = useSaveSystemMutation();
  const batchCheckMutation = useCheckBatchMutation();

  const {
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    statusFilter,
    setDraftMatrix,
    selectSystem,
    setActiveSheetIndex,
    setSearchQuery,
    setStatusFilter,
  } = useMatrixStore();

  const { matrixTags } = parseSearchInput(searchQuery);
  const isMultiMatrixMode = activeSystemId === 'ALL' || matrixTags.length > 0;

  const currentSystem = catalog.find((c) => c.id === activeSystemId);
  const singleSystemSheets =
    activeSystemId === 'DRAFT' ? draftSheets : currentSystem ? currentSystem.sheets : [];

  const visibleGroups = buildVisibleMatrixGroups(
    catalog,
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    statusFilter
  );

  const allVisibleRows = visibleGroups.flatMap((g) => g.rows);
  const testableCount = allVisibleRows.filter((r) => r.meta.isTestable).length;

  const qNormalized = mentionQuery.toLowerCase().replace(/_/g, ' ');
  const filteredMentions = mentionOpen
    ? catalog.filter(
        (sys) =>
          sys.name.toLowerCase().includes(qNormalized) ||
          formatMatrixTag(sys.name).toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setMentionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelMatrix(file);
      setDraftMatrix(file.name, parsed);
      const cleanName = file.name
        .replace(/\.xlsx?$/i, '')
        .replace(/^Матрица доступа\s*[-–]?\s*/i, '')
        .trim();
      setCustomSystemName(cleanName);
    } catch (err) {
      alert('Ошибка при чтении Excel-файла');
      console.error(err);
    }
    e.target.value = '';
  };

  const handleSaveToBackend = async () => {
    await saveMutation.mutateAsync({
      name: (customSystemName || draftName || 'Новая матрица').trim(),
      sheets: draftSheets,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    setSearchQuery(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);

    if (match) {
      const atIndex = textBeforeCursor.lastIndexOf('@');
      setMentionOpen(true);
      setMentionQuery(match[1]);
      setMentionStartPos(atIndex);
      setSelectedIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (sys: SavedMatrixSystem) => {
    const input = searchInputRef.current;
    const tag = `@${formatMatrixTag(sys.name)} `;
    const cursorPos = input?.selectionStart ?? searchQuery.length;

    const before = searchQuery.slice(0, mentionStartPos);
    const after = searchQuery.slice(cursorPos);
    const nextValue = `${before}${tag}${after}`;

    setSearchQuery(nextValue);
    setMentionOpen(false);

    setTimeout(() => {
      if (input) {
        input.focus();
        const newCursor = before.length + tag.length;
        input.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionOpen || filteredMentions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredMentions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredMentions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMentionOpen(false);
    }
  };

  const handleExport = () => {
    const firstGroup = visibleGroups[0];
    if (!firstGroup) return;
    exportMatrixToExcel(
      {
        sheetName: firstGroup.sheetName,
        columns: firstGroup.columns,
        rows: firstGroup.rows,
        portDictionary: firstGroup.portDictionary,
        stats: {
          totalRows: firstGroup.rows.length,
          testableRows: firstGroup.rows.filter((r) => r.meta.isTestable).length,
        },
      },
      firstGroup.systemName
    );
  };

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
      <div className="flex items-center gap-3 w-full xl:w-auto flex-wrap">
        <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
          <select
            value={activeSystemId}
            onChange={(e) => selectSystem(e.target.value)}
            className="bg-zinc-950 text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Все матрицы ({catalog.length})</option>
            {catalog.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.name} ({sys.sheets.reduce((acc, s) => acc + s.rows.length, 0)})
              </option>
            ))}
            {draftSheets.length > 0 && (
              <option value="DRAFT">Черновик: {draftName}</option>
            )}
          </select>
        </div>

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

        {activeSystemId === 'DRAFT' && draftSheets.length > 0 && (
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <input
              type="text"
              value={customSystemName}
              onChange={(e) => setCustomSystemName(e.target.value)}
              placeholder="Имя матрицы..."
              className="px-2.5 py-1 bg-transparent text-xs text-zinc-200 focus:outline-none w-36"
            />
            <button
              disabled={saveMutation.isPending}
              onClick={handleSaveToBackend}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
            >
              {justSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Сохранено
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Сохранить на бэк
                </>
              )}
            </button>
          </div>
        )}

        {!isMultiMatrixMode && singleSystemSheets.length > 1 && (
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <Layers className="w-4 h-4 text-zinc-500 ml-1.5" />
            {singleSystemSheets.map((s, idx) => (
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

      <div className="flex items-center gap-3 w-full xl:w-auto justify-end flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2 text-zinc-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Поиск или @матрица (IP / порт)..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className="pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-64"
          />

          {mentionOpen && (
            <div
              ref={mentionMenuRef}
              className="absolute left-0 top-full mt-1.5 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden"
            >
              <div className="px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 font-medium">
                  <AtSign className="w-3 h-3 text-blue-400" />
                  Выберите матрицу
                </span>
                <span className="text-[10px] text-zinc-500">↑↓ Enter</span>
              </div>

              {filteredMentions.length > 0 ? (
                <div className="max-h-56 overflow-y-auto p-1">
                  {filteredMentions.map((sys, idx) => {
                    const isActive = idx === selectedIndex;
                    const rulesCount = sys.sheets.reduce((acc, s) => acc + s.rows.length, 0);
                    return (
                      <button
                        key={sys.id}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => insertMention(sys)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs text-left transition ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono font-medium">
                            @{formatMatrixTag(sys.name)}
                          </span>
                          <span
                            className={`block text-[10px] truncate ${
                              isActive ? 'text-blue-100' : 'text-zinc-500'
                            }`}
                          >
                            {sys.name}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            isActive
                              ? 'bg-blue-700 text-white'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {rulesCount} пр.
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-zinc-500">
                  {catalog.length === 0
                    ? 'Нет сохраненных матриц. Загрузите .xlsx и нажмите «Сохранить на бэк».'
                    : 'Матрица не найдена'}
                </div>
              )}
            </div>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="all">Все статусы</option>
          <option value="accessible">Доступен</option>
          <option value="blocked">Закрыт</option>
          <option value="untestable">Недоступно</option>
          <option value="idle">Не проверен</option>
        </select>

        {visibleGroups.length > 0 && (
          <>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Экспорт (.xlsx)
            </button>

            <button
              disabled={batchCheckMutation.isPending || testableCount === 0}
              onClick={() => batchCheckMutation.mutate(allVisibleRows)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {batchCheckMutation.isPending
                ? 'Проверка...'
                : `Проверить всё (${testableCount})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
import React, { useRef, useState, useEffect } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import {
  useCatalogQuery,
  useFoldersQuery,
  useSaveSystemMutation,
  useDeleteSystemMutation,
  useCheckBatchMutation,
} from '@/hooks/useMatrixQueries';
import { parseExcelMatrix } from '@/services/excelParser';
import { exportFilteredGroupsToExcel } from '@/services/networkTester';
import { getDescendantFolderIds, getFolderPath, getFolderBreadcrumbString } from '@/utils/folderTree';
import type {
  SavedMatrixSystem,
  MatrixFolder,
  ParsedMatrixSheet,
  MatrixViewGroup,
  DetectedColumn,
  DynamicMatrixRow,
} from '@/types/matrix';
import {
  Upload,
  Play,
  Search,
  Layers,
  Download,
  Save,
  Database,
  Check,
  AtSign,
  Trash2,
  AlertTriangle,
  X,
  FilePlus2,
  Pencil,
  SlidersHorizontal,
  PanelLeft,
  ChevronRight,
  Folder,
} from 'lucide-react';

export function formatMatrixTag(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

export interface ColumnRuleToken {
  raw: string;
  target:
    | 'source'
    | 'destination'
    | 'port_any'
    | 'port_tcp'
    | 'port_udp'
    | 'role'
    | 'protocol'
    | 'term'
    | 'index'
    | 'folder'
    | 'custom'
    | 'text';
  customHeader?: string;
  values: string[];
  negated: boolean;
}

const ROLE_ALIASES: Record<string, ColumnRuleToken['target']> = {
  src: 'source',
  source: 'source',
  from: 'source',
  ист: 'source',
  источник: 'source',
  откуда: 'source',

  dst: 'destination',
  dest: 'destination',
  destination: 'destination',
  to: 'destination',
  назн: 'destination',
  назначение: 'destination',
  куда: 'destination',

  port: 'port_any',
  ports: 'port_any',
  порт: 'port_any',
  порты: 'port_any',
  tcp: 'port_tcp',
  udp: 'port_udp',

  role: 'role',
  роль: 'role',

  proto: 'protocol',
  service: 'protocol',
  протокол: 'protocol',
  сервис: 'protocol',

  term: 'term',
  срок: 'term',

  id: 'index',
  row: 'index',
  строка: 'index',

  folder: 'folder',
  dir: 'folder',
  папка: 'folder',
};

function splitSearchTokens(rawQuery: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rawQuery.length; i++) {
    const ch = rawQuery[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (/\s/.test(ch) && !inQuotes) {
      if (current.trim()) {
        result.push(current.trim());
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function cleanQuotes(s: string): string {
  return s.replace(/^["']+|["']+$/g, '').trim();
}

export function parseSearchInput(rawQuery: string): {
  matrixTags: string[];
  textQuery: string;
  rules: ColumnRuleToken[];
} {
  const matrixTags: string[] = [];
  const rules: ColumnRuleToken[] = [];
  const textParts: string[] = [];

  for (const rawToken of splitSearchTokens(rawQuery)) {
    let working = rawToken;
    let negated = false;

    if ((working.startsWith('-') || working.startsWith('!')) && working.length > 1) {
      negated = true;
      working = working.slice(1);
    }

    if (working.startsWith('@') && working.length > 1) {
      matrixTags.push(cleanQuotes(working.slice(1)).toLowerCase().replace(/_/g, ' '));
      continue;
    }

    if (working === '@') continue;

    if (working.startsWith('#') && /^#\d+$/.test(working)) {
      rules.push({
        raw: rawToken,
        target: 'index',
        values: [working.slice(1)],
        negated,
      });
      continue;
    }

    const colonIdx = working.indexOf(':');
    if (colonIdx > 0) {
      const key = cleanQuotes(working.slice(0, colonIdx)).toLowerCase();
      const valRaw = cleanQuotes(working.slice(colonIdx + 1)).toLowerCase();

      if (valRaw) {
        const values = valRaw
          .split(',')
          .map((v) => cleanQuotes(v))
          .filter(Boolean);

        if (values.length > 0) {
          const mappedTarget = ROLE_ALIASES[key];
          if (mappedTarget) {
            rules.push({
              raw: rawToken,
              target: mappedTarget,
              values,
              negated,
            });
          } else {
            rules.push({
              raw: rawToken,
              target: 'custom',
              customHeader: key,
              values,
              negated,
            });
          }
          textParts.push(rawToken);
          continue;
        }
      }
    }

    const word = cleanQuotes(working).toLowerCase();
    if (word) {
      rules.push({
        raw: rawToken,
        target: 'text',
        values: [word],
        negated,
      });
      textParts.push(word);
    }
  }

  return {
    matrixTags,
    textQuery: textParts.join(' ').toLowerCase(),
    rules,
  };
}

function matchesPortValue(cellOrToken: string, queryPort: string): boolean {
  const clean = cellOrToken.toLowerCase().trim();
  if (clean.includes(queryPort)) return true;

  if (/^\d+$/.test(queryPort)) {
    const portNum = Number(queryPort);
    const rangeRegex = /(\d+)\s*[–-]\s*(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = rangeRegex.exec(clean)) !== null) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (portNum >= Math.min(start, end) && portNum <= Math.max(start, end)) {
        return true;
      }
    }
  }
  return false;
}

function matchRuleOnRow(
  rule: ColumnRuleToken,
  row: DynamicMatrixRow,
  sheet: ParsedMatrixSheet,
  sysName: string,
  folderName = ''
): boolean {
  const anyValueMatches = (check: (v: string) => boolean) => rule.values.some(check);

  switch (rule.target) {
    case 'index': {
      const rowNum = String(row.__rowNumber);
      const indexCols = sheet.columns
        .filter((c) => c.semanticRole === 'index')
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      return anyValueMatches((v) => rowNum === v || indexCols.some((c) => c.includes(v)));
    }

    case 'folder': {
      return anyValueMatches((v) => folderName.toLowerCase().includes(v));
    }

    case 'source':
    case 'destination':
    case 'role':
    case 'protocol':
    case 'term': {
      const matchingCols = sheet.columns.filter((c) => c.semanticRole === rule.target);
      return anyValueMatches((v) =>
        matchingCols.some((c) =>
          String(row.rawValues[c.key] ?? '')
            .toLowerCase()
            .includes(v)
        )
      );
    }

    case 'port_any':
    case 'port_tcp':
    case 'port_udp': {
      const allowedRoles =
        rule.target === 'port_tcp'
          ? ['port_tcp', 'port']
          : rule.target === 'port_udp'
          ? ['port_udp', 'port']
          : ['port_tcp', 'port_udp', 'port'];

      const matchingCols = sheet.columns.filter((c) =>
        allowedRoles.includes(c.semanticRole)
      );
      return anyValueMatches((v) =>
        matchingCols.some((c) => matchesPortValue(String(row.rawValues[c.key] ?? ''), v))
      );
    }

    case 'custom': {
      const headerQuery = rule.customHeader || '';
      const matchingCols = sheet.columns.filter(
        (c) =>
          c.headerTitle.toLowerCase().includes(headerQuery) ||
          c.key.toLowerCase() === headerQuery
      );
      return anyValueMatches((v) =>
        matchingCols.some((c) =>
          String(row.rawValues[c.key] ?? '')
            .toLowerCase()
            .includes(v)
        )
      );
    }

    case 'text':
    default: {
      return anyValueMatches((v) => {
        const inValues = Object.values(row.rawValues).some((cell) =>
          String(cell ?? '').toLowerCase().includes(v)
        );
        const inSection = String(row.__sectionTitle ?? '')
          .toLowerCase()
          .includes(v);
        const inSys = sysName.toLowerCase().includes(v);
        const inFolder = folderName.toLowerCase().includes(v);
        return inValues || inSection || inSys || inFolder;
      });
    }
  }
}

export interface BuildGroupsParams {
  catalog: SavedMatrixSystem[];
  folders?: MatrixFolder[];
  activeFolderId?: string | null | 'ALL';
  activeSystemId: string;
  draftName: string;
  draftSheets: ParsedMatrixSheet[];
  activeSheetIndex: number;
  searchQuery: string;
  columnFilter?: string;
  statusFilter: string;
}

export function buildVisibleMatrixGroups({
  catalog,
  folders = [],
  activeFolderId = 'ALL',
  activeSystemId,
  draftName,
  draftSheets,
  activeSheetIndex,
  searchQuery,
  statusFilter,
}: BuildGroupsParams): MatrixViewGroup[] {
  const { matrixTags, textQuery, rules } = parseSearchInput(searchQuery);
  const isMultiMode = activeSystemId === 'ALL' || matrixTags.length > 0;

  const getSystemFolderName = (sysFolderId: string | null | undefined): string => {
    if (!sysFolderId) return '';
    const f = folders.find((item) => item.id === sysFolderId);
    return f ? f.name : '';
  };

  const filterRows = (sheet: ParsedMatrixSheet, sysName: string, folderName = '') =>
    sheet.rows.filter((row) => {
      if (statusFilter !== 'all' && row.checkStatus !== statusFilter) return false;
      if (rules.length === 0) return true;

      return rules.every((rule) => {
        const matched = matchRuleOnRow(rule, row, sheet, sysName, folderName);
        return rule.negated ? !matched : matched;
      });
    });

  if (!isMultiMode) {
    if (activeSystemId === 'DRAFT') {
      const sh = draftSheets[activeSheetIndex] || draftSheets[0];
      if (!sh) return [];
      return [
        {
          groupId: `draft_${sh.sheetName}`,
          systemId: 'DRAFT',
          systemName: draftName || 'Новая матрица',
          sheetName: sh.sheetName,
          columns: sh.columns,
          portDictionary: sh.portDictionary,
          rows: filterRows(sh, draftName),
        },
      ];
    }

    const sys = catalog.find((c) => c.id === activeSystemId);
    const sh = sys?.sheets[activeSheetIndex] || sys?.sheets[0];
    if (!sys || !sh) return [];
    return [
      {
        groupId: `${sys.id}_${sh.sheetName}`,
        systemId: sys.id,
        folderId: sys.folderId,
        systemName: sys.name,
        sheetName: sh.sheetName,
        columns: sh.columns,
        portDictionary: sh.portDictionary,
        rows: filterRows(sh, sys.name, getSystemFolderName(sys.folderId)),
      },
    ];
  }

  // Фильтрация по выбранной в сайдбаре папке
  let baseCatalog = catalog;
  if (activeFolderId === null) {
    baseCatalog = catalog.filter((s) => !s.folderId);
  } else if (activeFolderId && activeFolderId !== 'ALL') {
    const descendantFolderIds = getDescendantFolderIds(folders, activeFolderId);
    const targetFolderIds = new Set([activeFolderId, ...descendantFolderIds]);
    baseCatalog = catalog.filter((s) => s.folderId && targetFolderIds.has(s.folderId));
  }

  const targetSystems =
    matrixTags.length > 0
      ? baseCatalog.filter((sys) =>
          matrixTags.some(
            (tag) =>
              sys.name.toLowerCase().includes(tag) ||
              formatMatrixTag(sys.name).toLowerCase().includes(tag.replace(/\s+/g, '_'))
          )
        )
      : baseCatalog;

  const groups: MatrixViewGroup[] = [];
  targetSystems.forEach((sys) => {
    const folderName = getSystemFolderName(sys.folderId);
    sys.sheets.forEach((sh) => {
      const matchingRows = filterRows(sh, sys.name, folderName);
      if (matchingRows.length > 0 || (!textQuery && statusFilter === 'all')) {
        groups.push({
          groupId: `${sys.id}_${sh.sheetName}`,
          systemId: sys.id,
          folderId: sys.folderId,
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

const SYNTAX_SHORTCUTS: Array<{ token: string; label: string; example: string }> = [
  { token: 'src:', label: 'Источник (Source)', example: 'src:10.194' },
  { token: 'dst:', label: 'Назначение (Dest)', example: 'dst:sber' },
  { token: 'tcp:', label: 'Порт TCP (и диапазоны)', example: 'tcp:443,8080' },
  { token: 'udp:', label: 'Порт UDP', example: 'udp:53' },
  { token: 'port:', label: 'Любой порт', example: 'port:3000' },
  { token: 'role:', label: 'Роль / Сервис', example: 'role:сервер' },
  { token: '-port:', label: 'Исключить (-)', example: '-port:53' },
];

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const syntaxMenuRef = useRef<HTMLDivElement>(null);

  const [justSaved, setJustSaved] = useState(false);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [syntaxHelpOpen, setSyntaxHelpOpen] = useState(false);

  const { data: catalog = [] } = useCatalogQuery();
  const { data: folders = [] } = useFoldersQuery();
  const saveMutation = useSaveSystemMutation();
  const deleteMutation = useDeleteSystemMutation();
  const batchCheckMutation = useCheckBatchMutation();

  const {
    activeSystemId,
    activeFolderId,
    isSidebarOpen,
    toggleSidebar,
    draftFolderId,
    setDraftFolderId,
    setActiveFolderId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    columnFilter,
    statusFilter,
    isEditMode,
    hasUnsavedChanges,
    uiError,
    setDraftMatrix,
    createNewEmptyMatrix,
    setDraftName,
    selectSystem,
    setActiveSheetIndex,
    setSearchQuery,
    setStatusFilter,
    setIsEditMode,
    setUiError,
  } = useMatrixStore();

  const { matrixTags } = parseSearchInput(searchQuery);
  const isMultiMatrixMode = activeSystemId === 'ALL' || matrixTags.length > 0;

  const currentSystem = catalog.find((c) => c.id === activeSystemId);
  const singleSystemSheets =
    activeSystemId === 'DRAFT' ? draftSheets : currentSystem ? currentSystem.sheets : [];

  const visibleGroups = buildVisibleMatrixGroups({
    catalog,
    folders,
    activeFolderId,
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    columnFilter,
    statusFilter,
  });

  const allVisibleRows = visibleGroups.flatMap((g) => g.rows);
  const testableCount = allVisibleRows.filter((r) => r.meta.isTestable).length;

  const availableColumns: DetectedColumn[] = [];
  const seenTitles = new Set<string>();
  visibleGroups.forEach((g) => {
    g.columns.forEach((c) => {
      if (!seenTitles.has(c.headerTitle)) {
        seenTitles.add(c.headerTitle);
        availableColumns.push(c);
      }
    });
  });

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
      const target = e.target as Node;
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(target)
      ) {
        setMentionOpen(false);
      }
      if (
        syntaxMenuRef.current &&
        !syntaxMenuRef.current.contains(target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(target)
      ) {
        setSyntaxHelpOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUiError(null);
      const parsed = await parseExcelMatrix(file);
      if (parsed.length === 0) {
        setUiError('В выбранном Excel-файле не найдено таблиц с правилами доступа');
        return;
      }
      setDraftMatrix(file.name, parsed);
    } catch (err: any) {
      setUiError(err?.message || 'Ошибка при чтении Excel-файла');
    }
    e.target.value = '';
  };

  const handleSaveToBackend = async () => {
    const targetName =
      activeSystemId === 'DRAFT'
        ? (draftName || 'Новая матрица').trim()
        : currentSystem?.name || 'Матрица';
    const targetSheets =
      activeSystemId === 'DRAFT' ? draftSheets : currentSystem?.sheets || [];
    const targetFolderId =
      activeSystemId === 'DRAFT' ? draftFolderId : currentSystem?.folderId;

    if (!targetSheets.length) return;
    try {
      await saveMutation.mutateAsync({
        name: targetName,
        sheets: targetSheets,
        folderId: targetFolderId,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Ошибка отображается через uiError
    }
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
      setSyntaxHelpOpen(false);
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

  const insertSyntaxToken = (token: string) => {
    const input = searchInputRef.current;
    const trimmed = searchQuery.trimEnd();
    const nextValue = trimmed ? `${trimmed} ${token}` : token;
    setSearchQuery(nextValue);
    setSyntaxHelpOpen(false);

    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(nextValue.length, nextValue.length);
      }
    }, 0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionOpen || filteredMentions.length === 0) {
      if (e.key === 'Escape') setSyntaxHelpOpen(false);
      return;
    }

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
    if (visibleGroups.length === 0) return;
    const prefix =
      visibleGroups.length === 1 ? visibleGroups[0].systemName : 'Сводный_отчет_матриц';
    exportFilteredGroupsToExcel(visibleGroups, prefix);
  };

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 shrink-0 space-y-2.5">
      <div className="flex flex-col xl:flex-row gap-3 items-center justify-between">
        {/* Левая часть: выбор матрицы, загрузка, создание с нуля, сохранение */}
        <div className="flex items-center gap-2 xl:w-auto flex-wrap">
          <button
            type="button"
            onClick={toggleSidebar}
            className={`p-1.5 rounded-lg border transition ${
              isSidebarOpen
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700'
            }`}
            title={isSidebarOpen ? 'Скрыть боковую панель каталога' : 'Показать дерево папок'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
            <Database className="w-4 h-4 text-blue-400 shrink-0" />
            <select
              value={activeSystemId}
              onChange={(e) => selectSystem(e.target.value)}
              className="bg-zinc-950 text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer max-w-56 truncate"
            >
              <option value="ALL">Все матрицы ({catalog.length})</option>
              {catalog.map((sys) => {
                const folderName = folders.find((f) => f.id === sys.folderId)?.name;
                return (
                  <option key={sys.id} value={sys.id}>
                    {folderName ? `[${folderName}] ` : ''}{sys.name} (
                    {sys.sheets.reduce((acc, s) => acc + s.rows.length, 0)})
                  </option>
                );
              })}
              {draftSheets.length > 0 && (
                <option value="DRAFT">
                  Черновик: {draftName} ({draftSheets.reduce((acc, s) => acc + s.rows.length, 0)})
                </option>
              )}
            </select>
          </div>

          {activeSystemId !== 'ALL' && activeSystemId !== 'DRAFT' && currentSystem && (
            <button
              onClick={() => deleteMutation.mutate(activeSystemId)}
              title="Удалить матрицу с бэкенда"
              className="p-2 rounded-lg bg-zinc-800 hover:bg-rose-600/20 text-zinc-400 hover:text-rose-400 border border-zinc-700 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Открыть (.xlsx)
          </button>

          <button
            onClick={() => createNewEmptyMatrix('Новая матрица')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-medium border border-zinc-700 transition"
            title="Создать и заполнить новую матрицу прямо в программе"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            Создать матрицу
          </button>

          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              isEditMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            {isEditMode ? 'Режим правки: ВКЛ' : 'Редактировать'}
          </button>

          {(activeSystemId === 'DRAFT' || hasUnsavedChanges) &&
            (draftSheets.length > 0 || currentSystem) && (
              <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-blue-500/30">
                {activeSystemId === 'DRAFT' && (
                  <>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Имя матрицы..."
                      className="px-2.5 py-1 bg-transparent text-xs text-zinc-200 focus:outline-none w-32"
                    />
                    <select
                      value={draftFolderId || ''}
                      onChange={(e) => setDraftFolderId(e.target.value || null)}
                      className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 rounded focus:outline-none max-w-32 truncate"
                      title="Папка для сохранения матрицы"
                    >
                      <option value="">📁 Корень</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {getFolderBreadcrumbString(folders, f.id)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  disabled={saveMutation.isPending}
                  onClick={handleSaveToBackend}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  {justSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Сохранено
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      {saveMutation.isPending ? 'Сохранение...' : 'Сохранить на бэк'}
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
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
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

        {/* Правая часть: умный поиск по столбцам, статус и экспорт */}
        <div className="flex items-center gap-2 w-full xl:w-auto justify-end flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2 text-zinc-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Поиск: src:10.194 dst:sber tcp:443 @матрица..."
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              className="pl-9 pr-14 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-80 font-mono"
            />

            <div className="absolute right-2 top-1.5 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300"
                  title="Очистить поиск"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSyntaxHelpOpen((prev) => !prev);
                  setMentionOpen(false);
                }}
                title="Фильтры по столбцам (src:, dst:, tcp:, udp:, role:)"
                className={`p-0.5 rounded transition ${
                  syntaxHelpOpen
                    ? 'text-blue-400 bg-blue-500/15'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Меню быстрых префиксов столбцов */}
            {syntaxHelpOpen && (
              <div
                ref={syntaxMenuRef}
                className="absolute right-0 top-full mt-1.5 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800 pb-1.5">
                  <span className="font-medium text-zinc-200">Фильтр по столбцам</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    , = ИЛИ &nbsp;|&nbsp; - = НЕ
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  {SYNTAX_SHORTCUTS.map((item) => (
                    <button
                      key={item.token}
                      type="button"
                      onClick={() => insertSyntaxToken(item.token)}
                      className="flex flex-col px-2 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 text-left transition"
                    >
                      <span className="text-[11px] font-mono font-semibold text-blue-400">
                        {item.token}
                      </span>
                      <span className="text-[10px] text-zinc-400 truncate">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>

                {availableColumns.length > 0 && (
                  <div className="pt-1 border-t border-zinc-800 space-y-1">
                    <div className="text-[10px] text-zinc-500">Столбцы таблицы:</div>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {availableColumns.map((col) => {
                        const shortHeader = col.headerTitle.split(/[\s(]/)[0];
                        const prefix = `${shortHeader}:`;
                        return (
                          <button
                            key={col.headerTitle}
                            type="button"
                            onClick={() => insertSyntaxToken(prefix)}
                            className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 truncate max-w-full transition"
                            title={`Искать в столбце «${col.headerTitle}»`}
                          >
                            {col.headerTitle}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Меню выбора @матрицы */}
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
                    Матрица не найдена
                  </div>
                )}
              </div>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="accessible">Доступен</option>
            <option value="blocked">Закрыт</option>
            <option value="error">Ошибка API</option>
            <option value="untestable">Недоступно</option>
            <option value="idle">Не проверен</option>
          </select>

          {allVisibleRows.length > 0 && (
            <>
              <button
                onClick={handleExport}
                title="Экспортировать текущую (отфильтрованную) таблицу в Excel"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Экспорт ({allVisibleRows.length})
              </button>

              <button
                disabled={batchCheckMutation.isPending || testableCount === 0}
                onClick={() => batchCheckMutation.mutate(allVisibleRows)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {batchCheckMutation.isPending
                  ? 'Проверка...'
                  : `Проверить (${testableCount})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Хлебные крошки (Breadcrumbs) текущей навигации */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 pt-1.5 border-t border-zinc-800/60 overflow-x-auto">
        <span className="text-zinc-500 font-medium shrink-0">Путь:</span>
        <button
          type="button"
          onClick={() => {
            setActiveFolderId('ALL');
            selectSystem('ALL');
          }}
          className={`hover:text-blue-400 transition shrink-0 ${
            activeFolderId === 'ALL' && activeSystemId === 'ALL'
              ? 'text-blue-400 font-medium'
              : ''
          }`}
        >
          Все матрицы
        </button>

        {activeFolderId !== 'ALL' && (
          <>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            {activeFolderId === null ? (
              <span className="text-blue-400 font-medium shrink-0">Без папки (корень)</span>
            ) : (
              getFolderPath(folders, activeFolderId).map((f, idx, arr) => (
                <React.Fragment key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderId(f.id);
                      if (activeSystemId !== 'ALL' && currentSystem?.folderId !== f.id) {
                        selectSystem('ALL');
                      }
                    }}
                    className={`hover:text-blue-400 transition flex items-center gap-1 shrink-0 ${
                      idx === arr.length - 1 && activeSystemId === 'ALL'
                        ? 'text-blue-400 font-medium'
                        : ''
                    }`}
                  >
                    <Folder className="w-3 h-3 text-amber-400" />
                    <span>{f.name}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                  )}
                </React.Fragment>
              ))
            )}
          </>
        )}

        {activeSystemId !== 'ALL' && (
          <>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span className="text-zinc-100 font-semibold flex items-center gap-1 truncate">
              <Database className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">
                {activeSystemId === 'DRAFT' ? `Черновик: ${draftName}` : currentSystem?.name}
              </span>
            </span>
          </>
        )}
      </div>

      {uiError && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uiError}</span>
          </div>
          <button
            onClick={() => setUiError(null)}
            className="p-0.5 hover:bg-rose-500/20 rounded text-rose-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

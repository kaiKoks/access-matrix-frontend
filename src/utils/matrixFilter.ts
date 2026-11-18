import type {
  DynamicMatrixRow,
  MatrixFolder,
  MatrixViewGroup,
  ParsedMatrixSheet,
  SavedMatrixSystem,
} from '@/types/matrix';
import { getDescendantFolderIds } from '@/utils/folderTree';

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

export const ROLE_ALIASES: Record<string, ColumnRuleToken['target']> = {
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

export const SYNTAX_SHORTCUTS: Array<{ token: string; label: string; example: string }> = [
  { token: 'src:', label: 'Источник (Source)', example: 'src:10.194' },
  { token: 'dst:', label: 'Назначение (Dest)', example: 'dst:sber' },
  { token: 'tcp:', label: 'Порт TCP (и диапазоны)', example: 'tcp:443,8080' },
  { token: 'udp:', label: 'Порт UDP', example: 'udp:53' },
  { token: 'port:', label: 'Любой порт', example: 'port:3000' },
  { token: 'role:', label: 'Роль / Сервис', example: 'role:сервер' },
  { token: 'folder:', label: 'Имя папки', example: 'folder:прод' },
  { token: '-port:', label: 'Исключить (-)', example: '-port:53' },
];

export function splitSearchTokens(rawQuery: string): string[] {
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

export function cleanQuotes(s: string): string {
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

export function matchesPortValue(cellOrToken: string, queryPort: string): boolean {
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

export function matchRuleOnRow(
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

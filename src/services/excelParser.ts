import * as XLSX from 'xlsx';
import type {
  DynamicMatrixRow,
  DetectedColumn,
  ParsedMatrixSheet,
  ParsedNetworkMeta,
} from '@/types/matrix';

export const DEFAULT_PORT_DICTIONARY: Record<string, string> = {
  '53': 'DNS',
  '88': 'Kerberos',
  '135': 'RPC',
  '389': 'LDAP',
  '445': 'SMB',
  '464': 'Kerberos Auth',
  '500': 'IPsec ISAKMP',
  '636': 'LDAPS',
  '3268': 'LDAP GC',
  '3269': 'LDAP GC SSL',
  '4500': 'NAT-T',
};

const SEMANTIC_PATTERNS: [DetectedColumn['semanticRole'], RegExp][] = [
  ['index', /^(№|п\/п|номер)/i],
  ['protocol', /протокол/i],
  ['term', /(срок|период|примечан)/i],
  ['source', /(source|сервера\/узла.*\(source\)|откуда|источник)/i],
  ['destination', /(destination|назначени|получател.*ip|куда)/i],
  ['port_udp', /\(udp\)|^udp$/i],
  ['port_tcp', /\(tcp\)|^tcp$/i],
  ['port', /порт/i],
  ['role', /(роль|сервис|наименование)/i],
];

export function detectColumnSemanticRole(title: string): DetectedColumn['semanticRole'] {
  for (const [role, regex] of SEMANTIC_PATTERNS) {
    if (regex.test(title)) {
      return role;
    }
  }
  return 'other';
}

export function extractPortTokens(raw: string): string[] {
  return raw
    .replace(/\b(tcp|udp)\s*\/?\s*/gi, '')
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter((p) => /^\d+(\s*[–-]\s*\d+)?$/.test(p));
}

// Пересчитывает сетевые метаданные строки при ручном вводе или редактировании ячеек
export function recomputeRowMeta(
  rawValues: Record<string, string | number | null | undefined>,
  columns: DetectedColumn[]
): ParsedNetworkMeta {
  let sourceVal = '';
  let destVal = '';
  let protoColVal = '';
  const ports: ParsedNetworkMeta['ports'] = [];

  columns.forEach((col) => {
    if (col.semanticRole === 'protocol' && rawValues[col.key]) {
      protoColVal = String(rawValues[col.key]).trim().toUpperCase();
    }
  });

  columns.forEach((col) => {
    const val = rawValues[col.key];
    if (val === null || val === undefined || String(val).trim() === '' || String(val).trim() === '-') {
      return;
    }
    const strVal = String(val).trim();

    if (col.semanticRole === 'source') sourceVal = strVal;
    if (col.semanticRole === 'destination') destVal = strVal;

    if (col.semanticRole === 'port_tcp') {
      const list = extractPortTokens(strVal);
      if (list.length > 0) ports.push({ raw: strVal, list, protocol: 'TCP' });
    }
    if (col.semanticRole === 'port_udp') {
      const list = extractPortTokens(strVal);
      if (list.length > 0) ports.push({ raw: strVal, list, protocol: 'UDP' });
    }
    if (col.semanticRole === 'port') {
      const list = extractPortTokens(strVal);
      if (list.length > 0) {
        const isUdp = /udp/i.test(strVal) || protoColVal === 'UDP';
        ports.push({
          raw: strVal,
          list,
          protocol: isUdp ? 'UDP' : 'TCP',
        });
      }
    }
  });

  const isExternalSource = sourceVal.includes('10.132.');
  const isOutbound = sourceVal.includes('10.194.') || sourceVal.includes('10.196.');
  const isTestable = Boolean(sourceVal && destVal && ports.length > 0 && !isExternalSource);

  return {
    sources: sourceVal
      ? sourceVal
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    destinations: destVal
      ? destVal
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    ports,
    isTestable,
    untestableReason: isExternalSource
      ? 'Хост-источник (10.132.x.x) находится во внешнем сегменте — нет прав администратора'
      : !sourceVal || !destVal
      ? 'Укажите Источник и Назначение'
      : !ports.length
      ? 'Не указаны порты для проверки'
      : undefined,
    direction: isExternalSource ? 'inbound' : isOutbound ? 'outbound' : 'internal',
  };
}

// Создает пустой лист матрицы для заполнения с нуля прямо в программе
export function createBlankMatrixSheet(sheetName = 'Основной'): ParsedMatrixSheet {
  const columns: DetectedColumn[] = [
    { key: 'col_0', headerTitle: 'Функциональная роль / Сервис', semanticRole: 'role' },
    { key: 'col_1', headerTitle: 'Источник (Source IP / DNS)', semanticRole: 'source' },
    { key: 'col_2', headerTitle: 'Назначение (Destination IP / DNS)', semanticRole: 'destination' },
    { key: 'col_3', headerTitle: 'Порт (TCP)', semanticRole: 'port_tcp' },
    { key: 'col_4', headerTitle: 'Порт (UDP)', semanticRole: 'port_udp' },
    { key: 'col_5', headerTitle: 'Примечание', semanticRole: 'term' },
  ];

  const initialRaw: Record<string, string> = {
    col_0: 'Тестовый сервис',
    col_1: '10.194.199.68',
    col_2: '10.194.199.11',
    col_3: '389, 445',
    col_4: '53',
    col_5: 'Постоянно',
  };

  const meta = recomputeRowMeta(initialRaw, columns);

  const firstRow: DynamicMatrixRow = {
    __id: `draft_${sheetName}_1_${Date.now()}`,
    __rowNumber: 1,
    __systemId: 'DRAFT',
    __systemName: 'Новая матрица',
    __sheetName: sheetName,
    rawValues: initialRaw,
    meta,
    checkStatus: meta.isTestable ? 'idle' : 'untestable',
  };

  return {
    sheetName,
    columns,
    rows: [firstRow],
    portDictionary: { ...DEFAULT_PORT_DICTIONARY },
    stats: {
      totalRows: 1,
      testableRows: meta.isTestable ? 1 : 0,
    },
  };
}

function fillMergedCells(rawData: any[][], merges: XLSX.Range[] = []) {
  for (const merge of merges) {
    const val = rawData[merge.s.r]?.[merge.s.c];
    if (val === null || val === undefined) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      if (!rawData[r]) continue;
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (rawData[r][c] === null || rawData[r][c] === undefined) {
          rawData[r][c] = val;
        }
      }
    }
  }
}

export async function parseExcelMatrix(file: File): Promise<ParsedMatrixSheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const portDictionary: Record<string, string> = { ...DEFAULT_PORT_DICTIONARY };
  const matrixSheetNames: string[] = [];

  for (const name of workbook.SheetNames) {
    if (/расшифровка|порт|справочник/i.test(name)) {
      const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
      });
      rows.forEach((r) => {
        if (!r || !r[0]) return;
        const rawCell0 = String(r[0]).trim();
        const rawCell1 = r[1] ? String(r[1]).trim() : '';

        const match = rawCell0.match(/^(\d+(?:\s*[–-]\s*\d+)?)/);
        if (!match) return;
        const portKey = match[1].replace(/\s+/g, '');

        let description = rawCell1;
        if (!description) {
          const bracketMatch = rawCell0.match(/\((.+?)\)/);
          if (bracketMatch) description = bracketMatch[1].trim();
        }

        if (portKey && description) {
          portDictionary[portKey] = description;
        }
      });
    } else {
      matrixSheetNames.push(name);
    }
  }

  const resultSheets: ParsedMatrixSheet[] = [];

  for (const sheetName of matrixSheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      blankrows: true,
    });

    if (rawData.length === 0) continue;
    fillMergedCells(rawData, worksheet['!merges']);

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(12, rawData.length); i++) {
      if (!rawData[i]) continue;
      const rowStr = rawData[i].map((c) => String(c || '').toLowerCase()).join(' ');
      if ((rowStr.includes('ip') || rowStr.includes('source')) && rowStr.includes('порт')) {
        headerRowIndex = i;
        break;
      }
    }

    const headerRow = rawData[headerRowIndex] || [];
    const subHeaderRow = rawData[headerRowIndex + 1] || [];

    const nonEmptySubCells = subHeaderRow
      .map((c) => String(c ?? '').trim())
      .filter(Boolean);
    const hasSubHeader =
      nonEmptySubCells.length > 0 &&
      nonEmptySubCells.every((c) => /^(tcp|udp)$/i.test(c));

    const columns: DetectedColumn[] = [];
    let lastMainHeader = '';

    const maxCols = Math.max(headerRow.length, hasSubHeader ? subHeaderRow.length : 0);
    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      const rawMain = String(headerRow[colIdx] || '').trim();
      if (rawMain) lastMainHeader = rawMain;

      const subTitle = hasSubHeader ? String(subHeaderRow[colIdx] || '').trim() : '';
      let title = rawMain;

      if (hasSubHeader && /^(tcp|udp)$/i.test(subTitle)) {
        title = `${rawMain || lastMainHeader || 'Порт'} (${subTitle.toUpperCase()})`;
      } else if (!title && subTitle) {
        title = subTitle;
      }

      if (!title) continue;

      columns.push({
        key: `col_${colIdx}`,
        headerTitle: title,
        semanticRole: detectColumnSemanticRole(title),
      });
    }

    const dataStartIndex = headerRowIndex + (hasSubHeader ? 2 : 1);
    const rows: DynamicMatrixRow[] = [];
    let currentSectionTitle: string | undefined = undefined;
    let prevRowCache: Record<string, any> | null = null;

    for (let rIdx = dataStartIndex; rIdx < rawData.length; rIdx++) {
      const rowData = rawData[rIdx];
      if (!rowData || rowData.every((c) => c === null || String(c).trim() === '')) continue;

      const nonEmptyCells = rowData.filter((c) => c !== null && String(c).trim() !== '');
      const rowJoined = nonEmptyCells.map((c) => String(c).toLowerCase()).join(' ');

      if (
        (rowJoined.includes('функциональная роль') && rowJoined.includes('порт')) ||
        (nonEmptyCells.length <= 2 && /^(udp|tcp|\s)+$/i.test(rowJoined))
      ) {
        prevRowCache = null;
        continue;
      }

      if (
        nonEmptyCells.length === 1 &&
        !/https?:\/\/|\d+\.\d+\.\d+\.\d+/i.test(String(nonEmptyCells[0]))
      ) {
        currentSectionTitle = String(nonEmptyCells[0]).trim();
        prevRowCache = null;
        continue;
      }

      const rawValues: Record<string, any> = {};
      columns.forEach((col) => {
        const cellIdx = parseInt(col.key.replace('col_', ''), 10);
        rawValues[col.key] = rowData[cellIdx];
      });

      const sourceCol = columns.find((c) => c.semanticRole === 'source');
      const destCol = columns.find((c) => c.semanticRole === 'destination');
      if (
        prevRowCache &&
        destCol &&
        rawValues[destCol.key] &&
        sourceCol &&
        !rawValues[sourceCol.key]
      ) {
        columns.forEach((col) => {
          if (col.key !== destCol.key && !rawValues[col.key]) {
            rawValues[col.key] = prevRowCache![col.key];
          }
        });
      }
      prevRowCache = { ...rawValues };

      const meta = recomputeRowMeta(rawValues, columns);

      rows.push({
        __id: `row_${sheetName}_${rows.length + 1}`,
        __rowNumber: rows.length + 1,
        __sectionTitle: currentSectionTitle,
        rawValues,
        meta,
        checkStatus: meta.isTestable ? 'idle' : 'untestable',
      });
    }

    if (rows.length > 0) {
      resultSheets.push({
        sheetName,
        columns,
        rows,
        portDictionary,
        stats: {
          totalRows: rows.length,
          testableRows: rows.filter((r) => r.meta.isTestable).length,
        },
      });
    }
  }

  return resultSheets;
}
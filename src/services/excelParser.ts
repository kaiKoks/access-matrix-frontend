import * as XLSX from 'xlsx';
import { DynamicMatrixRow, DetectedColumn, ParsedMatrixSheet } from '../types/matrix';

const DEFAULT_PORT_DICTIONARY: Record<string, string> = {
  '53': 'DNS',
  '88': 'Kerberos',
  '135': 'RPC Endpoint Mapper',
  '389': 'LDAP',
  '445': 'SMB',
  '464': 'Kerberos Change/Set password',
  '500': 'IPsec ISAKMP',
  '636': 'LDAPS',
  '3268': 'LDAP GC',
  '3269': 'LDAP GC SSL',
  '4500': 'NAT-T',
  '9443': 'HTTPS API (Сбербанк)',
  '13000': 'Kaspersky Security Center (SSL)',
  '14000': 'Kaspersky Security Center (Open)',
  '15000': 'Агент администрирования KSC (UDP)',
};

const SEMANTIC_PATTERNS: [DetectedColumn['semanticRole'], RegExp][] = [
  ['index', /^(№|п\/п|номер)/i],
  ['source', /(source|сервера\/узла.*\(source\)|откуда|источник)/i],
  ['destination', /(destination|назначени|получател.*ip|куда)/i],
  ['port_udp', /\(udp\)|^udp$/i],
  ['port_tcp', /\(tcp\)|^tcp$/i],
  ['port', /порт/i],
  ['protocol', /протокол/i],
  ['role', /(роль|сервис|наименование)/i],
];

// Разбивает "tcp/9443" или "88, 389, 1024–5000" на массив чистых портов
export function extractPortTokens(raw: string): string[] {
  return raw
    .replace(/^(tcp|udp)\//gi, '')
    .split(/[,;\n]+/)
    .map(p => p.trim())
    .filter(Boolean);
}

// Заполняет объединенные ячейки в сыром двумерном массиве
function fillMergedCells(rawData: any[][], merges: XLSX.Range[] = []) {
  for (const merge of merges) {
    const val = rawData[merge.s.r]?.[merge.s.c];
    if (val === null || val === undefined) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (rawData[r] && (rawData[r][c] === null || rawData[r][c] === undefined)) {
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

  // 1. Сначала ищем листы со справочником портов ("Расшифровка портов")
  for (const name of workbook.SheetNames) {
    if (/расшифровка|порт|справочник/i.test(name)) {
      const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null });
      rows.forEach(r => {
        if (r[0] && r[1]) {
          const portKey = String(r[0]).replace(/[^\d–-]/g, '').trim();
          if (portKey) portDictionary[portKey] = String(r[1]).trim();
        }
      });
    } else {
      matrixSheetNames.push(name);
    }
  }

  const resultSheets: ParsedMatrixSheet[] = [];

  // 2. Парсим основные листы матриц доступа
  for (const sheetName of matrixSheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    if (rawData.length === 0) continue;
    fillMergedCells(rawData, worksheet['!merges']);

    // Ищем строку заголовков
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const rowStr = rawData[i].map(c => String(c || '').toLowerCase()).join(' ');
      if ((rowStr.includes('ip') || rowStr.includes('source')) && rowStr.includes('порт')) {
        headerRowIndex = i;
        break;
      }
    }

    const headerRow = rawData[headerRowIndex] || [];
    const subHeaderRow = rawData[headerRowIndex + 1] || [];
    const hasSubHeader = subHeaderRow.some(c => /^(tcp|udp)$/i.test(String(c || '').trim()));

    const columns: DetectedColumn[] = [];
    let lastMainHeader = '';

    const maxCols = Math.max(headerRow.length, subHeaderRow.length);
    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      const rawMain = String(headerRow[colIdx] || '').trim();
      if (rawMain) lastMainHeader = rawMain;

      const subTitle = hasSubHeader ? String(subHeaderRow[colIdx] || '').trim() : '';
      let title = rawMain;

      if (/^(tcp|udp)$/i.test(subTitle)) {
        title = `${rawMain || lastMainHeader || 'Порт'} (${subTitle.toUpperCase()})`;
      } else if (!title && subTitle) {
        title = subTitle;
      }

      if (!title) continue;

      let role: DetectedColumn['semanticRole'] = 'other';
      for (const [r, regex] of SEMANTIC_PATTERNS) {
        if (regex.test(title)) {
          role = r;
          break;
        }
      }

      columns.push({
        key: `col_${colIdx}`,
        headerTitle: title,
        semanticRole: role,
      });
    }

    const dataStartIndex = headerRowIndex + (hasSubHeader ? 2 : 1);
    const rows: DynamicMatrixRow[] = [];
    let currentSectionTitle: string | undefined = undefined;
    let prevRowCache: Record<string, any> | null = null;

    for (let rIdx = dataStartIndex; rIdx < rawData.length; rIdx++) {
      const rowData = rawData[rIdx];
      if (!rowData || rowData.every(c => c === null || String(c).trim() === '')) continue;

      const nonEmptyCells = rowData.filter(c => c !== null && String(c).trim() !== '');
      const rowJoined = nonEmptyCells.map(c => String(c).toLowerCase()).join(' ');

      // Пропускаем дублирующиеся шапки внутри таблицы (как в KES_NEW на строках 9-10)
      if (
        (rowJoined.includes('функциональная роль') && rowJoined.includes('порт')) ||
        (nonEmptyCells.length <= 2 && /^(udp|tcp|\s)+$/i.test(rowJoined))
      ) {
        prevRowCache = null;
        continue;
      }

      // Если в строке заполнена только 1 ячейка (например, "Для серверов" в KES_NEW) — запоминаем как раздел
      if (nonEmptyCells.length === 1 && !/https?:\/\/|\d+\.\d+\.\d+\.\d+/i.test(String(nonEmptyCells[0]))) {
        currentSectionTitle = String(nonEmptyCells[0]).trim();
        prevRowCache = null;
        continue;
      }

      const rawValues: Record<string, any> = {};
      columns.forEach(col => {
        const cellIdx = parseInt(col.key.replace('col_', ''), 10);
        rawValues[col.key] = rowData[cellIdx];
      });

      // Наследование полей для строк-продолжений (кейс Сбербанк, где заполнена только ячейка Destination)
      const sourceCol = columns.find(c => c.semanticRole === 'source');
      const destCol = columns.find(c => c.semanticRole === 'destination');
      if (
        prevRowCache &&
        destCol &&
        rawValues[destCol.key] &&
        sourceCol &&
        !rawValues[sourceCol.key]
      ) {
        columns.forEach(col => {
          if (col.key !== destCol.key && !rawValues[col.key]) {
            rawValues[col.key] = prevRowCache![col.key];
          }
        });
      }
      prevRowCache = { ...rawValues };

      // Извлекаем сетевую семантику
      let sourceVal = '';
      let destVal = '';
      let protoColVal = '';
      const ports: ParsedNetworkMeta['ports'] = [];

      columns.forEach(col => {
        const val = rawValues[col.key];
        if (!val || String(val).trim() === '-') return;
        const strVal = String(val).trim();

        if (col.semanticRole === 'source') sourceVal = strVal;
        if (col.semanticRole === 'destination') destVal = strVal;
        if (col.semanticRole === 'protocol') protoColVal = strVal.toUpperCase();
        if (col.semanticRole === 'port_tcp') {
          ports.push({ raw: strVal, list: extractPortTokens(strVal), protocol: 'TCP' });
        }
        if (col.semanticRole === 'port_udp') {
          ports.push({ raw: strVal, list: extractPortTokens(strVal), protocol: 'UDP' });
        }
        if (col.semanticRole === 'port') {
          const isUdp = /udp/i.test(strVal) || protoColVal === 'UDP';
          ports.push({
            raw: strVal,
            list: extractPortTokens(strVal),
            protocol: isUdp ? 'UDP' : 'TCP',
          });
        }
      });

      // Определяем возможность проверки (10.132.x.x — внешний московский сегмент KSC)
      const isExternalSource = sourceVal.includes('10.132.');
      const isOutbound = sourceVal.includes('10.194.') || sourceVal.includes('10.196.');
      const isTestable = Boolean(sourceVal && destVal && ports.length > 0 && !isExternalSource);

      rows.push({
        __id: `row_${sheetName}_${rIdx}`,
        __rowNumber: rows.length + 1,
        __sectionTitle: currentSectionTitle,
        rawValues,
        meta: {
          sources: sourceVal ? sourceVal.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : [],
          destinations: destVal ? destVal.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : [],
          ports,
          isTestable,
          untestableReason: isExternalSource
            ? 'Хост-источник (10.132.x.x) находится во внешнем сегменте — нет прав для запуска проверки'[cite: 1]
            : !ports.length
            ? 'Не указаны порты для проверки'
            : undefined,
          direction: isExternalSource ? 'inbound' : isOutbound ? 'outbound' : 'internal',
        },
        checkStatus: isTestable ? 'idle' : 'untestable',
        checkLog: isExternalSource
          ? 'Проверка заблокирована политикой безопасности: инициирующий узел находится вне подконтрольного домена AD.'[cite: 1]
          : undefined,
      });
    }

    resultSheets.push({
      sheetName,
      columns,
      rows,
      portDictionary,
      stats: {
        totalRows: rows.length,
        testableRows: rows.filter(r => r.meta.isTestable).length,
      },
    });
  }

  return resultSheets;
}
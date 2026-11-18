import * as XLSX from 'xlsx';
import type {
  DetectedColumn,
  DynamicMatrixRow,
  ParsedMatrixSheet,
  ParsedPortGroup,
} from '@/types/matrix';

const ROLE_PATTERNS: Array<{ role: DetectedColumn['semanticRole']; regex: RegExp }> = [
  { role: 'index', regex: /^(№|#|id$|номер|п\/п)/i },
  { role: 'source', regex: /(source|источник|отправител|откуда|узел\s*а|сервер\s*источник)/i },
  { role: 'destination', regex: /(destination|назначен|получател|куда|цель|узел\s*б)/i },
  { role: 'port_tcp', regex: /(^tcp$|порт.*tcp|tcp.*порт|port.*tcp|tcp.*port)/i },
  { role: 'port_udp', regex: /(^udp$|порт.*udp|udp.*порт|port.*udp|udp.*port)/i },
  { role: 'port', regex: /(^порт$|^порты$|^port$|^ports$|порт\s*получател|порты\s*назначен)/i },
  { role: 'role', regex: /(функционал|роль|role|назначение\s*узла|описание\s*узла)/i },
  { role: 'protocol', regex: /(прикладн|протокол|приложен|сервис|служб|protocol|service)/i },
  { role: 'term', regex: /(срок|действ|term|expire)/i },
];

export function detectSemanticRole(headerTitle: string): DetectedColumn['semanticRole'] {
  const clean = headerTitle.replace(/\s+/g, ' ').trim();
  for (const item of ROLE_PATTERNS) {
    if (item.regex.test(clean)) {
      return item.role;
    }
  }
  return 'other';
}

export function splitCellTokens(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\r\n;,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '-' && s !== '—');
}

function scoreHeaderRow(row: unknown[]): number {
  const nonEmptyCells = row
    .map((c) => String(c ?? '').trim())
    .filter(Boolean);

  // Строка-заголовок таблицы должна содержать минимум 3 непустые ячейки
  if (nonEmptyCells.length < 3) return 0;

  let score = 0;
  for (const cell of nonEmptyCells) {
    const role = detectSemanticRole(cell);
    if (role === 'source' || role === 'destination') score += 4;
    else if (role === 'port_tcp' || role === 'port_udp' || role === 'port') score += 3;
    else if (role !== 'other') score += 2;
  }
  return score;
}

function findBestHeaderRowIndex(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 20);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore <= 0) {
    // Если ключевых слов не нашли, берем первую строку с >= 3 непустыми колонками
    const fallbackIdx = matrix.findIndex(
      (r) => (r || []).filter((c) => String(c ?? '').trim().length > 0).length >= 3
    );
    return fallbackIdx >= 0 ? fallbackIdx : 0;
  }

  return bestIdx;
}

// Проверяет, является ли следующая строка подзаголовком (например, под колонкой "Порт" идут "TCP" и "UDP")
function mergeTwoLevelHeaderIfNeeded(
  matrix: unknown[][],
  headerIdx: number
): { headers: string[]; dataStartIdx: number } {
  const topRow = matrix[headerIdx] || [];
  const nextRow = matrix[headerIdx + 1] || [];
  const maxCols = Math.max(topRow.length, nextRow.length);

  const nextRowNonEmpty = nextRow
    .map((c) => String(c ?? '').trim())
    .filter(Boolean);

  const isSubHeader =
    nextRowNonEmpty.length > 0 &&
    nextRowNonEmpty.length <= 4 &&
    nextRowNonEmpty.every((cell) => /^(tcp|udp|порт.*tcp|порт.*udp)$/i.test(cell));

  const headers: string[] = [];
  let lastTopHeader = '';

  for (let col = 0; col < maxCols; col++) {
    const rawTop = String(topRow[col] ?? '').trim();
    if (rawTop) {
      lastTopHeader = rawTop;
    }
    const effectiveTop = rawTop || lastTopHeader || `Колонка ${col + 1}`;

    if (isSubHeader) {
      const sub = String(nextRow[col] ?? '').trim();
      if (sub && !effectiveTop.toLowerCase().includes(sub.toLowerCase())) {
        headers.push(`${effectiveTop} (${sub})`);
        continue;
      }
    }

    headers.push(rawTop || `Колонка ${col + 1}`);
  }

  return {
    headers,
    dataStartIdx: isSubHeader ? headerIdx + 2 : headerIdx + 1,
  };
}

function makeRowId(sheetName: string, rowNum: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${sheetName}_r${rowNum}_${rand}`;
}

export function buildRowFromRawValues(
  sheetName: string,
  rowNumber: number,
  columns: DetectedColumn[],
  rawValues: Record<string, any>,
  sectionTitle?: string,
  existingId?: string
): DynamicMatrixRow {
  const sources = columns
    .filter((c) => c.semanticRole === 'source')
    .flatMap((c) => splitCellTokens(rawValues[c.key]));

  const destinations = columns
    .filter((c) => c.semanticRole === 'destination')
    .flatMap((c) => splitCellTokens(rawValues[c.key]));

  const ports: ParsedPortGroup[] = [];
  for (const col of columns) {
    const val = String(rawValues[col.key] ?? '').trim();
    if (!val || val === '-' || val === '—') continue;

    if (col.semanticRole === 'port_tcp') {
      const list = splitCellTokens(val);
      if (list.length > 0) ports.push({ raw: val, list, protocol: 'TCP' });
    } else if (col.semanticRole === 'port_udp') {
      const list = splitCellTokens(val);
      if (list.length > 0) ports.push({ raw: val, list, protocol: 'UDP' });
    } else if (col.semanticRole === 'port') {
      const tokens = splitCellTokens(val);
      const tcpList: string[] = [];
      const udpList: string[] = [];

      for (const token of tokens) {
        if (/^udp\s*[:/]/i.test(token)) {
          udpList.push(token.replace(/^udp\s*[:/]/i, '').trim());
        } else {
          tcpList.push(token.replace(/^tcp\s*[:/]/i, '').trim());
        }
      }

      if (tcpList.length > 0) ports.push({ raw: val, list: tcpList, protocol: 'TCP' });
      if (udpList.length > 0) ports.push({ raw: val, list: udpList, protocol: 'UDP' });
    }
  }

  const isTestable = sources.length > 0 && destinations.length > 0 && ports.length > 0;
  let untestableReason: string | undefined;

  if (!isTestable) {
    const missing: string[] = [];
    if (sources.length === 0) missing.push('Source');
    if (destinations.length === 0) missing.push('Destination');
    if (ports.length === 0) missing.push('Порты');
    untestableReason = `Не указаны: ${missing.join(', ')}`;
  }

  return {
    __id: existingId || makeRowId(sheetName, rowNumber),
    __rowNumber: rowNumber,
    __sectionTitle: sectionTitle,
    rawValues,
    meta: {
      sources,
      destinations,
      ports,
      isTestable,
      untestableReason,
    },
    checkStatus: isTestable ? 'idle' : 'untestable',
  };
}

export async function parseExcelFileToSheets(file: File): Promise<ParsedMatrixSheet[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const parsedSheets: ParsedMatrixSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (matrix.length === 0) continue;

    const headerIdx = findBestHeaderRowIndex(matrix);
    const { headers, dataStartIdx } = mergeTwoLevelHeaderIfNeeded(matrix, headerIdx);

    // Отбрасываем пустые хвостовые колонки
    let lastNonEmptyCol = headers.length - 1;
    while (
      lastNonEmptyCol > 0 &&
      /^Колонка \d+$/.test(headers[lastNonEmptyCol]) &&
      matrix.slice(dataStartIdx).every((r) => !String(r?.[lastNonEmptyCol] ?? '').trim())
    ) {
      lastNonEmptyCol--;
    }

    const effectiveHeaders = headers.slice(0, lastNonEmptyCol + 1);
    if (effectiveHeaders.length === 0) continue;

    const columns: DetectedColumn[] = effectiveHeaders.map((headerTitle, idx) => ({
      key: `col_${idx}`,
      headerTitle,
      semanticRole: detectSemanticRole(headerTitle),
    }));

    const rows: DynamicMatrixRow[] = [];
    let currentSectionTitle: string | undefined;

    for (let r = dataStartIdx; r < matrix.length; r++) {
      const cells = matrix[r] || [];
      const nonEmptyCells = cells
        .slice(0, columns.length)
        .map((c) => String(c ?? '').trim())
        .filter(Boolean);

      if (nonEmptyCells.length === 0) continue;

      // Если в строке заполнена только одна ячейка (подзаголовок раздела матрицы)
      if (nonEmptyCells.length === 1 && nonEmptyCells[0].length > 4 && !/^\d+$/.test(nonEmptyCells[0])) {
        currentSectionTitle = nonEmptyCells[0];
        continue;
      }

      const rawValues: Record<string, any> = {};
      columns.forEach((col, cIdx) => {
        rawValues[col.key] = String(cells[cIdx] ?? '').trim();
      });

      const rowObj = buildRowFromRawValues(
        sheetName,
        rows.length + 1,
        columns,
        rawValues,
        currentSectionTitle
      );

      rows.push(rowObj);
    }

    if (rows.length > 0 || wb.SheetNames.length === 1) {
      parsedSheets.push({
        sheetName,
        columns,
        rows,
        portDictionary: {},
        stats: {
          totalRows: rows.length,
          testableRows: rows.filter((r) => r.meta.isTestable).length,
        },
      });
    }
  }

  return parsedSheets;
}

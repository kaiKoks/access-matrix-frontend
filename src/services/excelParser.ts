import * as XLSX from 'xlsx';
import type { DynamicMatrixRow, DetectedColumn, ParsedMatrixSheet } from '@/types/matrix';

const SEMANTIC_PATTERNS: Record<string, RegExp> = {
  index: /^(№|п\/п|номер)/i,
  role: /(роль|сервис|наименование)/i,
  source: /(source|сервера\/узла.*\(source\)|откуда|источник)/i,
  destination: /(destination|назначени|получател|куда)/i,
  port_udp: /(порт.*udp|udp)/i,
  port_tcp: /(порт.*tcp|tcp)/i,
  port: /порт/i,
  protocol: /протокол/i,
};

export async function parseExcelMatrix(file: File): Promise<ParsedMatrixSheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const resultSheets: ParsedMatrixSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawData: (string | number | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    if (rawData.length === 0) continue;

    // Поиск строки заголовков (ищем строку с ключевыми словами)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(8, rawData.length); i++) {
      const rowStr = rawData[i].map(c => String(c || '').toLowerCase()).join(' ');
      if (rowStr.includes('ip') || rowStr.includes('порт') || rowStr.includes('destination') || rowStr.includes('source')) {
        headerRowIndex = i;
        break;
      }
    }

    const headerRow = rawData[headerRowIndex] || [];
    const subHeaderRow = rawData[headerRowIndex + 1] || [];
    const columns: DetectedColumn[] = [];

    headerRow.forEach((colName, colIdx) => {
      let title = String(colName || '').trim();
      const subTitle = String(subHeaderRow[colIdx] || '').trim();

      if (/^(tcp|udp)$/i.test(subTitle)) {
        title = `${title || 'Порт'} (${subTitle.toUpperCase()})`;
      } else if (!title && subTitle) {
        title = subTitle;
      }

      if (!title) return;

      let role: DetectedColumn['semanticRole'] = 'other';
      for (const [r, regex] of Object.entries(SEMANTIC_PATTERNS)) {
        if (regex.test(title)) {
          role = r as DetectedColumn['semanticRole'];
          break;
        }
      }

      columns.push({
        key: `col_${colIdx}`,
        headerTitle: title,
        semanticRole: role,
        isNetworkCritical: ['source', 'destination', 'port', 'port_tcp', 'port_udp'].includes(role || ''),
      });
    });

    const hasSubHeader = subHeaderRow.some(c => /^(tcp|udp)$/i.test(String(c || '').trim()));
    const dataStartIndex = headerRowIndex + (hasSubHeader ? 2 : 1);

    const rows: DynamicMatrixRow[] = [];
    for (let rIdx = dataStartIndex; rIdx < rawData.length; rIdx++) {
      const rowData = rawData[rIdx];
      if (!rowData || rowData.every(c => c === null || c === '')) continue;

      const rawValues: Record<string, any> = {};
      let sourceVal = '';
      let destVal = '';
      const ports: { raw: string; protocol?: 'TCP' | 'UDP' | 'ANY' }[] = [];

      columns.forEach(col => {
        const cellIdx = parseInt(col.key.replace('col_', ''), 10);
        const cellValue = rowData[cellIdx];
        rawValues[col.key] = cellValue;

        if (col.semanticRole === 'source' && cellValue) sourceVal = String(cellValue);
        if (col.semanticRole === 'destination' && cellValue) destVal = String(cellValue);
        if (col.semanticRole === 'port_tcp' && cellValue && cellValue !== '-') {
          ports.push({ raw: String(cellValue), protocol: 'TCP' });
        }
        if (col.semanticRole === 'port_udp' && cellValue && cellValue !== '-') {
          ports.push({ raw: String(cellValue), protocol: 'UDP' });
        }
        if (col.semanticRole === 'port' && cellValue) {
          ports.push({ raw: String(cellValue), protocol: 'ANY' });
        }
      });

      // Ограничение видимости: 10.132.x.x - внешний сегмент KSC (непроверяемый)
      const isOutbound = sourceVal.includes('10.194.') || sourceVal.includes('10.196.');
      const isExternalSource = sourceVal.includes('10.132.');

      const isTestable = Boolean(sourceVal && destVal && ports.length > 0 && !isExternalSource);

      rows.push({
        __id: `row_${sheetName}_${rIdx}`,
        __rowNumber: rIdx + 1,
        rawValues,
        meta: {
          sources: sourceVal ? sourceVal.split(/[\n,]+/).map(s => s.trim()) : [],
          destinations: destVal ? destVal.split(/[\n,]+/).map(s => s.trim()) : [],
          ports,
          isTestable,
          direction: isExternalSource ? 'inbound' : isOutbound ? 'outbound' : 'internal',
        },
        checkStatus: isTestable ? 'idle' : 'untestable',
        checkLog: isExternalSource
          ? 'Проверка недоступна: хост находится во внешнем сегменте сети (нет прав администратора).'
          : undefined,
      });
    }

    resultSheets.push({
      sheetName,
      columns,
      rows,
      stats: {
        totalRows: rows.length,
        testableRows: rows.filter(r => r.meta?.isTestable).length,
      },
    });
  }

  return resultSheets;
}
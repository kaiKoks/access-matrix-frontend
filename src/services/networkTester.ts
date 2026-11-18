import * as XLSX from 'xlsx';
import type {
  DynamicMatrixRow,
  MatrixViewGroup,
  ParsedMatrixSheet,
  SavedMatrixSystem,
  SocketCheckItem,
} from '@/types/matrix';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

async function handleApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status} (${res.statusText})`;
    try {
      const errBody = await res.json();
      if (errBody?.message) {
        errorMessage = Array.isArray(errBody.message)
          ? errBody.message.join('; ')
          : String(errBody.message);
      }
    } catch {
      // Игнорируем ошибку парсинга JSON при нестандартном ответе
    }
    throw new Error(errorMessage);
  }
  return (await res.json()) as T;
}

export async function fetchCatalogFromBackend(): Promise<SavedMatrixSystem[]> {
  const res = await fetch(`${API_BASE}/catalog`);
  return await handleApiResponse<SavedMatrixSystem[]>(res);
}

export async function saveSystemToBackend(
  name: string,
  sheets: ParsedMatrixSheet[]
): Promise<SavedMatrixSystem> {
  const res = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sheets }),
  });
  return await handleApiResponse<SavedMatrixSystem>(res);
}

export async function deleteSystemFromBackend(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/catalog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    await handleApiResponse(res);
  }
}

export interface CheckRuleApiResponse {
  status: 'accessible' | 'blocked' | 'untestable';
  socketResults: SocketCheckItem[];
  log: string;
  checkedAt: string;
}

export async function checkRuleOnBackend(
  row: DynamicMatrixRow
): Promise<CheckRuleApiResponse> {
  const res = await fetch(`${API_BASE}/checker/test-rule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: row.meta.sources,
      destinations: row.meta.destinations,
      ports: row.meta.ports,
    }),
  });
  return await handleApiResponse<CheckRuleApiResponse>(res);
}

function extractCleanHostPreview(rawEndpoint: string): string {
  let cleaned = rawEndpoint.trim();

  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch {
      // ignore
    }
  }

  const cidrMatch = cleaned.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\/\d{1,2}$/);
  if (cidrMatch) {
    const lastOctet = parseInt(cidrMatch[2], 10);
    return `${cidrMatch[1]}.${lastOctet === 0 ? 1 : lastOctet}`;
  }

  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/')[0].trim();
  }

  if (cleaned.includes('-')) {
    const firstIp = cleaned.split('-')[0].trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(firstIp)) {
      return firstIp;
    }
  }

  return cleaned.replace(/\.$/, '');
}

function expandPortTokenPreview(token: string): string[] {
  const clean = token.replace(/^(tcp|udp)\//i, '').trim();
  const rangeMatch = clean.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (start > end || start < 1 || end > 65535) return [];

    const diff = end - start;
    if (diff <= 20) {
      return Array.from({ length: diff + 1 }, (_, i) => String(start + i));
    }

    const mid = Math.floor((start + end) / 2);
    return Array.from(new Set([String(start), String(mid), String(end)]));
  }
  return /^\d+$/.test(clean) ? [clean] : [];
}

export function buildAllSocketCombinations(row: DynamicMatrixRow): SocketCheckItem[] {
  const sources = row.meta.sources?.length ? row.meta.sources : ['LocalHost'];
  const destinations = row.meta.destinations?.length ? row.meta.destinations : ['Unknown'];
  const items: SocketCheckItem[] = [];

  for (const src of sources) {
    for (const dst of destinations) {
      const cleanDest = extractCleanHostPreview(dst);

      for (const portGroup of row.meta.ports || []) {
        for (const rawPort of portGroup.list || []) {
          const expandedPorts = expandPortTokenPreview(rawPort);

          for (const port of expandedPorts) {
            const zabbixKey =
              portGroup.protocol === 'UDP'
                ? `net.udp.port[${cleanDest},${port}]`
                : `net.tcp.port[${cleanDest},${port}]`;

            items.push({
              id: `${src}->${dst}:${port}/${portGroup.protocol}`,
              source: src,
              destination: dst,
              port,
              protocol: portGroup.protocol,
              zabbixKey,
              lastvalue: '0',
              lastclock: 0,
              status: 'blocked',
            });
          }
        }
      }
    }
  }

  return items;
}

function formatRowStatusForExcel(row: DynamicMatrixRow): string {
  const testableSockets =
    row.socketResults?.filter((s) => s.status !== 'untestable') || [];
  const total = testableSockets.length;
  const open = testableSockets.filter((s) => s.status === 'accessible').length;
  const countSuffix = total > 0 ? ` (${open}/${total})` : '';

  switch (row.checkStatus) {
    case 'accessible':
      return `Доступен${countSuffix}`;
    case 'blocked':
      return `Закрыт${countSuffix}`;
    case 'error':
      return `Ошибка API${row.errorMessage ? `: ${row.errorMessage}` : ''}`;
    case 'untestable':
      return `Недоступно${row.meta.untestableReason ? ` (${row.meta.untestableReason})` : ''}`;
    case 'checking':
      return 'Выполняется проверка';
    default:
      return 'Не проверялось';
  }
}

export function exportFilteredGroupsToExcel(
  groups: MatrixViewGroup[],
  customFileName?: string
): void {
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  groups.forEach((group, idx) => {
    const rawSheetName = `${group.systemName}_${group.sheetName}`
      .replace(/[\\/?*[\]:]/g, '_')
      .trim()
      .slice(0, 28);

    let safeSheetName = rawSheetName || `Sheet_${idx + 1}`;
    let counter = 2;
    while (usedSheetNames.has(safeSheetName)) {
      safeSheetName = `${rawSheetName.slice(0, 25)}_${counter++}`;
    }
    usedSheetNames.add(safeSheetName);

    const headers = [
      '№',
      'Статус доступа',
      ...group.columns.map((c) => c.headerTitle),
      'Результат проверки сокетов',
    ];

    const dataRows = group.rows.map((row) => {
      const socketSummary =
        row.socketResults && row.socketResults.length > 0
          ? row.socketResults
              .map((s) => {
                const stateLabel =
                  s.status === 'accessible'
                    ? 'OPEN (1)'
                    : s.status === 'untestable'
                    ? 'SKIPPED'
                    : 'CLOSED (0)';
                return `${s.protocol} ${s.destination}:${s.port} -> ${stateLabel}`;
              })
              .join('\n')
          : '—';

      return [
        row.__rowNumber,
        formatRowStatusForExcel(row),
        ...group.columns.map((col) => String(row.rawValues[col.key] ?? '')),
        socketSummary,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      ...group.columns.map(() => ({ wch: 28 })),
      { wch: 42 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const baseName = customFileName
    ? `${customFileName.trim().replace(/\.xlsx?$/i, '')}_${dateStamp}`
    : `access_matrix_export_${dateStamp}`;
  const fileName = `${baseName.replace(/[\\/?*[\]:"|<>]+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

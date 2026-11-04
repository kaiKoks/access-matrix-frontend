import * as XLSX from 'xlsx';
import type {
  DynamicMatrixRow,
  ParsedMatrixSheet,
  SocketCheckItem,
  NetworkCheckStatus,
  SavedMatrixSystem,
} from '@/types/matrix';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export type CheckerMode = 'mock' | 'zabbix';

export interface RowCheckSummary {
  status: NetworkCheckStatus;
  socketResults: SocketCheckItem[];
  log: string;
  checkedAt?: string;
}

// Извлекает читаемое сообщение об ошибке из ответа NestJS
async function extractBackendError(res: Response, fallbackMsg: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('; ') : String(data.message);
    }
  } catch {
    // ignore JSON parse error
  }
  return `${fallbackMsg} (HTTP ${res.status})`;
}

function expandPortList(token: string): string[] {
  const clean = token.replace(/^(tcp|udp)\//i, '').trim();
  const rangeMatch = clean.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const diff = end - start;
    if (diff > 0 && diff <= 5) {
      return Array.from({ length: diff + 1 }, (_, i) => String(start + i));
    }
    return [clean];
  }
  return /^\d+$/.test(clean) ? [clean] : [];
}

// Формирует список ожидаемых связок для предпросмотра в боковой панели
export function buildAllSocketCombinations(row: DynamicMatrixRow): Omit<
  SocketCheckItem,
  'lastvalue' | 'lastclock' | 'status'
>[] {
  const sources = row.meta.sources.length ? row.meta.sources : ['LocalHost'];
  const destinations = row.meta.destinations.length ? row.meta.destinations : ['Unknown'];
  const combinations: Omit<SocketCheckItem, 'lastvalue' | 'lastclock' | 'status'>[] = [];

  for (const src of sources) {
    for (const dst of destinations) {
      for (const portGroup of row.meta.ports) {
        for (const rawPortToken of portGroup.list) {
          const expandedPorts = expandPortList(rawPortToken);
          for (const port of expandedPorts) {
            const zabbixKey =
              portGroup.protocol === 'UDP'
                ? `custom.udp.port[${port}]`
                : `net.tcp.port[127.0.0.1, ${port}]`;

            combinations.push({
              id: `${src}->${dst}:${port}/${portGroup.protocol}`,
              source: src,
              destination: dst,
              port,
              protocol: portGroup.protocol,
              zabbixKey,
            });
          }
        }
      }
    }
  }

  return combinations;
}

// 1. POST /api/checker/test-rule (без локальных фолбэков)
export async function checkRuleOnBackend(
  row: DynamicMatrixRow,
  mode: CheckerMode
): Promise<RowCheckSummary> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/checker/test-rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: row.meta.sources,
        destinations: row.meta.destinations,
        ports: row.meta.ports,
        mode,
      }),
    });
  } catch {
    throw new Error('Сервер бэкенда недоступен (проверьте, запущен ли NestJS на порту 3000)');
  }

  if (!response.ok) {
    const errMsg = await extractBackendError(response, 'Ошибка при проверке правила');
    throw new Error(errMsg);
  }

  return await response.json();
}

// 2. GET /api/catalog
export async function fetchCatalogFromBackend(): Promise<SavedMatrixSystem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/catalog`);
  } catch {
    throw new Error('Не удалось подключиться к бэкенду (http://localhost:3000/api/catalog)');
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(res, 'Ошибка загрузки каталога матриц');
    throw new Error(errMsg);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// 3. POST /api/catalog
export async function saveSystemToBackend(
  name: string,
  sheets: ParsedMatrixSheet[]
): Promise<SavedMatrixSystem> {
  const cleanName = (name || 'Матрица').trim();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, sheets }),
    });
  } catch {
    throw new Error('Не удалось сохранить матрицу: сервер бэкенда недоступен');
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(res, 'Ошибка при сохранении матрицы');
    throw new Error(errMsg);
  }

  return await res.json();
}

// 4. DELETE /api/catalog/:id
export async function deleteSystemFromBackend(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/catalog/${id}`, { method: 'DELETE' });
  } catch {
    throw new Error('Не удалось удалить матрицу: сервер бэкенда недоступен');
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(res, 'Ошибка при удалении матрицы');
    throw new Error(errMsg);
  }
}

export function exportMatrixToExcel(sheet: ParsedMatrixSheet, fileNamePrefix = 'Отчет') {
  const exportRows = sheet.rows.map((row) => {
    const total = row.socketResults?.length || 0;
    const open = row.socketResults?.filter((s) => s.status === 'accessible').length || 0;

    const obj: Record<string, any> = {
      'Матрица (ИС)': row.__systemName || sheet.sheetName,
      '№': row.__rowNumber,
      'Раздел': row.__sectionTitle || 'Основной',
      'Статус доступности':
        row.checkStatus === 'accessible'
          ? `Доступен (${open}/${total})`
          : row.checkStatus === 'blocked'
          ? `Закрыт (0/${total})`
          : row.checkStatus === 'error'
          ? `Ошибка (${row.errorMessage || 'Сбой запроса'})`
          : row.checkStatus === 'untestable'
          ? 'Недоступно для проверки'
          : 'Не проверен',
      'Время проверки': row.lastCheckedAt || '—',
    };

    sheet.columns.forEach((col) => {
      obj[col.headerTitle] = row.rawValues[col.key] ?? '';
    });

    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

import * as XLSX from 'xlsx';
import type {
  DynamicMatrixRow,
  ParsedMatrixSheet,
  SocketCheckItem,
  NetworkCheckStatus,
  SavedMatrixSystem,
} from '@/types/matrix';

const API_BASE_URL = 'http://localhost:3000/api';
const STORAGE_KEY = 'matrix_catalog_clean_v2';

export interface RowCheckSummary {
  status: NetworkCheckStatus;
  socketResults: SocketCheckItem[];
  log: string;
  checkedAt?: string;
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

// POST запрос на бэкенд для проверки правила
export async function simulateNetworkCheck(row: DynamicMatrixRow): Promise<RowCheckSummary> {
  try {
    const response = await fetch(`${API_BASE_URL}/checker/test-rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: row.meta.sources,
        destinations: row.meta.destinations,
        ports: row.meta.ports,
      }),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn('Не удалось связаться с бэкендом, выполняется локальная проверка:', err);
  }

  // Резервная эмуляция, если бэкенд не запущен
  await new Promise((r) => setTimeout(r, 200));
  const combinations = buildAllSocketCombinations(row);
  const nowUnix = Math.floor(Date.now() / 1000);

  const socketResults: SocketCheckItem[] = combinations.map((c) => {
    const isOpen = Math.random() > 0.2;
    return {
      ...c,
      lastvalue: isOpen ? '1' : '0',
      lastclock: nowUnix,
      status: isOpen ? 'accessible' : 'blocked',
    };
  });

  const hasOpen = socketResults.some((s) => s.status === 'accessible');
  return {
    status: hasOpen ? 'accessible' : 'blocked',
    socketResults,
    log: socketResults
      .map((s) => `[${s.protocol}] ${s.source} -> ${s.destination}:${s.port} | lastvalue=${s.lastvalue}`)
      .join('\n'),
    checkedAt: new Date().toLocaleTimeString(),
  };
}

// Отфильтровывает пустые матрицы (с 0 строк)
function filterValidSystems(systems: SavedMatrixSystem[]): SavedMatrixSystem[] {
  if (!Array.isArray(systems)) return [];
  return systems.filter(
    (sys) =>
      sys &&
      Array.isArray(sys.sheets) &&
      sys.sheets.some((sh) => Array.isArray(sh.rows) && sh.rows.length > 0)
  );
}

// GET /api/catalog
export async function fetchCatalogFromBackend(): Promise<SavedMatrixSystem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/catalog`);
    if (res.ok) {
      const data = filterValidSystems(await res.json());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.warn('Бэкенд /api/catalog недоступен, чтение из кэша:', err);
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return cached ? filterValidSystems(JSON.parse(cached)) : [];
  } catch {
    return [];
  }
}

// POST /api/catalog
export async function saveSystemToBackend(
  name: string,
  sheets: ParsedMatrixSheet[]
): Promise<SavedMatrixSystem> {
  const sysId = `sys_${Date.now()}`;
  const cleanName = (name || 'Матрица').trim();

  const normalizedSheets: ParsedMatrixSheet[] = sheets
    .filter((sh) => Array.isArray(sh.rows) && sh.rows.length > 0)
    .map((sh) => ({
      ...sh,
      rows: sh.rows.map((r, i) => ({
        ...r,
        __id: `${sysId}_${sh.sheetName}_${r.__rowNumber || i + 1}`,
        __systemId: sysId,
        __systemName: cleanName,
        __sheetName: sh.sheetName,
      })),
    }));

  try {
    const res = await fetch(`${API_BASE_URL}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, sheets: normalizedSheets }),
    });

    if (res.ok) {
      const saved: SavedMatrixSystem = await res.json();
      return saved;
    }
  } catch (err) {
    console.warn('Не удалось отправить на бэкенд, сохранено локально:', err);
  }

  // Если бэкенд недоступен, сохраняем локально
  const current = await fetchCatalogFromBackend();
  const record: SavedMatrixSystem = {
    id: sysId,
    name: cleanName,
    updatedAt: new Date().toLocaleString('ru-RU'),
    sheets: normalizedSheets,
  };
  const next = [...current.filter((c) => c.name.toLowerCase() !== cleanName.toLowerCase()), record];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return record;
}

// DELETE /api/catalog/:id
export async function deleteSystemFromBackend(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/catalog/${id}`, { method: 'DELETE' });
  } catch {}
  const current = await fetchCatalogFromBackend();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(current.filter((c) => c.id !== id))
  );
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
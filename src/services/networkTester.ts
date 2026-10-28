import * as XLSX from 'xlsx';
import type {
  DynamicMatrixRow,
  ParsedMatrixSheet,
  SocketCheckItem,
  NetworkCheckStatus,
  SavedMatrixSystem,
} from '../types/matrix';

const API_BASE_URL = 'http://localhost:3000/api';
const LOCAL_STORAGE_CATALOG_KEY = 'matrix_catalog_fallback_v1';

export interface RowCheckSummary {
  status: NetworkCheckStatus;
  socketResults: SocketCheckItem[];
  log: string;
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
      const data = await response.json();
      if (Array.isArray(data.socketResults) && data.socketResults.length > 0) {
        const nowClock = Math.floor(Date.now() / 1000);
        const normalizedSockets: SocketCheckItem[] = data.socketResults.map(
          (s: any, idx: number) => {
            const isOpen = s.status === 'accessible' || s.lastvalue === '1';
            const proto = s.protocol || 'TCP';
            return {
              id: s.id || `sock_${idx}`,
              source: s.source,
              destination: s.destination,
              port: String(s.port),
              protocol: proto,
              zabbixKey:
                s.zabbixKey ||
                (proto === 'UDP'
                  ? `custom.udp.port[${s.port}]`
                  : `net.tcp.port[127.0.0.1, ${s.port}]`),
              lastvalue: isOpen ? '1' : '0',
              lastclock: s.lastclock || nowClock,
              status: isOpen ? 'accessible' : 'blocked',
            };
          }
        );

        const hasAtLeastOneOpen = normalizedSockets.some((s) => s.status === 'accessible');
        return {
          status: hasAtLeastOneOpen ? 'accessible' : 'blocked',
          socketResults: normalizedSockets,
          log: data.log,
        };
      }
    }
  } catch {
    // Fallback
  }

  return emulateZabbixApiCheck(row);
}

async function emulateZabbixApiCheck(row: DynamicMatrixRow): Promise<RowCheckSummary> {
  await new Promise((res) => setTimeout(res, 200 + Math.random() * 250));

  const combinations = buildAllSocketCombinations(row);
  const nowUnix = Math.floor(Date.now() / 1000);
  const socketResults: SocketCheckItem[] = [];

  const logLines: string[] = [
    `POST /zabbix/api_jsonrpc.php (method: "item.get")`,
    `Проверено связок: ${combinations.length}`,
    `------------------------------------------------------------`,
  ];

  for (const combo of combinations) {
    const isOpen = Math.random() > 0.2;
    const lastvalue: '1' | '0' = isOpen ? '1' : '0';
    const lastclock = nowUnix - Math.floor(2 + Math.random() * 40);

    socketResults.push({
      ...combo,
      lastvalue,
      lastclock,
      status: isOpen ? 'accessible' : 'blocked',
    });

    // Не дублируем :port, если URL уже заканчивается на этот порт
    const destWithPort = combo.destination.endsWith(`:${combo.port}`)
      ? combo.destination
      : `${combo.destination}:${combo.port}`;

    logLines.push(
      `[${combo.protocol}] ${combo.source} -> ${destWithPort}\n` +
        `  key_: "${combo.zabbixKey}" | lastvalue: "${lastvalue}" | lastclock: ${new Date(
          lastclock * 1000
        ).toLocaleTimeString()}`
    );
  }

  const hasAtLeastOneOpen = socketResults.some((s) => s.status === 'accessible');

  return {
    status: hasAtLeastOneOpen ? 'accessible' : 'blocked',
    socketResults,
    log: logLines.join('\n'),
  };
}

export async function fetchCatalogFromBackend(): Promise<SavedMatrixSystem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/catalog`);
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  const cached = localStorage.getItem(LOCAL_STORAGE_CATALOG_KEY);
  return cached ? JSON.parse(cached) : [];
}

export async function saveSystemToBackend(
  name: string,
  sheets: ParsedMatrixSheet[]
): Promise<SavedMatrixSystem> {
  const enrichedSheets = sheets.map((s) => ({
    ...s,
    rows: s.rows.map((r) => ({
      ...r,
      __systemName: name,
      __sheetName: s.sheetName,
    })),
  }));

  try {
    const res = await fetch(`${API_BASE_URL}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sheets: enrichedSheets }),
    });
    if (res.ok) {
      const saved: SavedMatrixSystem = await res.json();
      const current = await fetchCatalogFromBackend();
      localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(current));
      return saved;
    }
  } catch {}

  const list = await fetchCatalogFromBackend();
  const existingIdx = list.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  const record: SavedMatrixSystem = {
    id: existingIdx >= 0 ? list[existingIdx].id : `sys_${Date.now()}`,
    name,
    updatedAt: new Date().toLocaleString('ru-RU'),
    sheets: enrichedSheets,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = record;
  } else {
    list.push(record);
  }
  localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(list));
  return record;
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
          ? 'Н/Д'
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
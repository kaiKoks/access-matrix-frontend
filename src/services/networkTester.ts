import * as XLSX from 'xlsx';
import type { DynamicMatrixRow, ParsedMatrixSheet, SocketCheckItem, NetworkCheckStatus} from '@/types/matrix';

export interface RowCheckSummary {
  status: NetworkCheckStatus;
  socketResults: SocketCheckItem[];
  log: string;
}

export async function simulateNetworkCheck(row: DynamicMatrixRow): Promise<RowCheckSummary> {
  await new Promise(res => setTimeout(res, 350 + Math.random() * 450));

  const source = row.meta.sources[0] || 'LocalHost';
  const destinations = row.meta.destinations.length ? row.meta.destinations : ['Unknown'];
  const socketResults: SocketCheckItem[] = [];
  const logLines: string[] = [
    `[${new Date().toLocaleTimeString()}] Запуск диагностики с узла: ${source}`
  ];

  for (const dest of destinations) {
    for (const portGroup of row.meta.ports) {
      // Берем до 4 портов из группы для симуляции, чтобы не перегружать лог
      const samplePorts = portGroup.list.slice(0, 4);
      for (const port of samplePorts) {
        const isSuccess = Math.random() > 0.15;
        const latency = Math.floor(8 + Math.random() * 35);

        socketResults.push({
          source,
          destination: dest,
          port,
          protocol: portGroup.protocol,
          status: isSuccess ? 'accessible' : 'blocked',
          latencyMs: isSuccess ? latency : undefined,
        });

        const cmd = portGroup.protocol === 'UDP'
          ? `nc -z -v -u -w2 ${dest} ${port}`
          : `Test-NetConnection -ComputerName ${dest} -Port ${port}`;

        logLines.push(
          `> ${cmd}\n  ${isSuccess ? `OK (${latency}ms) — Порт открыт` : `FAIL — Таймаут соединения / Фильтрация МСЭ`}`
        );
      }
    }
  }

  const accessibleCount = socketResults.filter(r => r.status === 'accessible').length;
  let status: NetworkCheckStatus = 'blocked';
  if (accessibleCount === socketResults.length && socketResults.length > 0) {
    status = 'accessible';
  } else if (accessibleCount > 0) {
    status = 'partial';
  }

  return {
    status,
    socketResults,
    log: logLines.join('\n'),
  };
}

// Экспорт текущей матрицы вместе со статусами проверок в Excel[cite: 1]
export function exportMatrixToExcel(sheet: ParsedMatrixSheet) {
  const exportRows = sheet.rows.map(row => {
    const obj: Record<string, any> = {
      '№': row.__rowNumber,
      'Раздел': row.__sectionTitle || 'Основной',
      'Статус доступности':
        row.checkStatus === 'accessible' ? 'Доступен' :
        row.checkStatus === 'partial' ? 'Частично доступен' :
        row.checkStatus === 'blocked' ? 'Закрыт' :
        row.checkStatus === 'untestable' ? 'Недоступно для проверки' : 'Не проверен',
      'Время проверки': row.lastCheckedAt || '—',
    };

    sheet.columns.forEach(col => {
      obj[col.headerTitle] = row.rawValues[col.key] ?? '';
    });

    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 31));
  XLSX.writeFile(wb, `Отчет_${sheet.sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
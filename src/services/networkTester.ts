import type { DynamicMatrixRow } from '@/types/matrix';

export interface CheckResult {
  status: 'accessible' | 'blocked';
  log: string;
}

export async function simulateNetworkCheck(row: DynamicMatrixRow): Promise<CheckResult> {
  // Задержка сетевого ответа 400-800 мс
  await new Promise(res => setTimeout(res, 400 + Math.random() * 400));

  const dest = row.meta?.destinations?.[0] || 'Unknown';
  const port = row.meta?.ports?.[0]?.raw || 'Unknown';
  const proto = row.meta?.ports?.[0]?.protocol || 'TCP';

  // Имитация доступности (90% доступно, 10% закрыто)
  const isSuccess = Math.random() > 0.12;

  if (isSuccess) {
    return {
      status: 'accessible',
      log: `[${new Date().toLocaleTimeString()}] Проверка ${proto} до ${dest}:${port}\n` +
           `> Test-NetConnection -ComputerName ${dest} -Port ${port}\n` +
           `TcpTestSucceeded : True\nОтвет получен за ${Math.floor(10 + Math.random() * 40)}ms`
    };
  } else {
    return {
      status: 'blocked',
      log: `[${new Date().toLocaleTimeString()}] Проверка ${proto} до ${dest}:${port}\n` +
           `> Test-NetConnection -ComputerName ${dest} -Port ${port}\n` +
           `TcpTestSucceeded : False\nОшибка: Connection timed out / Сетевой порт закрыт или отфильтрован фаерволом`
    };
  }
}
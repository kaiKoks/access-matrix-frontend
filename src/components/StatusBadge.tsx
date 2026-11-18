import React from 'react';
import type { NetworkCheckStatus, SocketCheckItem } from '@/types/matrix';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Ban,
  AlertTriangle,
} from 'lucide-react';

interface StatusBadgeProps {
  status: NetworkCheckStatus;
  reason?: string;
  errorMessage?: string;
  socketResults?: SocketCheckItem[];
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  reason,
  errorMessage,
  socketResults,
}) => {
  const testableResults =
    socketResults?.filter((s) => s.status !== 'untestable') || [];
  const total = testableResults.length;
  const openCount = testableResults.filter((s) => s.status === 'accessible').length;
  const countLabel = total > 0 ? ` (${openCount}/${total})` : '';

  switch (status) {
    case 'checking':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Проверка...
        </span>
      );

    case 'accessible':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Доступен{countLabel}
        </span>
      );

    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <XCircle className="w-3.5 h-3.5" />
          Закрыт{countLabel}
        </span>
      );

    case 'error':
      return (
        <span
          title={errorMessage || 'Ошибка запроса к Zabbix API'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 cursor-help"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Ошибка API
        </span>
      );

    case 'untestable':
      return (
        <span
          title={reason || 'Автоматическая проверка недоступна'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-help"
        >
          <Ban className="w-3.5 h-3.5" />
          Недоступно
        </span>
      );

    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800/70 text-zinc-400 border border-zinc-700/70">
          <Clock className="w-3.5 h-3.5" />
          Не проверялось
        </span>
      );
  }
};

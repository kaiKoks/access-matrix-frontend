import React from 'react';
import type { NetworkCheckStatus, SocketCheckItem } from '@/types/matrix';
import { CheckCircle2, XCircle, AlertCircle, Loader2, MinusCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: NetworkCheckStatus;
  reason?: string;
  socketResults?: SocketCheckItem[];
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, reason, socketResults }) => {
  const total = socketResults?.length || 0;
  const openCount = socketResults?.filter((s) => s.status === 'accessible').length || 0;
  const countLabel = total > 0 ? ` (${openCount}/${total})` : '';

  switch (status) {
    case 'accessible':
      return (
        <span
          title={`Доступно связок: ${openCount} из ${total}`}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Доступен{countLabel}</span>
        </span>
      );
    case 'blocked':
      return (
        <span
          title={`Все проверенные связки (${total}) закрыты`}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap"
        >
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Закрыт{countLabel}</span>
        </span>
      );
    case 'checking':
      return (
        <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>Опрос...</span>
        </span>
      );
    case 'untestable':
      return (
        <span
          title={reason || 'Проверка невозможна из текущего сетевого сегмента'}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-help whitespace-nowrap"
        >
          <MinusCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>Недоступно</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800/60 text-zinc-400 border border-zinc-700/60 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>Не проверен</span>
        </span>
      );
  }
};
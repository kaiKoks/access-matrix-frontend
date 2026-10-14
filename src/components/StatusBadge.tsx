import React from 'react';
import type { NetworkCheckStatus } from '../types/matrix';
import { CheckCircle2, XCircle, AlertTriangle, AlertCircle, Loader2, MinusCircle } from 'lucide-react';

export const StatusBadge: React.FC<{ status: NetworkCheckStatus; reason?: string }> = ({ status, reason }) => {
  switch (status) {
    case 'accessible':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Доступен
        </span>
      );
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Частично
        </span>
      );
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <XCircle className="w-3.5 h-3.5" />
          Закрыт
        </span>
      );
    case 'checking':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Опрос...
        </span>
      );
    case 'untestable':
      return (
        <span
          title={reason || 'Проверка невозможна из текущего сетевого сегмента'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-help"
        >
          <MinusCircle className="w-3.5 h-3.5 text-zinc-500" />
          Недоступно
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800/60 text-zinc-400 border border-zinc-700/60">
          <AlertCircle className="w-3.5 h-3.5 text-zinc-500" />
          Не проверен
        </span>
      );
  }
};
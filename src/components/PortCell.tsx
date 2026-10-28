import React from 'react';
import { extractPortTokens } from '@/services/excelParser';

interface PortCellProps {
  value: any;
  isTcp?: boolean;
  isUdp?: boolean;
  dictionary: Record<string, string>;
}

export const PortCell: React.FC<PortCellProps> = ({ value, isTcp, isUdp, dictionary }) => {
  if (!value || String(value).trim() === '-') {
    return <span className="text-zinc-600">—</span>;
  }

  const tokens = extractPortTokens(String(value));
  if (tokens.length === 0) {
    return <span className="text-zinc-400 font-mono text-xs">{String(value)}</span>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {tokens.map((port, idx) => {
        const match = port.trim().match(/^(\d+(?:\s*[–-]\s*\d+)?)/);
        const cleanKey = match ? match[1].replace(/\s+/g, '') : '';
        const hint = dictionary[cleanKey];

        return (
          <span
            key={idx}
            title={hint ? `${port}: ${hint}` : undefined}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition bg-zinc-800 text-zinc-200 border border-zinc-700 ${hint ? 'cursor-help hover:border-zinc-400' : ''}`}
          >
            <span>{port}</span>
          </span>
        );
      })}
    </div>
  );
};
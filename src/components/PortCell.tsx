import React from 'react';
import { extractPortTokens } from '../services/excelParser';

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

  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {tokens.map((port, idx) => {
        const cleanKey = port.replace(/[^\d–-]/g, '');
        const hint = dictionary[cleanKey];

        return (
          <span
            key={idx}
            title={hint ? `${port}: ${hint}` : undefined}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition bg-zinc-800/20 text-zinc-200 border border-zinc-700/60 ${hint ? 'cursor-help hover:border-zinc-600/70' : ''}`}
          >
            <span>{port}</span>
          </span>
        );
      })}
    </div>
  );
};
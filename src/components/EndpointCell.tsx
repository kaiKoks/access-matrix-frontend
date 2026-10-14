import React from 'react';

export const EndpointCell: React.FC<{ value: any }> = ({ value }) => {
  if (!value) return <span className="text-zinc-600">—</span>;

  const items = String(value)
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => {
        const isUrl = /^https?:\/\//i.test(item);
        const isSubnet = /\/\d{1,2}$|[–-]/.test(item) && !item.includes('.ru');

        return (
          <div
            key={i}
            className="inline-flex items-center gap-1.5 text-xs font-mono bg-zinc-900/90 border border-zinc-800 px-2 py-1 rounded w-fit max-w-full"
          >
            <span className="truncate text-zinc-200" title={item}>
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
};
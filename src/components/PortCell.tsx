import React from 'react';

const PORT_HINTS: Record<string, string> = {
  '88': 'Kerberos (Аутентификация AD)',
  '389': 'LDAP (Каталог Active Directory)',
  '636': 'LDAPS (Защищенный каталог)',
  '445': 'SMB (Файловый доступ Windows)',
  '135': 'RPC Endpoint Mapper',
  '53': 'DNS (Служба доменных имен)',
  '13000': 'Kaspersky Security Center (Агент/Сервер)',
  '15000': 'Kaspersky Network Agent (UDP)'
};

export const PortCell: React.FC<{ value: any; isTcp?: boolean; isUdp?: boolean }> = ({ value, isTcp, isUdp }) => {
  if (!value || value === '-') return <span className="text-zinc-600">—</span>;

  const portStr = String(value);
  const hint = PORT_HINTS[portStr.trim()];

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <span
        title={hint || undefined}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${isTcp ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' :
            isUdp ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' :
              'bg-zinc-800 text-zinc-300 border border-zinc-700'
          } ${hint ? 'cursor-help underline decoration-dotted' : ''}`}
      >
        {portStr}
      </span>
    </div>
  );
};
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, HelpCircle, Sparkles, Layers } from 'lucide-react';
import type { DetectedColumn, SavedMatrixSystem } from '@/types/matrix';
import { parseSmartSearchQuery } from '@/utils/searchQueryParser';

interface SmartSearchInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  columns?: DetectedColumn[];
  systems?: SavedMatrixSystem[];
  placeholder?: string;
  className?: string;
}

interface QuickSyntaxHint {
  prefix: string;
  label: string;
}

const QUICK_HINTS: QuickSyntaxHint[] = [
  { prefix: '@', label: 'Матрица (@имя)' },
  { prefix: 'src:', label: 'Источник (IP/хост)' },
  { prefix: 'dst:', label: 'Назначение (IP/FQDN)' },
  { prefix: 'port:', label: 'Любой порт / диапазон' },
  { prefix: 'tcp:', label: 'TCP-порты' },
  { prefix: 'udp:', label: 'UDP-порты' },
  { prefix: 'role:', label: 'Функциональная роль' },
  { prefix: 'proto:', label: 'Протокол / сервис' },
  { prefix: 'status:', label: 'Статус (open/closed)' },
  { prefix: '-port:', label: 'Исключить (-)' },
];

export const SmartSearchInput: React.FC<SmartSearchInputProps> = ({
  value,
  onChange,
  columns = [],
  systems = [],
  placeholder = 'Поиск: @матрица src:10.194 dst:sber port:443 -udp:53...',
  className = '',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTokens = useMemo(
    () => parseSmartSearchQuery(value, columns).filter((t) => t.target !== 'free_text'),
    [value, columns]
  );

  // Проверяем, вводит ли пользователь сейчас тег @матрица (например "@" или "src:10.194 @kes")
  const atMentionState = useMemo(() => {
    const match = value.match(/(?:^|\s)@([^\s"]*|"[^"]*)$/);
    if (!match) return null;
    const rawSearch = match[1].replace(/^"/, '').toLowerCase();
    const filteredSystems = systems.filter((sys) =>
      sys.name.toLowerCase().includes(rawSearch)
    );
    return {
      rawSearch,
      filteredSystems,
    };
  }, [value, systems]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [atMentionState?.rawSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setShowSyntaxHelp(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyMatrixMention = (systemName: string) => {
    const formattedMention = /\s/.test(systemName)
      ? `@"${systemName}" `
      : `@${systemName} `;
    const nextValue = value.replace(/(?:^|\s)@([^\s"]*|"[^"]*)$/, (full) => {
      const leadingSpace = full.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}${formattedMention}`;
    });
    onChange(nextValue);
    inputRef.current?.focus();
  };

  const insertPrefix = (prefix: string) => {
    const trimmed = value.trimEnd();
    const next = trimmed ? `${trimmed} ${prefix}` : prefix;
    onChange(next);
    inputRef.current?.focus();
  };

  const removeToken = (rawTokenToRemove: string) => {
    const next = value
      .replace(rawTokenToRemove, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (atMentionState && atMentionState.filteredSystems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) =>
          (prev + 1) % atMentionState.filteredSystems.length
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) =>
          (prev - 1 + atMentionState.filteredSystems.length) %
          atMentionState.filteredSystems.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const picked = atMentionState.filteredSystems[highlightedIdx];
        if (picked) {
          e.preventDefault();
          applyMatrixMention(picked.name);
          return;
        }
      }
    }
    if (e.key === 'Escape') {
      setIsFocused(false);
      setShowSyntaxHelp(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative flex-1 min-w-[280px] ${className}`}>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border transition ${
          isFocused
            ? 'border-blue-500/70 ring-2 ring-blue-500/15'
            : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <Search className="w-4 h-4 text-zinc-400 shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onFocus={() => setIsFocused(true)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-mono"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition"
            title="Очистить поиск"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowSyntaxHelp((prev) => !prev)}
          className={`p-1 rounded-lg transition ${
            showSyntaxHelp || activeTokens.length > 0
              ? 'text-blue-400 bg-blue-500/10'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Подсказки синтаксиса поиска"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Чипы активных фильтров */}
      {activeTokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 px-1">
          {activeTokens.map((t, idx) => (
            <span
              key={`${t.raw}_${idx}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                t.negated
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
              }`}
            >
              <span className="text-zinc-400 font-sans">
                {t.negated ? 'Кроме ' : ''}
                {t.fieldLabel}:
              </span>
              <span className="font-semibold">{t.values.join(' | ')}</span>
              <button
                type="button"
                onClick={() => removeToken(t.raw)}
                className="ml-0.5 hover:text-white"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Выпадающие подсказки матриц при вводе @ */}
      {isFocused && atMentionState && (
        <div className="absolute left-0 right-0 top-full mt-2 p-2 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl z-50 space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-blue-400" />
              Выберите матрицу (@)
            </span>
            <span className="font-mono text-zinc-500">↑↓ Enter</span>
          </div>

          {atMentionState.filteredSystems.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">
              Матрицы с именем «{atMentionState.rawSearch}» не найдены
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {atMentionState.filteredSystems.map((sys, idx) => {
                const totalRows = sys.sheets.reduce((acc, s) => acc + s.rows.length, 0);
                const isHighlighted = idx === highlightedIdx;

                return (
                  <button
                    key={sys.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMatrixMention(sys.name);
                    }}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    className={`w-full px-3 py-1.5 rounded-lg text-left text-xs flex items-center justify-between transition ${
                      isHighlighted
                        ? 'bg-blue-600/20 text-blue-200 border border-blue-500/30'
                        : 'text-zinc-200 hover:bg-zinc-800/80 border border-transparent'
                    }`}
                  >
                    <span className="font-mono font-medium">@{sys.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {totalRows} правил
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Панель быстрых фильтров по столбцам (когда не открыт список @матриц) */}
      {(isFocused || showSyntaxHelp) && !atMentionState && (
        <div className="absolute left-0 right-0 top-full mt-2 p-3 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl z-40 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Фильтры по столбцам и матрицам (кликните для вставки)
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              @ = матрица, запятая = ИЛИ, дефис = НЕ
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_HINTS.map((hint) => (
              <button
                key={hint.prefix}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertPrefix(hint.prefix);
                }}
                className="px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left transition group"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-semibold text-blue-400 group-hover:text-blue-300">
                    {hint.prefix}
                  </span>
                  <span className="text-[10px] text-zinc-400">{hint.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

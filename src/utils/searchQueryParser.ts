import type { DetectedColumn, DynamicMatrixRow, NetworkCheckStatus } from '@/types/matrix';

export type FilterFieldTarget =
  | 'source'
  | 'destination'
  | 'port_any'
  | 'port_tcp'
  | 'port_udp'
  | 'role'
  | 'protocol'
  | 'term'
  | 'index'
  | 'status'
  | 'system'
  | 'custom_column'
  | 'free_text';

export interface ParsedSearchToken {
  raw: string;
  target: FilterFieldTarget;
  fieldLabel: string;
  customColumnKey?: string;
  values: string[];
  negated: boolean;
}

const FIELD_ALIASES: Record<string, { target: FilterFieldTarget; label: string }> = {
  src: { target: 'source', label: 'Источник' },
  source: { target: 'source', label: 'Источник' },
  from: { target: 'source', label: 'Источник' },
  ист: { target: 'source', label: 'Источник' },
  источник: { target: 'source', label: 'Источник' },
  откуда: { target: 'source', label: 'Источник' },

  dst: { target: 'destination', label: 'Назначение' },
  dest: { target: 'destination', label: 'Назначение' },
  destination: { target: 'destination', label: 'Назначение' },
  to: { target: 'destination', label: 'Назначение' },
  назн: { target: 'destination', label: 'Назначение' },
  назначение: { target: 'destination', label: 'Назначение' },
  куда: { target: 'destination', label: 'Назначение' },
  цель: { target: 'destination', label: 'Назначение' },

  port: { target: 'port_any', label: 'Порт' },
  ports: { target: 'port_any', label: 'Порт' },
  порт: { target: 'port_any', label: 'Порт' },
  порты: { target: 'port_any', label: 'Порт' },
  tcp: { target: 'port_tcp', label: 'TCP порт' },
  udp: { target: 'port_udp', label: 'UDP порт' },

  role: { target: 'role', label: 'Роль' },
  роль: { target: 'role', label: 'Роль' },

  proto: { target: 'protocol', label: 'Протокол/Сервис' },
  app: { target: 'protocol', label: 'Протокол/Сервис' },
  service: { target: 'protocol', label: 'Протокол/Сервис' },
  протокол: { target: 'protocol', label: 'Протокол/Сервис' },
  приложение: { target: 'protocol', label: 'Протокол/Сервис' },
  сервис: { target: 'protocol', label: 'Протокол/Сервис' },

  term: { target: 'term', label: 'Срок' },
  срок: { target: 'term', label: 'Срок' },

  id: { target: 'index', label: '№ строки' },
  row: { target: 'index', label: '№ строки' },
  строка: { target: 'index', label: '№ строки' },
  номер: { target: 'index', label: '№ строки' },

  status: { target: 'status', label: 'Статус' },
  state: { target: 'status', label: 'Статус' },
  is: { target: 'status', label: 'Статус' },
  статус: { target: 'status', label: 'Статус' },

  sys: { target: 'system', label: 'Матрица' },
  matrix: { target: 'system', label: 'Матрица' },
  sheet: { target: 'system', label: 'Матрица' },
  система: { target: 'system', label: 'Матрица' },
  матрица: { target: 'system', label: 'Матрица' },
};

const STATUS_SYNONYMS: Record<string, NetworkCheckStatus[]> = {
  open: ['accessible'],
  ok: ['accessible'],
  accessible: ['accessible'],
  '1': ['accessible'],
  доступен: ['accessible'],
  открыт: ['accessible'],
  открыто: ['accessible'],

  closed: ['blocked'],
  blocked: ['blocked'],
  fail: ['blocked'],
  '0': ['blocked'],
  закрыт: ['blocked'],
  закрыто: ['blocked'],
  блок: ['blocked'],

  error: ['error'],
  err: ['error'],
  api: ['error'],
  ошибка: ['error'],

  untestable: ['untestable'],
  skip: ['untestable'],
  na: ['untestable'],
  недоступно: ['untestable'],
  пропущено: ['untestable'],

  idle: ['idle'],
  untested: ['idle'],
  непроверено: ['idle'],
  ожидание: ['idle'],
};

function splitRawQueryTokens(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (/\s/.test(ch) && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function stripQuotes(val: string): string {
  return val.replace(/^["']+|["']+$/g, '').trim();
}

export function parseSmartSearchQuery(
  query: string,
  availableColumns: DetectedColumn[] = []
): ParsedSearchToken[] {
  const rawTokens = splitRawQueryTokens(query);
  const parsed: ParsedSearchToken[] = [];

  for (const raw of rawTokens) {
    let working = raw;
    let negated = false;

    if ((working.startsWith('-') || working.startsWith('!')) && working.length > 1) {
      negated = true;
      working = working.slice(1);
    }

    if (working.startsWith('@') && working.length > 1) {
      const val = stripQuotes(working.slice(1)).toLowerCase();
      if (val) {
        parsed.push({
          raw,
          target: 'system',
          fieldLabel: 'Матрица',
          values: val.split(',').map((v) => v.trim()).filter(Boolean),
          negated,
        });
        continue;
      }
    }

    if (working.startsWith('#') && /^#\d+$/.test(working)) {
      parsed.push({
        raw,
        target: 'index',
        fieldLabel: '№ строки',
        values: [working.slice(1)],
        negated,
      });
      continue;
    }

    const colonIdx = working.indexOf(':');
    if (colonIdx > 0) {
      const rawKey = stripQuotes(working.slice(0, colonIdx)).toLowerCase();
      const rawVal = stripQuotes(working.slice(colonIdx + 1)).toLowerCase();

      if (rawVal) {
        const values = rawVal
          .split(',')
          .map((v) => stripQuotes(v))
          .filter(Boolean);

        if (values.length > 0) {
          const alias = FIELD_ALIASES[rawKey];
          if (alias) {
            parsed.push({
              raw,
              target: alias.target,
              fieldLabel: alias.label,
              values,
              negated,
            });
            continue;
          }

          const matchedCol = availableColumns.find(
            (col) =>
              col.headerTitle.toLowerCase().includes(rawKey) ||
              col.key.toLowerCase() === rawKey
          );

          if (matchedCol) {
            parsed.push({
              raw,
              target: 'custom_column',
              fieldLabel: matchedCol.headerTitle,
              customColumnKey: matchedCol.key,
              values,
              negated,
            });
            continue;
          }
        }
      }
    }

    // Одиночный символ "@" без текста (во время набора подсказки) не должен скрывать строки
    if (working === '@') {
      continue;
    }

    const cleanWord = stripQuotes(working).toLowerCase();
    if (cleanWord) {
      parsed.push({
        raw,
        target: 'free_text',
        fieldLabel: 'Текст',
        values: [cleanWord],
        negated,
      });
    }
  }

  return parsed;
}

function matchesPortToken(portCandidate: string, queryVal: string): boolean {
  const cleanCandidate = portCandidate.toLowerCase().trim();
  if (cleanCandidate.includes(queryVal)) return true;

  if (/^\d+$/.test(queryVal)) {
    const queryPortNum = Number(queryVal);
    const rangeMatch = cleanCandidate.match(/(\d+)\s*[–-]\s*(\d+)/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (queryPortNum >= Math.min(start, end) && queryPortNum <= Math.max(start, end)) {
        return true;
      }
    }
  }
  return false;
}

function evaluateSingleTokenOnRow(
  token: ParsedSearchToken,
  row: DynamicMatrixRow,
  columns: DetectedColumn[]
): boolean {
  const matchAnyValue = (pred: (val: string) => boolean) => token.values.some(pred);

  switch (token.target) {
    case 'system': {
      const sysText = `${row.__systemName || ''} ${row.__sheetName || ''}`.toLowerCase();
      return matchAnyValue((v) => sysText.includes(v));
    }

    case 'index': {
      const rowNumStr = String(row.__rowNumber);
      const indexCols = columns
        .filter((c) => c.semanticRole === 'index')
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      return matchAnyValue(
        (v) => rowNumStr === v || indexCols.some((cell) => cell.includes(v))
      );
    }

    case 'status': {
      return matchAnyValue((v) => {
        const mappedStatuses = STATUS_SYNONYMS[v];
        if (mappedStatuses) {
          return mappedStatuses.includes(row.checkStatus);
        }
        return row.checkStatus.toLowerCase().includes(v);
      });
    }

    case 'source': {
      const srcColTexts = columns
        .filter((c) => c.semanticRole === 'source')
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      const metaSources = (row.meta.sources || []).map((s) => s.toLowerCase());
      const haystack = [...srcColTexts, ...metaSources];
      return matchAnyValue((v) => haystack.some((item) => item.includes(v)));
    }

    case 'destination': {
      const dstColTexts = columns
        .filter((c) => c.semanticRole === 'destination')
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      const metaDests = (row.meta.destinations || []).map((d) => d.toLowerCase());
      const haystack = [...dstColTexts, ...metaDests];
      return matchAnyValue((v) => haystack.some((item) => item.includes(v)));
    }

    case 'port_any':
    case 'port_tcp':
    case 'port_udp': {
      const allowedRoles =
        token.target === 'port_tcp'
          ? ['port_tcp', 'port']
          : token.target === 'port_udp'
          ? ['port_udp', 'port']
          : ['port', 'port_tcp', 'port_udp'];

      const portColTexts = columns
        .filter((c) => allowedRoles.includes(c.semanticRole))
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());

      const metaPortItems = (row.meta.ports || [])
        .filter((pg) => {
          if (token.target === 'port_tcp') return pg.protocol === 'TCP';
          if (token.target === 'port_udp') return pg.protocol === 'UDP';
          return true;
        })
        .flatMap((pg) => [pg.raw, ...(pg.list || [])]);

      const allPortCandidates = [...portColTexts, ...metaPortItems];
      return matchAnyValue((v) =>
        allPortCandidates.some((cand) => matchesPortToken(cand, v))
      );
    }

    case 'role':
    case 'protocol':
    case 'term': {
      const roleCols = columns
        .filter((c) => c.semanticRole === token.target)
        .map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      return matchAnyValue((v) => roleCols.some((cell) => cell.includes(v)));
    }

    case 'custom_column': {
      if (!token.customColumnKey) return false;
      const cellVal = String(row.rawValues[token.customColumnKey] ?? '').toLowerCase();
      return matchAnyValue((v) => cellVal.includes(v));
    }

    case 'free_text':
    default: {
      const allCells = columns.map((c) => String(row.rawValues[c.key] ?? '').toLowerCase());
      const metaText = [
        row.__systemName || '',
        row.__sheetName || '',
        row.__sectionTitle || '',
        ...(row.meta.sources || []),
        ...(row.meta.destinations || []),
      ]
        .join(' ')
        .toLowerCase();

      return matchAnyValue(
        (v) => metaText.includes(v) || allCells.some((cell) => cell.includes(v))
      );
    }
  }
}

export function matchRowBySmartQuery(
  row: DynamicMatrixRow,
  columns: DetectedColumn[],
  rawQuery: string
): boolean {
  if (!rawQuery || !rawQuery.trim()) return true;
  const tokens = parseSmartSearchQuery(rawQuery, columns);
  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    const matched = evaluateSingleTokenOnRow(token, row, columns);
    return token.negated ? !matched : matched;
  });
}

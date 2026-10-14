export type NetworkCheckStatus = 
  | 'idle'         // Не проверялось
  | 'checking'     // В процессе опроса
  | 'accessible'   // Все порты доступны
  | 'partial'      // Доступна только часть портов/хостов
  | 'blocked'      // Все порты закрыты / таймаут
  | 'untestable';  // Невозможно проверить (внешний хост)

export interface SocketCheckItem {
  source: string;
  destination: string;
  port: string;
  protocol: 'TCP' | 'UDP';
  status: 'accessible' | 'blocked';
  latencyMs?: number;
}

export interface ParsedNetworkMeta {
  sources: string[];
  destinations: string[];
  ports: {
    list: string[];           // Разбитый массив: ["88", "389", "636"]
    raw: string;
    protocol: 'TCP' | 'UDP';
  }[];
  isTestable: boolean;
  untestableReason?: string;
  direction: 'outbound' | 'inbound' | 'internal';
}

export interface DynamicMatrixRow {
  __id: string;
  __rowNumber: number;
  __sectionTitle?: string;    // Например: "Для серверов" из KES_NEW
  rawValues: Record<string, string | number | null | undefined>;
  meta: ParsedNetworkMeta;
  checkStatus: NetworkCheckStatus;
  socketResults?: SocketCheckItem[];
  checkLog?: string;
  lastCheckedAt?: string;
}

export interface DetectedColumn {
  key: string;
  headerTitle: string;
  semanticRole: 'index' | 'role' | 'source' | 'destination' | 'port_tcp' | 'port_udp' | 'port' | 'protocol' | 'other';
}

export interface ParsedMatrixSheet {
  sheetName: string;
  columns: DetectedColumn[];
  rows: DynamicMatrixRow[];
  portDictionary: Record<string, string>; // Словарь из листа "Расшифровка портов"
  stats: {
    totalRows: number;
    testableRows: number;
  };
}
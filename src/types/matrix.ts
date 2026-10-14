export type NetworkCheckStatus = 
  | 'idle'         // Еще не проверялось
  | 'checking'     // В процессе опроса
  | 'accessible'   // Доступ открыт
  | 'blocked'      // Закрыт / таймаут
  | 'untestable';  // Не подлежит проверке (внешний хост)

export interface ParsedNetworkMeta {
  sources?: string[];
  destinations?: string[];
  ports?: {
    raw: string;
    protocol?: 'TCP' | 'UDP' | 'ANY';
  }[];
  isTestable?: boolean;
  direction?: 'outbound' | 'inbound' | 'internal';
}

export interface DynamicMatrixRow {
  __id: string;
  __rowNumber: number;
  rawValues: Record<string, string | number | null | undefined>;
  meta?: ParsedNetworkMeta;
  checkStatus: NetworkCheckStatus;
  checkLog?: string;
  lastCheckedAt?: string;
}

export interface DetectedColumn {
  key: string;
  headerTitle: string;
  semanticRole?: 'index' | 'role' | 'source' | 'destination' | 'port_tcp' | 'port_udp' | 'port' | 'protocol' | 'other';
  isNetworkCritical?: boolean;
}

export interface ParsedMatrixSheet {
  sheetName: string;
  columns: DetectedColumn[];
  rows: DynamicMatrixRow[];
  stats: {
    totalRows: number;
    testableRows: number;
  };
}
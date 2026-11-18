export type NetworkCheckStatus =
  | 'idle'
  | 'checking'
  | 'accessible'
  | 'blocked'
  | 'untestable'
  | 'error';

export interface SocketCheckItem {
  id: string;
  source: string;
  destination: string;
  port: string;
  protocol: 'TCP' | 'UDP';
  zabbixKey: string;
  lastvalue: '1' | '0';
  lastclock: number;
  status: 'accessible' | 'blocked' | 'untestable';
}

export interface ParsedPortGroup {
  raw: string;
  list: string[];
  protocol: 'TCP' | 'UDP';
}

export interface ParsedNetworkMeta {
  sources: string[];
  destinations: string[];
  ports: ParsedPortGroup[];
  isTestable: boolean;
  untestableReason?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
}

export interface DetectedColumn {
  key: string;
  headerTitle: string;
  semanticRole:
    | 'index'
    | 'protocol'
    | 'term'
    | 'source'
    | 'destination'
    | 'port_tcp'
    | 'port_udp'
    | 'port'
    | 'role'
    | 'other';
}

export interface DynamicMatrixRow {
  __id: string;
  __rowNumber: number;
  __sectionTitle?: string;
  __systemId?: string;
  __systemName?: string;
  __sheetName?: string;
  rawValues: Record<string, any>;
  meta: ParsedNetworkMeta;
  checkStatus: NetworkCheckStatus;
  socketResults?: SocketCheckItem[];
  checkLog?: string;
  errorMessage?: string;
  lastCheckedAt?: string;
}

export interface ParsedMatrixSheet {
  sheetName: string;
  columns: DetectedColumn[];
  rows: DynamicMatrixRow[];
  portDictionary: Record<string, string>;
  stats: {
    totalRows: number;
    testableRows: number;
  };
}

export interface SavedMatrixSystem {
  id: string;
  name: string;
  updatedAt: string;
  sheets: ParsedMatrixSheet[];
}

export interface MatrixViewGroup {
  groupId: string;
  systemName: string;
  sheetName: string;
  columns: DetectedColumn[];
  portDictionary: Record<string, string>;
  rows: DynamicMatrixRow[];
}

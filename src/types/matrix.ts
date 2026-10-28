export type NetworkCheckStatus =
  | 'idle'
  | 'checking'
  | 'accessible'
  | 'blocked'
  | 'untestable';

export interface SocketCheckItem {
  id: string;
  source: string;
  destination: string;
  port: string;
  protocol: 'TCP' | 'UDP';
  zabbixKey: string;
  lastvalue: '1' | '0';
  lastclock: number;
  status: 'accessible' | 'blocked';
}

export interface ParsedNetworkMeta {
  sources: string[];
  destinations: string[];
  ports: {
    list: string[];
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
  __sectionTitle?: string;
  __systemId?: string;
  __systemName?: string;
  __sheetName?: string;

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
  semanticRole:
    | 'index'
    | 'role'
    | 'source'
    | 'destination'
    | 'port_tcp'
    | 'port_udp'
    | 'port'
    | 'protocol'
    | 'term'
    | 'other';
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
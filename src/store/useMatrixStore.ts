import { create } from 'zustand';
import type { ParsedMatrixSheet } from '../types/matrix';
import { simulateNetworkCheck } from '../services/networkTester';

interface MatrixState {
  sheets: ParsedMatrixSheet[];
  activeSheetIndex: number;
  selectedRowId: string | null;
  searchQuery: string;
  statusFilter: string;
  isBatchChecking: boolean;

  setSheets: (sheets: ParsedMatrixSheet[]) => void;
  setActiveSheetIndex: (idx: number) => void;
  setSelectedRowId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  
  checkSingleRow: (rowId: string) => Promise<void>;
  checkAllTestableRows: () => Promise<void>;
}

export const useMatrixStore = create<MatrixState>((set, get) => ({
  sheets: [],
  activeSheetIndex: 0,
  selectedRowId: null,
  searchQuery: '',
  statusFilter: 'all',
  isBatchChecking: false,

  setSheets: (sheets) => set({ sheets, activeSheetIndex: 0, selectedRowId: null }),
  setActiveSheetIndex: (idx) => set({ activeSheetIndex: idx, selectedRowId: null }),
  setSelectedRowId: (selectedRowId) => set({ selectedRowId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  checkSingleRow: async (rowId: string) => {
    const { sheets, activeSheetIndex } = get();
    const currentSheet = sheets[activeSheetIndex];
    if (!currentSheet) return;

    const row = currentSheet.rows.find(r => r.__id === rowId);
    if (!row || !row.meta.isTestable) return;

    set(state => ({
      sheets: state.sheets.map((s, idx) => idx !== state.activeSheetIndex ? s : {
        ...s,
        rows: s.rows.map(r => r.__id === rowId ? { ...r, checkStatus: 'checking' } : r)
      })
    }));

    const result = await simulateNetworkCheck(row);

    set(state => ({
      sheets: state.sheets.map((s, idx) => idx !== state.activeSheetIndex ? s : {
        ...s,
        rows: s.rows.map(r => r.__id === rowId ? {
          ...r,
          checkStatus: result.status,
          socketResults: result.socketResults,
          checkLog: result.log,
          lastCheckedAt: new Date().toLocaleTimeString(),
        } : r)
      })
    }));
  },

  checkAllTestableRows: async () => {
    const { sheets, activeSheetIndex, checkSingleRow } = get();
    const currentSheet = sheets[activeSheetIndex];
    if (!currentSheet) return;

    set({ isBatchChecking: true });
    const testable = currentSheet.rows.filter(r => r.meta.isTestable);

    for (let i = 0; i < testable.length; i += 4) {
      const batch = testable.slice(i, i + 4);
      await Promise.all(batch.map(r => checkSingleRow(r.__id)));
    }
    set({ isBatchChecking: false });
  }
}));
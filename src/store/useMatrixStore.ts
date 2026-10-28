import { create } from 'zustand';
import type { ParsedMatrixSheet, DynamicMatrixRow } from '@/types/matrix';

interface MatrixUiState {
  activeSystemId: string;
  draftName: string;
  draftSheets: ParsedMatrixSheet[];
  activeSheetIndex: number;
  selectedRowId: string | null;
  searchQuery: string;
  statusFilter: string;

  setDraftMatrix: (fileName: string, sheets: ParsedMatrixSheet[]) => void;
  updateDraftRow: (rowId: string, updater: (r: DynamicMatrixRow) => DynamicMatrixRow) => void;
  clearDraft: () => void;
  selectSystem: (id: string) => void;
  setActiveSheetIndex: (idx: number) => void;
  setSelectedRowId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
}

export const useMatrixStore = create<MatrixUiState>((set) => ({
  activeSystemId: 'ALL',
  draftName: '',
  draftSheets: [],
  activeSheetIndex: 0,
  selectedRowId: null,
  searchQuery: '',
  statusFilter: 'all',

  setDraftMatrix: (fileName, sheets) => {
    const cleanName =
      fileName
        .replace(/\.xlsx?$/i, '')
        .replace(/^Матрица доступа\s*[-–]?\s*/i, '')
        .trim() || fileName;

    const enriched = sheets.map((sh) => ({
      ...sh,
      rows: sh.rows.map((r) => ({
        ...r,
        __id: `draft_${sh.sheetName}_${r.__rowNumber}`,
        __systemId: 'DRAFT',
        __systemName: cleanName,
        __sheetName: sh.sheetName,
      })),
    }));

    set({
      draftName: cleanName,
      draftSheets: enriched,
      activeSystemId: 'DRAFT',
      activeSheetIndex: 0,
      selectedRowId: null,
    });
  },

  updateDraftRow: (rowId, updater) =>
    set((state) => ({
      draftSheets: state.draftSheets.map((sh) => ({
        ...sh,
        rows: sh.rows.map((r) => (r.__id === rowId ? updater(r) : r)),
      })),
    })),

  clearDraft: () => set({ draftName: '', draftSheets: [] }),

  selectSystem: (id) =>
    set({
      activeSystemId: id,
      activeSheetIndex: 0,
      selectedRowId: null,
    }),

  setActiveSheetIndex: (idx) => set({ activeSheetIndex: idx, selectedRowId: null }),
  setSelectedRowId: (selectedRowId) => set({ selectedRowId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
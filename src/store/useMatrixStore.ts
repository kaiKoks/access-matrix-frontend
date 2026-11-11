import { create } from 'zustand';
import type {
  ParsedMatrixSheet,
  DynamicMatrixRow,
  DetectedColumn,
  NetworkCheckStatus,
} from '@/types/matrix';
import {
  createBlankMatrixSheet,
  recomputeRowMeta,
  detectColumnSemanticRole,
} from '@/services/excelParser';

function resolveRowStatus(
  currentStatus: NetworkCheckStatus,
  isTestable: boolean
): NetworkCheckStatus {
  if (!isTestable) return 'untestable';
  return currentStatus === 'untestable' ? 'idle' : currentStatus;
}

interface MatrixUiState {
  activeSystemId: string;
  draftName: string;
  draftSheets: ParsedMatrixSheet[];
  activeSheetIndex: number;
  selectedRowId: string | null;
  searchQuery: string;
  columnFilter: string;
  statusFilter: string;
  isEditMode: boolean;
  hasUnsavedChanges: boolean;
  uiError: string | null;

  setDraftMatrix: (fileName: string, sheets: ParsedMatrixSheet[]) => void;
  createNewEmptyMatrix: (name?: string) => void;
  updateDraftRow: (rowId: string, updater: (r: DynamicMatrixRow) => DynamicMatrixRow) => void;
  addDraftRow: (sheetName?: string, sectionTitle?: string) => void;
  deleteDraftRow: (rowId: string) => void;
  addDraftColumn: (headerTitle: string) => void;
  deleteDraftColumn: (colKey: string) => void;
  renameDraftColumn: (colKey: string, newTitle: string) => void;
  setDraftName: (name: string) => void;
  clearDraft: () => void;
  selectSystem: (id: string) => void;
  setActiveSheetIndex: (idx: number) => void;
  setSelectedRowId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setColumnFilter: (colKey: string) => void;
  setStatusFilter: (filter: string) => void;
  setIsEditMode: (edit: boolean) => void;
  setHasUnsavedChanges: (val: boolean) => void;
  setUiError: (err: string | null) => void;
}

export const useMatrixStore = create<MatrixUiState>((set) => ({
  activeSystemId: 'ALL',
  draftName: '',
  draftSheets: [],
  activeSheetIndex: 0,
  selectedRowId: null,
  searchQuery: '',
  columnFilter: 'ALL',
  statusFilter: 'all',
  isEditMode: false,
  hasUnsavedChanges: false,
  uiError: null,

  setDraftMatrix: (fileName, sheets) => {
    const cleanName =
      fileName
        .replace(/\.xlsx?$/i, '')
        .replace(/^Матрица доступа\s*[-–]?\s*/i, '')
        .trim() || fileName;

    const enriched = sheets
      .filter((sh) => Array.isArray(sh.rows) && sh.rows.length > 0)
      .map((sh): ParsedMatrixSheet => ({
        ...sh,
        rows: sh.rows.map((r, idx): DynamicMatrixRow => ({
          ...r,
          __id: `draft_${sh.sheetName}_${r.__rowNumber || idx + 1}`,
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
      columnFilter: 'ALL',
      hasUnsavedChanges: true,
      uiError: null,
    });
  },

  createNewEmptyMatrix: (name = 'Новая матрица') => {
    const blankSheet = createBlankMatrixSheet('Основной');
    blankSheet.rows = blankSheet.rows.map((r): DynamicMatrixRow => ({
      ...r,
      __systemName: name,
    }));

    set({
      draftName: name,
      draftSheets: [blankSheet],
      activeSystemId: 'DRAFT',
      activeSheetIndex: 0,
      selectedRowId: null,
      columnFilter: 'ALL',
      isEditMode: true,
      hasUnsavedChanges: true,
      uiError: null,
    });
  },

  setDraftName: (draftName) =>
    set((state) => ({
      draftName,
      draftSheets: state.draftSheets.map((sh): ParsedMatrixSheet => ({
        ...sh,
        rows: sh.rows.map((r): DynamicMatrixRow => ({ ...r, __systemName: draftName })),
      })),
    })),

  updateDraftRow: (rowId, updater) =>
    set((state) => ({
      hasUnsavedChanges: true,
      draftSheets: state.draftSheets.map((sh): ParsedMatrixSheet => ({
        ...sh,
        rows: sh.rows.map((r): DynamicMatrixRow => (r.__id === rowId ? updater(r) : r)),
      })),
    })),

  addDraftRow: (targetSheetName, sectionTitle) =>
    set((state) => {
      const sheetIdx = targetSheetName
        ? state.draftSheets.findIndex((s) => s.sheetName === targetSheetName)
        : state.activeSheetIndex;
      const validIdx = sheetIdx >= 0 ? sheetIdx : 0;

      const nextSheets = state.draftSheets.map((sh, idx): ParsedMatrixSheet => {
        if (idx !== validIdx) return sh;
        const nextNum = sh.rows.length + 1;
        const emptyValues: Record<string, string> = {};
        sh.columns.forEach((c) => {
          emptyValues[c.key] = '';
        });

        const meta = recomputeRowMeta(emptyValues, sh.columns);
        const newRow: DynamicMatrixRow = {
          __id: `draft_${sh.sheetName}_${nextNum}_${Date.now()}`,
          __rowNumber: nextNum,
          __sectionTitle: sectionTitle,
          __systemId: 'DRAFT',
          __systemName: state.draftName || 'Новая матрица',
          __sheetName: sh.sheetName,
          rawValues: emptyValues,
          meta,
          checkStatus: meta.isTestable ? 'idle' : 'untestable',
        };

        return {
          ...sh,
          rows: [...sh.rows, newRow],
        };
      });

      return { draftSheets: nextSheets, hasUnsavedChanges: true };
    }),

  deleteDraftRow: (rowId) =>
    set((state) => ({
      hasUnsavedChanges: true,
      selectedRowId: state.selectedRowId === rowId ? null : state.selectedRowId,
      draftSheets: state.draftSheets.map((sh): ParsedMatrixSheet => {
        const filtered = sh.rows
          .filter((r) => r.__id !== rowId)
          .map((r, i): DynamicMatrixRow => ({ ...r, __rowNumber: i + 1 }));
        return { ...sh, rows: filtered };
      }),
    })),

  addDraftColumn: (headerTitle) =>
    set((state) => {
      const cleanTitle = headerTitle.trim();
      if (!cleanTitle) return state;

      const nextSheets = state.draftSheets.map((sh, idx): ParsedMatrixSheet => {
        if (idx !== state.activeSheetIndex) return sh;
        const newColKey = `col_${Date.now()}`;
        const newCol: DetectedColumn = {
          key: newColKey,
          headerTitle: cleanTitle,
          semanticRole: detectColumnSemanticRole(cleanTitle),
        };
        const updatedCols = [...sh.columns, newCol];
        const updatedRows = sh.rows.map((r): DynamicMatrixRow => {
          const nextRaw = { ...r.rawValues, [newColKey]: '' };
          const nextMeta = recomputeRowMeta(nextRaw, updatedCols);
          return {
            ...r,
            rawValues: nextRaw,
            meta: nextMeta,
            checkStatus: resolveRowStatus(r.checkStatus, nextMeta.isTestable),
          };
        });
        return { ...sh, columns: updatedCols, rows: updatedRows };
      });

      return { draftSheets: nextSheets, hasUnsavedChanges: true };
    }),

  deleteDraftColumn: (colKey) =>
    set((state) => {
      const nextSheets = state.draftSheets.map((sh, idx): ParsedMatrixSheet => {
        if (idx !== state.activeSheetIndex || sh.columns.length <= 1) return sh;
        const updatedCols = sh.columns.filter((c) => c.key !== colKey);
        const updatedRows = sh.rows.map((r): DynamicMatrixRow => {
          const nextRaw = { ...r.rawValues };
          delete nextRaw[colKey];
          const nextMeta = recomputeRowMeta(nextRaw, updatedCols);
          return {
            ...r,
            rawValues: nextRaw,
            meta: nextMeta,
            checkStatus: resolveRowStatus(r.checkStatus, nextMeta.isTestable),
          };
        });
        return { ...sh, columns: updatedCols, rows: updatedRows };
      });

      return { draftSheets: nextSheets, hasUnsavedChanges: true };
    }),

  renameDraftColumn: (colKey, newTitle) =>
    set((state) => {
      const cleanTitle = newTitle.trim();
      if (!cleanTitle) return state;

      const nextSheets = state.draftSheets.map((sh, idx): ParsedMatrixSheet => {
        if (idx !== state.activeSheetIndex) return sh;
        const updatedCols = sh.columns.map((c): DetectedColumn =>
          c.key === colKey
            ? {
                ...c,
                headerTitle: cleanTitle,
                semanticRole: detectColumnSemanticRole(cleanTitle),
              }
            : c
        );
        const updatedRows = sh.rows.map((r): DynamicMatrixRow => {
          const nextMeta = recomputeRowMeta(r.rawValues, updatedCols);
          return {
            ...r,
            meta: nextMeta,
            checkStatus: resolveRowStatus(r.checkStatus, nextMeta.isTestable),
          };
        });
        return { ...sh, columns: updatedCols, rows: updatedRows };
      });

      return { draftSheets: nextSheets, hasUnsavedChanges: true };
    }),

  clearDraft: () => set({ draftName: '', draftSheets: [], hasUnsavedChanges: false }),

  selectSystem: (id) =>
    set({
      activeSystemId: id,
      activeSheetIndex: 0,
      selectedRowId: null,
      columnFilter: 'ALL',
      hasUnsavedChanges: false,
      uiError: null,
    }),

  setActiveSheetIndex: (idx) => set({ activeSheetIndex: idx, selectedRowId: null }),
  setSelectedRowId: (selectedRowId) => set({ selectedRowId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setColumnFilter: (columnFilter) => set({ columnFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setIsEditMode: (isEditMode) => set({ isEditMode }),
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  setUiError: (uiError) => set({ uiError }),
}));
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCatalogFromBackend,
  saveSystemToBackend,
  deleteSystemFromBackend,
  checkRuleOnBackend,
} from '@/services/networkTester';
import { recomputeRowMeta, detectColumnSemanticRole } from '@/services/excelParser';
import { useMatrixStore } from '@/store/useMatrixStore';
import type {
  DynamicMatrixRow,
  ParsedMatrixSheet,
  SavedMatrixSystem,
  DetectedColumn,
  NetworkCheckStatus,
} from '@/types/matrix';

export const CATALOG_QUERY_KEY = ['matrix-catalog'] as const;

function resolveRowStatus(
  currentStatus: NetworkCheckStatus,
  isTestable: boolean
): NetworkCheckStatus {
  if (!isTestable) return 'untestable';
  return currentStatus === 'untestable' ? 'idle' : currentStatus;
}

export function useCatalogQuery() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: fetchCatalogFromBackend,
    retry: 1,
  });
}

export function useSaveSystemMutation() {
  const queryClient = useQueryClient();
  const selectSystem = useMatrixStore((s) => s.selectSystem);
  const clearDraft = useMatrixStore((s) => s.clearDraft);
  const setUiError = useMatrixStore((s) => s.setUiError);
  const setHasUnsavedChanges = useMatrixStore((s) => s.setHasUnsavedChanges);

  return useMutation({
    mutationFn: async ({ name, sheets }: { name: string; sheets: ParsedMatrixSheet[] }) => {
      setUiError(null);
      return await saveSystemToBackend(name, sheets);
    },
    onSuccess: (savedSystem: SavedMatrixSystem) => {
      queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old = []) => {
        const filtered = old.filter(
          (c) =>
            c.id !== savedSystem.id &&
            c.name.toLowerCase() !== savedSystem.name.toLowerCase()
        );
        return [...filtered, savedSystem];
      });
      clearDraft();
      setHasUnsavedChanges(false);
      selectSystem(savedSystem.id);
    },
    onError: (err: Error) => {
      setUiError(err.message);
    },
  });
}

export function useDeleteSystemMutation() {
  const queryClient = useQueryClient();
  const selectSystem = useMatrixStore((s) => s.selectSystem);
  const setUiError = useMatrixStore((s) => s.setUiError);

  return useMutation({
    mutationFn: async (id: string) => {
      setUiError(null);
      await deleteSystemFromBackend(id);
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old = []) =>
        old.filter((sys) => sys.id !== deletedId)
      );
      selectSystem('ALL');
    },
    onError: (err: Error) => {
      setUiError(err.message);
    },
  });
}

export function updateRowAcrossState(
  queryClient: ReturnType<typeof useQueryClient>,
  rowId: string,
  updater: (row: DynamicMatrixRow, columns: DetectedColumn[]) => DynamicMatrixRow
) {
  const store = useMatrixStore.getState();

  store.draftSheets.forEach((sh) => {
    if (sh.rows.some((r) => r.__id === rowId)) {
      store.updateDraftRow(rowId, (r) => updater(r, sh.columns));
    }
  });

  queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
    if (!old) return old;
    return old.map((sys) => ({
      ...sys,
      sheets: sys.sheets.map((sh) => ({
        ...sh,
        rows: sh.rows.map((r): DynamicMatrixRow =>
          r.__id === rowId ? updater(r, sh.columns) : r
        ),
      })),
    }));
  });
}

export function useMatrixEditorActions() {
  const queryClient = useQueryClient();
  const store = useMatrixStore();

  const updateCellValue = (rowId: string, colKey: string, value: string) => {
    store.setHasUnsavedChanges(true);
    updateRowAcrossState(queryClient, rowId, (row, columns): DynamicMatrixRow => {
      const nextRaw = { ...row.rawValues, [colKey]: value };
      const nextMeta = recomputeRowMeta(nextRaw, columns);
      return {
        ...row,
        rawValues: nextRaw,
        meta: nextMeta,
        checkStatus: resolveRowStatus(row.checkStatus, nextMeta.isTestable),
      };
    });
  };

  const addRowToGroup = (systemId: string | undefined, sheetName: string) => {
    if (!systemId || systemId === 'DRAFT' || store.activeSystemId === 'DRAFT') {
      store.addDraftRow(sheetName);
      return;
    }

    store.setHasUnsavedChanges(true);
    queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((sys): SavedMatrixSystem => {
        if (sys.id !== systemId && sys.name !== systemId) return sys;
        return {
          ...sys,
          sheets: sys.sheets.map((sh): ParsedMatrixSheet => {
            if (sh.sheetName !== sheetName) return sh;
            const nextNum = sh.rows.length + 1;
            const emptyValues: Record<string, string> = {};
            sh.columns.forEach((c) => {
              emptyValues[c.key] = '';
            });
            const meta = recomputeRowMeta(emptyValues, sh.columns);
            const newRow: DynamicMatrixRow = {
              __id: `${sys.id}_${sh.sheetName}_${nextNum}_${Date.now()}`,
              __rowNumber: nextNum,
              __systemId: sys.id,
              __systemName: sys.name,
              __sheetName: sh.sheetName,
              rawValues: emptyValues,
              meta,
              checkStatus: meta.isTestable ? 'idle' : 'untestable',
            };
            return { ...sh, rows: [...sh.rows, newRow] };
          }),
        };
      });
    });
  };

  const deleteRowFromGroup = (rowId: string) => {
    store.deleteDraftRow(rowId);
    store.setHasUnsavedChanges(true);

    queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((sys): SavedMatrixSystem => ({
        ...sys,
        sheets: sys.sheets.map((sh): ParsedMatrixSheet => ({
          ...sh,
          rows: sh.rows
            .filter((r) => r.__id !== rowId)
            .map((r, idx): DynamicMatrixRow => ({ ...r, __rowNumber: idx + 1 })),
        })),
      }));
    });
  };

  const addColumnToGroup = (
    systemId: string | undefined,
    sheetName: string,
    headerTitle: string
  ) => {
    const cleanTitle = headerTitle.trim();
    if (!cleanTitle) return;

    if (!systemId || systemId === 'DRAFT' || store.activeSystemId === 'DRAFT') {
      store.addDraftColumn(cleanTitle);
      return;
    }

    store.setHasUnsavedChanges(true);
    queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((sys): SavedMatrixSystem => {
        if (sys.id !== systemId && sys.name !== systemId) return sys;
        return {
          ...sys,
          sheets: sys.sheets.map((sh): ParsedMatrixSheet => {
            if (sh.sheetName !== sheetName) return sh;
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
          }),
        };
      });
    });
  };

  const deleteColumnFromGroup = (
    systemId: string | undefined,
    sheetName: string,
    colKey: string
  ) => {
    if (!systemId || systemId === 'DRAFT' || store.activeSystemId === 'DRAFT') {
      store.deleteDraftColumn(colKey);
      return;
    }

    store.setHasUnsavedChanges(true);
    queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((sys): SavedMatrixSystem => {
        if (sys.id !== systemId && sys.name !== systemId) return sys;
        return {
          ...sys,
          sheets: sys.sheets.map((sh): ParsedMatrixSheet => {
            if (sh.sheetName !== sheetName || sh.columns.length <= 1) return sh;
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
          }),
        };
      });
    });
  };

  const renameColumnInGroup = (
    systemId: string | undefined,
    sheetName: string,
    colKey: string,
    newTitle: string
  ) => {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;

    if (!systemId || systemId === 'DRAFT' || store.activeSystemId === 'DRAFT') {
      store.renameDraftColumn(colKey, cleanTitle);
      return;
    }

    store.setHasUnsavedChanges(true);
    queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((sys): SavedMatrixSystem => {
        if (sys.id !== systemId && sys.name !== systemId) return sys;
        return {
          ...sys,
          sheets: sys.sheets.map((sh): ParsedMatrixSheet => {
            if (sh.sheetName !== sheetName) return sh;
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
          }),
        };
      });
    });
  };

  return {
    updateCellValue,
    addRowToGroup,
    deleteRowFromGroup,
    addColumnToGroup,
    deleteColumnFromGroup,
    renameColumnInGroup,
  };
}

export function useCheckRowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: DynamicMatrixRow) => {
      useMatrixStore.getState().setUiError(null);

      updateRowAcrossState(queryClient, row.__id, (r): DynamicMatrixRow => ({
        ...r,
        checkStatus: 'checking',
        errorMessage: undefined,
      }));

      try {
        const result = await checkRuleOnBackend(row);
        const checkedAt = result.checkedAt || new Date().toLocaleTimeString();

        updateRowAcrossState(queryClient, row.__id, (r): DynamicMatrixRow => ({
          ...r,
          checkStatus: result.status,
          socketResults: result.socketResults,
          checkLog: result.log,
          errorMessage: undefined,
          lastCheckedAt: checkedAt,
        }));

        return result;
      } catch (err: any) {
        const errorMsg = err?.message || 'Неизвестная ошибка при проверке правила';
        const checkedAt = new Date().toLocaleTimeString();

        updateRowAcrossState(queryClient, row.__id, (r): DynamicMatrixRow => ({
          ...r,
          checkStatus: 'error',
          socketResults: [],
          errorMessage: errorMsg,
          checkLog: `[${checkedAt}] ОШИБКА ВЫПОЛНЕНИЯ ЗАПРОСА\n${errorMsg}`,
          lastCheckedAt: checkedAt,
        }));

        useMatrixStore.getState().setUiError(errorMsg);
        throw err;
      }
    },
  });
}

export function useCheckBatchMutation() {
  const { mutateAsync: checkSingleRow } = useCheckRowMutation();

  return useMutation({
    mutationFn: async (rows: DynamicMatrixRow[]) => {
      const testable = rows.filter((r) => r.meta.isTestable);
      for (let i = 0; i < testable.length; i += 4) {
        const batch = testable.slice(i, i + 4);
        await Promise.allSettled(batch.map((r) => checkSingleRow(r)));
      }
    },
  });
}
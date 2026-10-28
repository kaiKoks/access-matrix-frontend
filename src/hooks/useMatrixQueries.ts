import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCatalogFromBackend,
  saveSystemToBackend,
  deleteSystemFromBackend,
  simulateNetworkCheck,
} from '@/services/networkTester';
import { useMatrixStore } from '@/store/useMatrixStore';
import type { DynamicMatrixRow, ParsedMatrixSheet, SavedMatrixSystem } from '@/types/matrix';

export const CATALOG_QUERY_KEY = ['matrix-catalog'] as const;

export function useCatalogQuery() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: fetchCatalogFromBackend,
  });
}

// Сохранение открытой матрицы на бэкенд по кнопке "Сохранить на бэк"
export function useSaveSystemMutation() {
  const queryClient = useQueryClient();
  const selectSystem = useMatrixStore((s) => s.selectSystem);
  const clearDraft = useMatrixStore((s) => s.clearDraft);

  return useMutation({
    mutationFn: async ({ name, sheets }: { name: string; sheets: ParsedMatrixSheet[] }) => {
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
      selectSystem(savedSystem.id);
    },
  });
}

export function useDeleteSystemMutation() {
  const queryClient = useQueryClient();
  const selectSystem = useMatrixStore((s) => s.selectSystem);

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteSystemFromBackend(id);
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old = []) =>
        old.filter((sys) => sys.id !== deletedId)
      );
      selectSystem('ALL');
    },
  });
}

function updateRowAcrossState(
  queryClient: ReturnType<typeof useQueryClient>,
  rowId: string,
  updater: (row: DynamicMatrixRow) => DynamicMatrixRow
) {
  // 1. Обновляем в локально открытой матрице (если не сохранена на бэк)
  useMatrixStore.getState().updateDraftRow(rowId, updater);

  // 2. Обновляем в кэше каталога TanStack Query
  queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old) => {
    if (!old) return old;
    return old.map((sys) => ({
      ...sys,
      sheets: sys.sheets.map((sh) => ({
        ...sh,
        rows: sh.rows.map((r) => (r.__id === rowId ? updater(r) : r)),
      })),
    }));
  });
}

export function useCheckRowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: DynamicMatrixRow) => {
      updateRowAcrossState(queryClient, row.__id, (r) => ({
        ...r,
        checkStatus: 'checking',
      }));

      const result = await simulateNetworkCheck(row);
      const checkedAt = result.checkedAt || new Date().toLocaleTimeString();

      updateRowAcrossState(queryClient, row.__id, (r) => ({
        ...r,
        checkStatus: result.status,
        socketResults: result.socketResults,
        checkLog: result.log,
        lastCheckedAt: checkedAt,
      }));

      return result;
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
        await Promise.all(batch.map((r) => checkSingleRow(r)));
      }
    },
  });
}
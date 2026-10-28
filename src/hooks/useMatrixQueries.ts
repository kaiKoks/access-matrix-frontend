import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCatalogFromBackend,
  saveSystemToBackend,
  simulateNetworkCheck,
} from '@/services/networkTester';
import { useMatrixStore } from '@/store/useMatrixStore';
import type { DynamicMatrixRow, ParsedMatrixSheet, SavedMatrixSystem } from '@/types/matrix';

export const CATALOG_QUERY_KEY = ['matrix-catalog'] as const;

// 1. Запрос каталога сохраненных матриц
export function useCatalogQuery() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: async () => {
      const systems = await fetchCatalogFromBackend();
      return systems.map((sys) => ({
        ...sys,
        sheets: sys.sheets.map((sh) => ({
          ...sh,
          rows: sh.rows.map((r) => ({
            ...r,
            __id: r.__id.startsWith(sys.id) ? r.__id : `${sys.id}_${sh.sheetName}_${r.__rowNumber}`,
            __systemId: sys.id,
            __systemName: sys.name,
            __sheetName: sh.sheetName,
          })),
        })),
      }));
    },
  });
}

// 2. Мутация сохранения новой матрицы на бэкенд
export function useSaveSystemMutation() {
  const queryClient = useQueryClient();
  const selectSystem = useMatrixStore((s) => s.selectSystem);
  const clearDraft = useMatrixStore((s) => s.clearDraft);

  return useMutation({
    mutationFn: async ({ name, sheets }: { name: string; sheets: ParsedMatrixSheet[] }) => {
      return await saveSystemToBackend(name, sheets);
    },
    onSuccess: (savedSystem: SavedMatrixSystem) => {
      const normalizedSaved: SavedMatrixSystem = {
        ...savedSystem,
        sheets: savedSystem.sheets.map((sh) => ({
          ...sh,
          rows: sh.rows.map((r) => ({
            ...r,
            __id: `${savedSystem.id}_${sh.sheetName}_${r.__rowNumber}`,
            __systemId: savedSystem.id,
            __systemName: savedSystem.name,
            __sheetName: sh.sheetName,
          })),
        })),
      };

      queryClient.setQueryData<SavedMatrixSystem[]>(CATALOG_QUERY_KEY, (old = []) => {
        const exists = old.some((c) => c.id === normalizedSaved.id);
        return exists
          ? old.map((c) => (c.id === normalizedSaved.id ? normalizedSaved : c))
          : [...old, normalizedSaved];
      });

      clearDraft();
      selectSystem(normalizedSaved.id);
    },
  });
}

// Вспомогательная функция обновления строки в кэше React Query и в черновике Zustand
function updateRowAcrossState(
  queryClient: ReturnType<typeof useQueryClient>,
  rowId: string,
  updater: (row: DynamicMatrixRow) => DynamicMatrixRow
) {
  // Обновляем в черновике (если проверяется несохраненный файл)
  useMatrixStore.getState().updateDraftRow(rowId, updater);

  // Обновляем в кэше каталога TanStack Query
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

// 3. Мутация проверки одной строки
export function useCheckRowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: DynamicMatrixRow) => {
      updateRowAcrossState(queryClient, row.__id, (r) => ({
        ...r,
        checkStatus: 'checking',
      }));

      const result = await simulateNetworkCheck(row);
      const checkedAt = new Date().toLocaleTimeString();

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

// 4. Мутация пакетной проверки списка строк
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
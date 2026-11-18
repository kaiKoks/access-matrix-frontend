import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMatrixStore } from '@/store/useMatrixStore';
import { useCatalogQuery, useCheckRowMutation } from '@/hooks/useMatrixQueries';
import { matchRowBySmartQuery } from '@/utils/searchQueryParser';
import { parseExcelFileToSheets } from '@/utils/excelWorkbookParser';
import {
  saveSystemToBackend,
  deleteSystemFromBackend,
} from '@/services/networkTester';
import type { StatusFilterOption } from '@/components/MatrixToolbar';
import type {
  DetectedColumn,
  DynamicMatrixRow,
  MatrixViewGroup,
  ParsedMatrixSheet,
} from '@/types/matrix';

export function useMatrixWorkspace() {
  const queryClient = useQueryClient();
  const { data: catalog = [], isLoading: isCatalogLoading } = useCatalogQuery();
  const checkRowMutation = useCheckRowMutation();

  const {
    activeSystemId,
    setActiveSystemId,
    draftName,
    setDraftName,
    draftSheets,
    loadDraft,
    clearDraft,
    selectedRowId,
    setSelectedRowId,
    isEditorOpen,
    editorMode,
    openEditor,
    closeEditor,
  } = useMatrixStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('all');
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const visibleGroups: MatrixViewGroup[] = useMemo(() => {
    if (activeSystemId === 'DRAFT' && draftSheets.length > 0) {
      const displaySystemName = draftName.trim() || 'Черновик';
      return draftSheets.map((sheet, idx) => ({
        groupId: `DRAFT_${idx}_${sheet.sheetName}`,
        systemName: displaySystemName,
        sheetName: sheet.sheetName,
        columns: sheet.columns,
        portDictionary: sheet.portDictionary,
        rows: sheet.rows.map((r) => ({
          ...r,
          __systemId: 'DRAFT',
          __systemName: displaySystemName,
          __sheetName: sheet.sheetName,
        })),
      }));
    }

    const targetSystems =
      activeSystemId === 'ALL'
        ? catalog
        : catalog.filter((sys) => sys.id === activeSystemId);

    const groups: MatrixViewGroup[] = [];
    for (const sys of targetSystems) {
      for (const sheet of sys.sheets) {
        groups.push({
          groupId: `${sys.id}_${sheet.sheetName}`,
          systemName: sys.name,
          sheetName: sheet.sheetName,
          columns: sheet.columns,
          portDictionary: sheet.portDictionary,
          rows: sheet.rows.map((r) => ({
            ...r,
            __systemId: sys.id,
            __systemName: sys.name,
            __sheetName: sheet.sheetName,
          })),
        });
      }
    }
    return groups;
  }, [activeSystemId, draftName, draftSheets, catalog]);

  const activeColumns: DetectedColumn[] = useMemo(() => {
    const map = new Map<string, DetectedColumn>();
    for (const group of visibleGroups) {
      for (const col of group.columns) {
        if (!map.has(col.headerTitle)) {
          map.set(col.headerTitle, col);
        }
      }
    }
    return Array.from(map.values());
  }, [visibleGroups]);

  const hasActiveFilter = statusFilter !== 'all' || searchQuery.trim().length > 0;

  const filteredGroups: MatrixViewGroup[] = useMemo(() => {
    const mapped = visibleGroups.map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (statusFilter !== 'all' && row.checkStatus !== statusFilter) {
          return false;
        }
        return matchRowBySmartQuery(row, group.columns, searchQuery);
      }),
    }));

    // Если фильтры не заданы, не скрываем недавно открытую или пустую матрицу
    if (!hasActiveFilter) {
      return mapped;
    }

    return mapped.filter((group) => group.rows.length > 0);
  }, [visibleGroups, searchQuery, statusFilter, hasActiveFilter]);

  const totalRowsCount = useMemo(
    () => visibleGroups.reduce((acc, g) => acc + g.rows.length, 0),
    [visibleGroups]
  );

  const filteredRowsCount = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.rows.length, 0),
    [filteredGroups]
  );

  // Открытие .xlsx файла загружает его как черновик (DRAFT), а сохранение выполняется по кнопке
  const openExcelPicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsedSheets = await parseExcelFileToSheets(file);
        const defaultName = file.name.replace(/\.xlsx?$/i, '');
        setSearchQuery('');
        setStatusFilter('all');
        loadDraft(defaultName, parsedSheets);
      } catch (err: any) {
        alert(`Ошибка чтения файла Excel: ${err?.message || err}`);
      }
    };
    input.click();
  };

  // Сохранение открытого черновика по кнопке «Сохранить матрицу»
  const saveCurrentDraftToCatalog = async () => {
    if (draftSheets.length === 0 || isSavingDraft) return;
    const finalName = draftName.trim() || 'Новая_матрица';

    setIsSavingDraft(true);
    try {
      const saved = await saveSystemToBackend(finalName, draftSheets);
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      clearDraft();
      setActiveSystemId(saved.id);
    } catch (err: any) {
      alert(`Ошибка сохранения матрицы: ${err?.message || err}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Сохранение из модального окна создания/редактирования
  const saveFromEditorModal = async (name: string, sheets: ParsedMatrixSheet[]) => {
    if (editorMode === 'edit' && activeSystemId !== 'ALL' && activeSystemId !== 'DRAFT') {
      await deleteSystemFromBackend(activeSystemId);
    }
    const saved = await saveSystemToBackend(name, sheets);
    await queryClient.invalidateQueries({ queryKey: ['catalog'] });
    if (activeSystemId === 'DRAFT') {
      clearDraft();
    }
    setActiveSystemId(saved.id);
  };

  const deleteActiveMatrix = async () => {
    if (activeSystemId === 'DRAFT') {
      clearDraft();
      return;
    }
    if (activeSystemId === 'ALL') return;

    const current = catalog.find((s) => s.id === activeSystemId);
    if (!current || !window.confirm(`Удалить матрицу «${current.name}»?`)) return;

    await deleteSystemFromBackend(current.id);
    await queryClient.invalidateQueries({ queryKey: ['catalog'] });
    setActiveSystemId('ALL');
  };

  const currentEditableTarget = useMemo(() => {
    if (activeSystemId === 'DRAFT') {
      return { name: draftName || 'Черновик', sheets: draftSheets };
    }
    const found = catalog.find((s) => s.id === activeSystemId);
    return found ? { name: found.name, sheets: found.sheets } : { name: '', sheets: [] };
  }, [activeSystemId, draftName, draftSheets, catalog]);

  const runSingleCheck = (row: DynamicMatrixRow) => {
    checkRowMutation.mutate(row);
  };

  const runBulkCheck = async () => {
    const rowsToTest = filteredGroups.flatMap((g) => g.rows.filter((r) => r.meta.isTestable));
    if (rowsToTest.length === 0 || isBulkChecking) return;

    setIsBulkChecking(true);
    try {
      for (const row of rowsToTest) {
        try {
          await checkRowMutation.mutateAsync(row);
        } catch {
          // Ошибка фиксируется в самой строке
        }
      }
    } finally {
      setIsBulkChecking(false);
    }
  };

  return {
    catalog,
    isCatalogLoading,
    activeSystemId,
    setActiveSystemId,
    draftName,
    setDraftName,
    draftSheets,
    clearDraft,
    selectedRowId,
    setSelectedRowId,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    activeColumns,
    filteredGroups,
    totalRowsCount,
    filteredRowsCount,
    isBulkChecking,
    isSavingDraft,
    isEditorOpen,
    editorMode,
    currentEditableTarget,
    openExcelPicker,
    saveCurrentDraftToCatalog,
    openCreateModal: () => openEditor('create'),
    openEditModal: () => openEditor('edit'),
    closeEditor,
    saveFromEditorModal,
    deleteActiveMatrix,
    runSingleCheck,
    runBulkCheck,
  };
}

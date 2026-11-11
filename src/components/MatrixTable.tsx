import React, { useState, useRef, useEffect } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import {
  useCatalogQuery,
  useCheckRowMutation,
  useMatrixEditorActions,
} from '@/hooks/useMatrixQueries';
import type { DetectedColumn, MatrixViewGroup } from '@/types/matrix';
import { StatusBadge } from '@/components/StatusBadge';
import { PortCell } from '@/components/PortCell';
import { EndpointCell } from '@/components/EndpointCell';
import { buildVisibleMatrixGroups } from '@/components/Toolbar';
import {
  Play,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Hand,
  Check,
  X,
} from 'lucide-react';

interface SortConfig {
  groupId: string;
  key: string;
  direction: 'asc' | 'desc';
}

function isColumnCentered(col: DetectedColumn): boolean {
  return (
    col.semanticRole === 'index' ||
    col.semanticRole === 'protocol' ||
    col.semanticRole === 'term' ||
    col.semanticRole === 'port' ||
    col.semanticRole === 'port_tcp' ||
    col.semanticRole === 'port_udp'
  );
}

// Контейнер таблицы с поддержкой Grab (Drag-to-Scroll) и верхним синхронизированным скроллом
const GrabScrollTable: React.FC<{
  children: React.ReactNode;
  onDragStateChange?: (moved: boolean) => void;
}> = ({ children, onDragStateChange }) => {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [isGrabbing, setIsGrabbing] = useState(false);

  const isSyncingLeft = useRef(false);
  const dragInfo = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    moved: false,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const tableEl = container.querySelector('table');
      if (tableEl) {
        setScrollWidth(tableEl.scrollWidth);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    const tableEl = container.querySelector('table');
    if (tableEl) observer.observe(tableEl);

    return () => observer.disconnect();
  }, [children]);

  const handleTopScroll = () => {
    if (!topScrollRef.current || !containerRef.current) return;
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    isSyncingLeft.current = true;
    containerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };

  const handleBottomScroll = () => {
    if (!topScrollRef.current || !containerRef.current) return;
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    isSyncingLeft.current = true;
    topScrollRef.current.scrollLeft = containerRef.current.scrollLeft;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, button, a')) return;

    const container = containerRef.current;
    if (!container) return;

    dragInfo.current = {
      isDown: true,
      startX: e.pageX - container.offsetLeft,
      startY: e.pageY - container.offsetTop,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false,
    };
    onDragStateChange?.(false);
    setIsGrabbing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragInfo.current.isDown || !containerRef.current) return;

    const container = containerRef.current;
    const x = e.pageX - container.offsetLeft;
    const y = e.pageY - container.offsetTop;
    const walkX = x - dragInfo.current.startX;
    const walkY = y - dragInfo.current.startY;

    if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
      dragInfo.current.moved = true;
      onDragStateChange?.(true);
    }

    if (dragInfo.current.moved) {
      e.preventDefault();
      container.scrollLeft = dragInfo.current.scrollLeft - walkX;
      container.scrollTop = dragInfo.current.scrollTop - walkY;
    }
  };

  const stopDragging = () => {
    if (dragInfo.current.isDown) {
      dragInfo.current.isDown = false;
      setIsGrabbing(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto overflow-y-hidden border-b border-zinc-800/80 bg-zinc-950/60"
      >
      </div>

      <div
        ref={containerRef}
        onScroll={handleBottomScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        className={`overflow-auto max-h-[calc(100vh-175px)] ${
          isGrabbing ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export const MatrixTable: React.FC = () => {
  const {
    data: catalog = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCatalogQuery();
  const checkRowMutation = useCheckRowMutation();
  const {
    updateCellValue,
    addRowToGroup,
    deleteRowFromGroup,
    addColumnToGroup,
    deleteColumnFromGroup,
    renameColumnInGroup,
  } = useMatrixEditorActions();

  const {
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    columnFilter,
    statusFilter,
    selectedRowId,
    isEditMode,
    setSelectedRowId,
    setIsEditMode,
    createNewEmptyMatrix,
  } = useMatrixStore();

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Состояние для превращения кнопки "+ Столбец" в поле ввода
  const [addingColGroupId, setAddingColGroupId] = useState<string | null>(null);
  const [newColTitle, setNewColTitle] = useState('');

  // Состояние для переименования существующего столбца
  const [renamingCol, setRenamingCol] = useState<{
    groupId: string;
    colKey: string;
    title: string;
  } | null>(null);

  const wasDraggedRef = useRef(false);

  const visibleGroups = buildVisibleMatrixGroups({
    catalog,
    activeSystemId,
    draftName,
    draftSheets,
    activeSheetIndex,
    searchQuery,
    columnFilter,
    statusFilter,
  });

  const handleSort = (groupId: string, key: string) => {
    setSortConfig((prev) => {
      if (prev?.groupId === groupId && prev.key === key) {
        return prev.direction === 'asc' ? { groupId, key, direction: 'desc' } : null;
      }
      return { groupId, key, direction: 'asc' };
    });
  };

  const submitNewColumn = (systemId: string | undefined, sheetName: string) => {
    if (newColTitle.trim()) {
      addColumnToGroup(systemId, sheetName, newColTitle);
    }
    setNewColTitle('');
    setAddingColGroupId(null);
  };

  const submitRenameColumn = (
    systemId: string | undefined,
    sheetName: string,
    colKey: string
  ) => {
    if (renamingCol && renamingCol.title.trim()) {
      renameColumnInGroup(systemId, sheetName, colKey, renamingCol.title);
    }
    setRenamingCol(null);
  };

  if (isError && activeSystemId !== 'DRAFT') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <div className="max-w-md bg-zinc-900 border border-rose-500/30 rounded-xl p-6 space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Ошибка подключения к серверу бэкенда
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {(error as Error)?.message || 'Сервер http://localhost:3000 не отвечает.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Повторить
            </button>
            <button
              onClick={() => createNewEmptyMatrix('Локальная матрица')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
            >
              Создать матрицу локально
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && activeSystemId !== 'DRAFT') {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
        Загрузка каталога матриц с сервера...
      </div>
    );
  }

  if (visibleGroups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-12 space-y-3">
        <p className="text-sm text-zinc-300">
          Нет отображаемых правил (каталог пуст или не найдено совпадений по фильтру)
        </p>
        <button
          onClick={() => createNewEmptyMatrix('Новая матрица')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Создать и заполнить матрицу с нуля
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">
      {visibleGroups.map((group: MatrixViewGroup) => {
        const sortedRows =
          sortConfig && sortConfig.groupId === group.groupId
            ? [...group.rows].sort((a, b) => {
                const aVal = String(a.rawValues[sortConfig.key] ?? '');
                const bVal = String(b.rawValues[sortConfig.key] ?? '');
                const cmp = aVal.localeCompare(bVal, 'ru', { numeric: true });
                return sortConfig.direction === 'asc' ? cmp : -cmp;
              })
            : group.rows;

        const groupSystemId =
          activeSystemId === 'DRAFT'
            ? 'DRAFT'
            : sortedRows[0]?.__systemId || activeSystemId;

        const totalTableCols = group.columns.length + 3 + (isEditMode ? 1 : 0);

        return (
          <div
            key={group.groupId}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl shadow-sm overflow-hidden flex flex-col"
          >
            {/* Чистая шапка карточки матрицы */}
            <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-zinc-100">{group.systemName}</span>
                <span className="text-xs text-zinc-500">/ {group.sheetName}</span>

              </div>

            </div>

            <GrabScrollTable
              onDragStateChange={(moved) => {
                wasDraggedRef.current = moved;
              }}
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-900 sticky top-0 z-20 border-b border-zinc-800 text-zinc-400 font-medium shadow-sm">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">№</th>
                    <th className="py-3 px-4 w-40 text-center">Статус доступа</th>
                    {group.columns.map((col) => {
                      const isSorted =
                        sortConfig?.groupId === group.groupId && sortConfig.key === col.key;
                      const centered = isColumnCentered(col);
                      const isRenamingThis =
                        renamingCol?.groupId === group.groupId &&
                        renamingCol?.colKey === col.key;

                      return (
                        <th
                          key={col.key}
                          className={`py-2.5 px-4 whitespace-nowrap group ${
                            centered ? 'text-center' : 'text-left'
                          }`}
                        >
                          {isEditMode ? (
                            <div className="inline-flex items-center gap-1.5 bg-zinc-950/70 border border-zinc-800 rounded-md px-2 py-1">
                              {isRenamingThis ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={renamingCol.title}
                                  onChange={(e) =>
                                    setRenamingCol({
                                      ...renamingCol,
                                      title: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      submitRenameColumn(
                                        groupSystemId,
                                        group.sheetName,
                                        col.key
                                      );
                                    } else if (e.key === 'Escape') {
                                      setRenamingCol(null);
                                    }
                                  }}
                                  onBlur={() =>
                                    submitRenameColumn(
                                      groupSystemId,
                                      group.sheetName,
                                      col.key
                                    )
                                  }
                                  className="bg-transparent text-xs text-zinc-100 focus:outline-none w-32"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRenamingCol({
                                      groupId: group.groupId,
                                      colKey: col.key,
                                      title: col.headerTitle,
                                    })
                                  }
                                  title="Нажмите, чтобы переименовать столбец"
                                  className="text-zinc-200 hover:text-blue-400 transition font-medium"
                                >
                                  {col.headerTitle}
                                </button>
                              )}

                              {group.columns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteColumnFromGroup(
                                      groupSystemId,
                                      group.sheetName,
                                      col.key
                                    )
                                  }
                                  title={`Удалить столбец «${col.headerTitle}»`}
                                  className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSort(group.groupId, col.key)}
                              className={`inline-flex items-center gap-1.5 hover:text-zinc-200 transition font-medium ${
                                centered ? 'justify-center mx-auto' : 'text-left'
                              }`}
                            >
                              <span>{col.headerTitle}</span>
                              {isSorted ? (
                                sortConfig.direction === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                ) : (
                                  <ArrowDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />
                              )}
                            </button>
                          )}
                        </th>
                      );
                    })}

                    {/* Интерактивная ячейка "+ Столбец", превращающаяся в поле ввода при клике */}
                    {isEditMode && (
                      <th className="py-2 px-3 whitespace-nowrap w-44 align-middle">
                        {addingColGroupId === group.groupId ? (
                          <div className="inline-flex items-center gap-1 bg-zinc-950 border border-blue-500 rounded-md px-2 py-1">
                            <input
                              type="text"
                              autoFocus
                              value={newColTitle}
                              onChange={(e) => setNewColTitle(e.target.value)}
                              placeholder="Название столбца..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  submitNewColumn(groupSystemId, group.sheetName);
                                } else if (e.key === 'Escape') {
                                  setAddingColGroupId(null);
                                  setNewColTitle('');
                                }
                              }}
                              className="bg-transparent text-xs text-zinc-100 focus:outline-none w-32 font-normal"
                            />
                            <button
                              type="button"
                              onClick={() => submitNewColumn(groupSystemId, group.sheetName)}
                              className="p-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded"
                              title="Добавить (Enter)"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingColGroupId(null);
                                setNewColTitle('');
                              }}
                              className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded"
                              title="Отмена (Esc)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingColGroupId(group.groupId);
                              setNewColTitle('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-zinc-700 hover:border-blue-500/60 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/5 text-xs font-normal transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Столбец</span>
                          </button>
                        )}
                      </th>
                    )}

                    <th className="py-3 px-4 w-24 text-center">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  {sortedRows.map((row, index) => {
                    const isSelected = row.__id === selectedRowId;
                    const prevSection =
                      index > 0 ? sortedRows[index - 1].__sectionTitle : undefined;
                    const showSectionBanner =
                      row.__sectionTitle && row.__sectionTitle !== prevSection;

                    return (
                      <React.Fragment key={row.__id}>
                        {showSectionBanner && (
                          <tr className="bg-zinc-800/70 border-y border-zinc-700/60">
                            <td
                              colSpan={totalTableCols}
                              className="py-2 px-4 font-semibold text-zinc-200 tracking-wide uppercase text-[11px] text-center"
                            >
                              {row.__sectionTitle}
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => {
                            if (wasDraggedRef.current) return;
                            setSelectedRowId(row.__id);
                          }}
                          onDoubleClick={() => setIsEditMode(true)}
                          className={`transition ${
                            isSelected ? 'bg-blue-950/30' : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-4 text-center font-mono text-zinc-500 align-middle">
                            {row.__rowNumber}
                          </td>
                          <td className="py-2.5 px-4 text-center align-middle">
                            <StatusBadge
                              status={row.checkStatus}
                              reason={row.meta.untestableReason}
                              errorMessage={row.errorMessage}
                              socketResults={row.socketResults}
                            />
                          </td>
                          {group.columns.map((col) => {
                            const val = row.rawValues[col.key];
                            const isEndpoint =
                              col.semanticRole === 'source' ||
                              col.semanticRole === 'destination';
                            const isPort =
                              col.semanticRole === 'port_tcp' ||
                              col.semanticRole === 'port_udp' ||
                              col.semanticRole === 'port';
                            const centered = isColumnCentered(col);

                            return (
                              <td
                                key={col.key}
                                className={`py-2.5 px-3 min-w-35 max-w-md align-middle ${
                                  centered ? 'text-center' : 'text-left'
                                }`}
                              >
                                {isEditMode ? (
                                  <input
                                    type="text"
                                    value={String(val ?? '')}
                                    onChange={(e) =>
                                      updateCellValue(row.__id, col.key, e.target.value)
                                    }
                                    placeholder={col.headerTitle}
                                    className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-700/80 rounded text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                                  />
                                ) : isEndpoint ? (
                                  <EndpointCell value={val} />
                                ) : isPort ? (
                                  <PortCell
                                    value={val}
                                    isTcp={col.semanticRole === 'port_tcp'}
                                    isUdp={col.semanticRole === 'port_udp'}
                                    dictionary={group.portDictionary}
                                  />
                                ) : (
                                  <span className="leading-relaxed">{String(val ?? '—')}</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Пустая ячейка под кнопкой "+ Столбец" в режиме редактирования */}
                          {isEditMode && <td className="py-2.5 px-3" />}

                          <td
                            className="py-2.5 px-4 text-center align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                disabled={
                                  !row.meta.isTestable || row.checkStatus === 'checking'
                                }
                                onClick={() => checkRowMutation.mutate(row)}
                                title={
                                  row.meta.untestableReason || 'Проверить доступность правила'
                                }
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white transition disabled:opacity-20 disabled:pointer-events-none"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>

                              {isEditMode && (
                                <button
                                  onClick={() => deleteRowFromGroup(row.__id)}
                                  title="Удалить строку"
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Нижняя строка добавления нового правила (в стиле Notion / Linear) */}
                  <tr className="bg-zinc-950/40 hover:bg-zinc-800/50 transition">
                    <td colSpan={totalTableCols} className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          addRowToGroup(groupSystemId, group.sheetName);
                          if (!isEditMode) setIsEditMode(true);
                        }}
                        className="w-full py-2.5 px-4 flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 font-medium transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Добавить правило доступа</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrabScrollTable>
          </div>
        );
      })}
    </div>
  );
};
import { create } from "zustand"
import type { ParsedMatrixSheet, DynamicMatrixRow } from "@/types/matrix"
import { simulateNetworkCheck } from "@/services/networkTester"
interface MatrixState {
  sheets: ParsedMatrixSheet[]
  activeSheetIndex: number
  selectedRow: DynamicMatrixRow | null
  searchQuery: string
  statusFilter: string
  isBatchChecking: boolean

  setSheets: (sheets: ParsedMatrixSheet[]) => void
  setActiveSheetIndex: (idx: number) => void
  setSelectedRow: (row: DynamicMatrixRow | null) => void
  setSearchQuery: (query: string) => void
  setStatusFilter: (filter: string) => void

  checkSingleRow: (rowId: string) => Promise<void>
  checkAllTestableRows: () => Promise<void>
}
export const useMatrixStore = create<MatrixState>((set, get) => ({
  sheets: [],
  activeSheetIndex: 0,
  selectedRow: null,
  searchQuery: "",
  statusFilter: "all",
  isBatchChecking: false,

  setSheets: (sheets) => set({ sheets, activeSheetIndex: 0 }),
  setActiveSheetIndex: (idx) =>
    set({ activeSheetIndex: idx, selectedRow: null }),
  setSelectedRow: (row) => set({ selectedRow: row }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  checkSingleRow: async (rowId: string) => {
    const { sheets, activeSheetIndex } = get()
    const currentSheet = sheets[activeSheetIndex]
    if (!currentSheet) return

    const row = currentSheet.rows.find((r) => r.__id === rowId)
    if (!row || !row.meta?.isTestable) return

    // Устанавливаем статус проверки
    set({
      sheets: sheets.map((s, sIdx) =>
        sIdx !== activeSheetIndex ? s : (
          {
            ...s,
            rows: s.rows.map((r) =>
              r.__id === rowId ? { ...r, checkStatus: "checking" } : r,
            ),
          }
        ),
      ),
    })

    const result = await simulateNetworkCheck(row)

    // Сохраняем результат
    set((state) => {
      const updatedSheets = state.sheets.map((s, sIdx) =>
        sIdx !== state.activeSheetIndex ?
          s
        : {
            ...s,
            rows: s.rows.map((r) =>
              r.__id === rowId ?
                {
                  ...r,
                  checkStatus: result.status,
                  checkLog: result.log,
                  lastCheckedAt: new Date().toLocaleTimeString(),
                }
              : r,
            ),
          },
      )
      return {
        sheets: updatedSheets,
        selectedRow:
          state.selectedRow?.__id === rowId ?
            {
              ...state.selectedRow,
              checkStatus: result.status,
              checkLog: result.log,
              lastCheckedAt: new Date().toLocaleTimeString(),
            }
          : state.selectedRow,
      }
    })
  },

  checkAllTestableRows: async () => {
    const { sheets, activeSheetIndex, checkSingleRow } = get()
    const currentSheet = sheets[activeSheetIndex]
    if (!currentSheet) return

    set({ isBatchChecking: true })
    const testable = currentSheet.rows.filter((r) => r.meta?.isTestable)

    // Пакетная проверка (пачками по 3)
    for (let i = 0; i < testable.length; i += 3) {
      const batch = testable.slice(i, i + 3)
      await Promise.all(batch.map((r) => checkSingleRow(r.__id)))
    }
    set({ isBatchChecking: false })
  },
}))

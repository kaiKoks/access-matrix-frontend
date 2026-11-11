import * as XLSX from "xlsx"
import type {
  DynamicMatrixRow,
  ParsedMatrixSheet,
  SocketCheckItem,
  NetworkCheckStatus,
  SavedMatrixSystem,
  MatrixViewGroup,
} from "@/types/matrix"

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api"

export type CheckerMode = "mock" | "zabbix"

export interface RowCheckSummary {
  status: NetworkCheckStatus
  socketResults: SocketCheckItem[]
  log: string
  checkedAt?: string
}

async function extractBackendError(
  res: Response,
  fallbackMsg: string,
): Promise<string> {
  try {
    const data = await res.json()
    if (data?.message) {
      return Array.isArray(data.message) ?
          data.message.join("; ")
        : String(data.message)
    }
  } catch {
    // ignore JSON parse error
  }
  return `${fallbackMsg} (HTTP ${res.status})`
}

function extractCleanHost(rawEndpoint: string): string {
  let cleaned = rawEndpoint.trim()
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).hostname
    } catch {
      // ignore
    }
  }
  const cidrMatch = cleaned.match(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\/\d{1,2}$/,
  )
  if (cidrMatch) {
    const lastOctet = parseInt(cidrMatch[2], 10)
    return `${cidrMatch[1]}.${lastOctet === 0 ? 1 : lastOctet}`
  }
  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/")[0].trim()
  }
  if (cleaned.includes("-")) {
    const firstIp = cleaned.split("-")[0].trim()
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(firstIp)) {
      return firstIp
    }
  }
  return cleaned.replace(/\.$/, "")
}

function expandPortList(token: string): string[] {
  const clean = token.replace(/^(tcp|udp)\//i, "").trim()
  const rangeMatch = clean.match(/^(\d+)\s*[–-]\s*(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    const diff = end - start
    if (diff > 0 && diff <= 5) {
      return Array.from({ length: diff + 1 }, (_, i) => String(start + i))
    }
    return [clean]
  }
  return /^\d+$/.test(clean) ? [clean] : []
}

export function buildAllSocketCombinations(
  row: DynamicMatrixRow,
): Omit<SocketCheckItem, "lastvalue" | "lastclock" | "status">[] {
  const sources = row.meta.sources.length ? row.meta.sources : ["LocalHost"]
  const destinations =
    row.meta.destinations.length ? row.meta.destinations : ["Unknown"]
  const combinations: Omit<
    SocketCheckItem,
    "lastvalue" | "lastclock" | "status"
  >[] = []

  for (const src of sources) {
    for (const dst of destinations) {
      const cleanDest = extractCleanHost(dst)
      for (const portGroup of row.meta.ports) {
        for (const rawPortToken of portGroup.list) {
          const expandedPorts = expandPortList(rawPortToken)
          for (const port of expandedPorts) {
            const zabbixKey =
              portGroup.protocol === "UDP" ?
                `custom.udp.check[${cleanDest},${port}]`
              : `net.tcp.port[${cleanDest},${port}]`

            combinations.push({
              id: `${src}->${dst}:${port}/${portGroup.protocol}`,
              source: src,
              destination: dst,
              port,
              protocol: portGroup.protocol,
              zabbixKey,
            })
          }
        }
      }
    }
  }

  return combinations
}

export async function checkRuleOnBackend(
  row: DynamicMatrixRow,
): Promise<RowCheckSummary> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/checker/test-rule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: row.meta.sources,
        destinations: row.meta.destinations,
        ports: row.meta.ports,
      }),
    })
  } catch {
    throw new Error(
      "Сервер бэкенда недоступен (проверьте, запущен ли NestJS на порту 3000)",
    )
  }

  if (!response.ok) {
    const errMsg = await extractBackendError(
      response,
      "Ошибка при проверке правила",
    )
    throw new Error(errMsg)
  }

  return await response.json()
}

export async function fetchCatalogFromBackend(): Promise<SavedMatrixSystem[]> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/catalog`)
  } catch {
    throw new Error(
      "Не удалось подключиться к бэкенду (http://localhost:3000/api/catalog)",
    )
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(
      res,
      "Ошибка загрузки каталога матриц",
    )
    throw new Error(errMsg)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function saveSystemToBackend(
  name: string,
  sheets: ParsedMatrixSheet[],
): Promise<SavedMatrixSystem> {
  const cleanName = (name || "Матрица").trim()

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName, sheets }),
    })
  } catch {
    throw new Error("Не удалось сохранить матрицу: сервер бэкенда недоступен")
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(
      res,
      "Ошибка при сохранении матрицы",
    )
    throw new Error(errMsg)
  }

  return await res.json()
}

export async function deleteSystemFromBackend(id: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/catalog/${id}`, { method: "DELETE" })
  } catch {
    throw new Error("Не удалось удалить матрицу: сервер бэкенда недоступен")
  }

  if (!res.ok) {
    const errMsg = await extractBackendError(res, "Ошибка при удалении матрицы")
    throw new Error(errMsg)
  }
}

// Экспортирует отфильтрованную таблицу (все видимые группы и строки с учетом активных фильтров)
export function exportFilteredGroupsToExcel(
  groups: MatrixViewGroup[],
  fileNamePrefix = "Отчет_Матрица",
) {
  if (groups.length === 0) return

  const wb = XLSX.utils.book_new()
  const usedSheetNames = new Set<string>()

  groups.forEach((group, idx) => {
    const exportRows = group.rows.map((row) => {
      const total = row.socketResults?.length || 0
      const open =
        row.socketResults?.filter((s) => s.status === "accessible").length || 0

      const obj: Record<string, any> = {
        "Матрица (ИС)": row.__systemName || group.systemName,
        "№": row.__rowNumber,
        Раздел: row.__sectionTitle || "Основной",
        "Статус доступности":
          row.checkStatus === "accessible" ? `Доступен (${open}/${total})`
          : row.checkStatus === "blocked" ? `Закрыт (0/${total})`
          : row.checkStatus === "error" ?
            `Ошибка (${row.errorMessage || "Сбой запроса"})`
          : row.checkStatus === "untestable" ? "Недоступно для проверки"
          : "Не проверен",
        "Время проверки": row.lastCheckedAt || "—",
      }

      group.columns.forEach((col) => {
        obj[col.headerTitle] = row.rawValues[col.key] ?? ""
      })

      return obj
    })

    const ws = XLSX.utils.json_to_sheet(exportRows)

    let baseName =
      groups.length > 1 ?
        `${group.systemName}_${group.sheetName}`
      : group.sheetName || "Матрица"
    baseName = baseName.replace(/[\\/?*[\]:]/g, "_").slice(0, 28)
    let finalSheetName = baseName || `Лист_${idx + 1}`
    if (usedSheetNames.has(finalSheetName)) {
      finalSheetName = `${baseName.slice(0, 25)}_${idx + 1}`
    }
    usedSheetNames.add(finalSheetName)

    XLSX.utils.book_append_sheet(wb, ws, finalSheetName)
  })

  const safePrefix =
    fileNamePrefix.replace(/[\\/?*[\]:]/g, "_").trim() || "Отчет"
  XLSX.writeFile(
    wb,
    `${safePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
}

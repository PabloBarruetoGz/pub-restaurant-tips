import React, { useState, useMemo } from 'react'
import {
  Coins,
  Users,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  RotateCcw,
  Lock,
  ChevronLeft,
  ChevronRight,
  Ban,
  ArrowRight,
  Search,
} from 'lucide-react'
import {
  positions,
  type Position,
  tipPercentages,
  type Collaborator,
  type Shift,
  type DailyTip,
  type TipAssignment,
  currency,
  type RoleId,
  today,
} from '../domain'
import { apiFetch } from '../api'

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function previousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 2, 1).toISOString().slice(0, 7)
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 1).toISOString().slice(0, 7)
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

// Helper for formatting short date (e.g. "01 sept 2026")
function formatShortDate(date: string) {
  if (!date) return ''
  const d = new Date(`${date}T12:00:00`)
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

// Helper for full date format (e.g. "Martes 01 de Septiembre de 2026")
function formatFullDate(date: string) {
  if (!date) return ''
  const d = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'long' }).format(d)
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(d)
  const dayNum = d.getDate().toString().padStart(2, '0')
  const year = d.getFullYear()
  return `${capitalizedWeekday} ${dayNum} de ${monthName} de ${year}`
}

// Helper for day & short month format (e.g. capWeekday: "Lun", dayNum: "01", monthShort: "sept")
function formatDayMonthShort(date: string) {
  const d = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'short' }).format(d).replace('.', '')
  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const dayNum = d.getDate().toString().padStart(2, '0')
  const monthShort = new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(d).replace('.', '')
  return { capWeekday, dayNum, monthShort }
}

// Helper to segment a month into 7-day calendar weeks starting on Monday
interface ShiftWeekDay {
  date: string
  inMonth: boolean
}

function monthWeekSegments(month: string) {
  const firstDay = new Date(`${month}-01T12:00:00`)
  const lastDay = new Date(`${monthEnd(month)}T12:00:00`)
  const start = new Date(firstDay)
  const firstDayOfWeek = firstDay.getDay() || 7
  start.setDate(firstDay.getDate() - firstDayOfWeek + 1)
  const end = new Date(lastDay)
  const lastDayOfWeek = lastDay.getDay() || 7
  end.setDate(lastDay.getDate() + 7 - lastDayOfWeek)

  const cells: ShiftWeekDay[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    cells.push({ date, inMonth: date.startsWith(month) })
    cursor.setDate(cursor.getDate() + 1)
  }

  const segments = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  )

  return segments.map((daysInWeek, index) => {
    const monthDays = daysInWeek.filter((day) => day.inMonth)
    return {
      index,
      name: `Semana ${index + 1}`,
      start: monthDays[0]?.date || daysInWeek[0].date,
      end: monthDays[monthDays.length - 1]?.date || daysInWeek[daysInWeek.length - 1].date,
      dates: daysInWeek.map((day) => day.date),
      days: daysInWeek,
    }
  })
}

// Helper to check if a date has a loaded tip
function hasLoadedTip(date: string, dailyTips: DailyTip[]): boolean {
  return dailyTips.some((tip) => tip.date === date)
}

// Helper to find the first week and day with a loaded tip in a given month
function findFirstLoadedWeekAndDay(
  month: string,
  dailyTips: DailyTip[],
): { weekIndex: number; date: string } {
  const weeks = monthWeekSegments(month)
  for (let wIndex = 0; wIndex < weeks.length; wIndex++) {
    const week = weeks[wIndex]
    for (const day of week.days) {
      if (day.inMonth && hasLoadedTip(day.date, dailyTips)) {
        return { weekIndex: wIndex, date: day.date }
      }
    }
  }
  return { weekIndex: 0, date: '' }
}

// Helper to find the first day with a loaded tip in a given week segment
function findFirstLoadedDayInWeek(
  week: ReturnType<typeof monthWeekSegments>[number] | undefined,
  dailyTips: DailyTip[],
): string {
  if (!week) return ''
  for (const day of week.days) {
    if (day.inMonth && hasLoadedTip(day.date, dailyTips)) {
      return day.date
    }
  }
  return ''
}


interface TipAllocatorModuleProps {
  collaborators: Collaborator[]
  shifts: Shift[]
  dailyTips: DailyTip[]
  assignments: TipAssignment[]
  setAssignments: React.Dispatch<React.SetStateAction<TipAssignment[]>>
  setMessage: (msg: string) => void
  setToastMessage: (msg: string) => void
  activeMenuRole: RoleId
  can: (roleId: RoleId, action: string) => boolean
  setActiveMenu: (menu: RoleId | 'project' | 'incidents') => void
  initialDate?: string
}

type AssignmentResponse = {
  assignments: TipAssignment[]
}

export function TipAllocatorModule({
  collaborators,
  shifts,
  dailyTips,
  assignments,
  setAssignments,
  setMessage,
  setToastMessage,
  activeMenuRole,
  can,
  setActiveMenu,
  initialDate,
}: TipAllocatorModuleProps) {
  // Calculate initial selection with automatic Month -> First Loaded Week -> First Loaded Day logic
  const initialSelection = useMemo(() => {
    let startMonth = today.slice(0, 7)
    if (initialDate) {
      startMonth = initialDate.slice(0, 7)
    } else if (dailyTips.length > 0) {
      const sortedTips = [...dailyTips].sort((a, b) => b.date.localeCompare(a.date))
      startMonth = sortedTips[0].date.slice(0, 7)
    }

    if (initialDate && hasLoadedTip(initialDate, dailyTips)) {
      const weeks = monthWeekSegments(startMonth)
      const wIdx = weeks.findIndex((w) => w.dates.includes(initialDate))
      return {
        month: startMonth,
        weekIndex: wIdx >= 0 ? wIdx : 0,
        date: initialDate,
      }
    }

    const sel = findFirstLoadedWeekAndDay(startMonth, dailyTips)
    return {
      month: startMonth,
      weekIndex: sel.weekIndex,
      date: sel.date,
    }
  }, [dailyTips, initialDate])

  // Date selection states: Month, Week Index, Selected Date
  const [allocatorMonth, setAllocatorMonth] = useState<string>(() => initialSelection.month)
  const [allocatorWeekIndex, setAllocatorWeekIndex] = useState<number>(() => initialSelection.weekIndex)
  const [selectedDate, setSelectedDate] = useState<string>(() => initialSelection.date)

  // Handlers for month and week selection preserving automatic selection rules
  const handleMonthChange = (newMonth: string) => {
    setAllocatorMonth(newMonth)
    const selection = findFirstLoadedWeekAndDay(newMonth, dailyTips)
    setAllocatorWeekIndex(selection.weekIndex)
    setSelectedDate(selection.date)
    setAssignmentConfirmed(false)
  }

  const handleWeekSelect = (wIndex: number) => {
    setAllocatorWeekIndex(wIndex)
    const week = monthWeekSegments(allocatorMonth)[wIndex]
    const firstLoadedDay = findFirstLoadedDayInWeek(week, dailyTips)
    setSelectedDate(firstLoadedDay)
    setAssignmentConfirmed(false)
  }

  // Form submission and confirmation states
  const [assignmentConfirmed, setAssignmentConfirmed] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)

  // Section 4 (Individual Breakdown) Search & Filter states
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [cargoFilter, setCargoFilter] = useState<string>('Todos')
  const [turnoFilter, setTurnoFilter] = useState<string>('Todos')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(5)

  // Percentages state (percentage 0-100 per position)
  const [percentages, setPercentages] = useState<Record<Position, number>>(() => {
    return positions.reduce((acc, pos) => {
      acc[pos] = Math.round((tipPercentages[pos] || 0) * 100)
      return acc
    }, {} as Record<Position, number>)
  })

  // List of available years for month selection
  const availableYears = useMemo(() => {
    const years = new Set([
      ...dailyTips.map((tip) => tip.date.slice(0, 4)),
      today.slice(0, 4),
      allocatorMonth.slice(0, 4),
    ])
    return Array.from(years).sort()
  }, [dailyTips, allocatorMonth])

  // Weeks for selected month
  const monthWeeks = useMemo(() => monthWeekSegments(allocatorMonth), [allocatorMonth])
  const activeWeek = monthWeeks[allocatorWeekIndex] || monthWeeks[0]

  // Check if month or active week has any loaded tip
  const monthHasAnyLoadedTip = useMemo(() => {
    return monthWeeks.some((week) =>
      week.days.some((day) => day.inMonth && hasLoadedTip(day.date, dailyTips)),
    )
  }, [monthWeeks, dailyTips])

  const weekHasAnyLoadedTip = useMemo(() => {
    if (!activeWeek) return false
    return activeWeek.days.some((day) => day.inMonth && hasLoadedTip(day.date, dailyTips))
  }, [activeWeek, dailyTips])

  // Selected Daily Tip for current date
  const selectedDailyTip = useMemo(
    () => (selectedDate ? dailyTips.find((tip) => tip.date === selectedDate) : undefined),
    [dailyTips, selectedDate],
  )
  const isTipLoaded = Boolean(selectedDailyTip)
  const totalTipAmount = selectedDailyTip?.amount || 0

  // Existing assignments for selected date
  const existingAssignmentsForDate = useMemo(() => {
    if (!selectedDailyTip) return []
    return assignments.filter((a) => a.dailyTipId === selectedDailyTip.id)
  }, [assignments, selectedDailyTip])

  const isAlreadyApproved = existingAssignmentsForDate.length > 0

  // Fulfilled shifts and eligible collaborators for selected date
  const fulfilledShiftsForDate = useMemo(() => {
    if (!selectedDate || !isTipLoaded) return []
    return shifts.filter((s) => s.date === selectedDate && s.fulfilled === true)
  }, [shifts, selectedDate, isTipLoaded])

  const eligibleCollaboratorsForDate = useMemo(() => {
    if (!selectedDate || !isTipLoaded) return []
    return collaborators.filter((c) => {
      if (!c.active) return false
      if (c.position === 'Administrativo') return true
      return fulfilledShiftsForDate.some((s) => s.collaboratorId === c.id)
    })
  }, [collaborators, fulfilledShiftsForDate, selectedDate, isTipLoaded])

  const collaboratorsCountByPos = useMemo(() => {
    return positions.reduce((acc, pos) => {
      acc[pos] = eligibleCollaboratorsForDate.filter((c) => c.position === pos).length
      return acc
    }, {} as Record<Position, number>)
  }, [eligibleCollaboratorsForDate])

  const totalEligibleCollaborators = eligibleCollaboratorsForDate.length

  // Shifts / journeys times on selected date
  const shiftTimesForDate = useMemo(() => {
    if (!selectedDate || !isTipLoaded) return []
    const shiftsOnDate = shifts.filter((s) => s.date === selectedDate)
    const timeSet = new Set(shiftsOnDate.map((s) => `${s.startsAt} - ${s.endsAt}`))
    return Array.from(timeSet)
  }, [shifts, selectedDate, isTipLoaded])


  // Percentage calculations
  const sumPercentages = useMemo(() => {
    const rawSum = positions.reduce((sum, pos) => sum + (Number(percentages[pos]) || 0), 0)
    return Math.round(rawSum * 100) / 100
  }, [percentages])

  const isPercentages100 = Math.abs(sumPercentages - 100) < 0.01

  const percentageDelta = useMemo(() => {
    return Math.round(Math.abs(100 - sumPercentages) * 100) / 100
  }, [sumPercentages])

  // Estimated amounts per cargo
  const estimatedAmountsByCargo = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const pct = (percentages[pos] || 0) / 100
      acc[pos] = Math.round(totalTipAmount * pct)
      return acc
    }, {} as Record<Position, number>)
  }, [percentages, totalTipAmount])

  const totalEstimatedAmount = useMemo(() => {
    if (isPercentages100) return totalTipAmount
    return positions.reduce((sum, pos) => sum + estimatedAmountsByCargo[pos], 0)
  }, [estimatedAmountsByCargo, isPercentages100, totalTipAmount])

  // Individual breakdown calculation per collaborator (with deterministic remainder handling)
  const individualBreakdownByCargo = useMemo(() => {
    const map = new Map<Position, { collaborator: Collaborator; amount: number }[]>()

    positions.forEach((position) => {
      const members = eligibleCollaboratorsForDate
        .filter((c) => c.position === position)
        .sort((a, b) => a.rut.localeCompare(b.rut))

      const pool = estimatedAmountsByCargo[position] || 0

      if (members.length === 0) {
        map.set(position, [])
        return
      }

      const baseAmount = Math.floor(pool / members.length)
      const remainder = pool - baseAmount * members.length

      const list = members.map((member, index) => ({
        collaborator: member,
        amount: baseAmount + (index < remainder ? 1 : 0),
      }))

      map.set(position, list)
    })

    return map
  }, [eligibleCollaboratorsForDate, estimatedAmountsByCargo])

  // Check if any cargo has percentage > 0 but 0 eligible collaborators
  const cargoWithNoCollaboratorsWarning = useMemo(() => {
    for (const pos of positions) {
      const pct = percentages[pos] || 0
      const count = collaboratorsCountByPos[pos] || 0
      if (pct > 0 && count === 0) {
        return pos
      }
    }
    return null
  }, [percentages, collaboratorsCountByPos])

  // Section 4: All individual assignments list (persisted or newly calculated)
  const allIndividualAssignments = useMemo(() => {
    if (isAlreadyApproved) {
      return existingAssignmentsForDate
        .map((assignment) => {
          const collaborator = collaborators.find((c) => c.id === assignment.collaboratorId)
          const shift = shifts.find((s) => s.collaboratorId === assignment.collaboratorId && s.date === selectedDate)
          return {
            id: assignment.id,
            collaborator,
            amount: assignment.amount,
            shift,
          }
        })
        .filter((item): item is { id: string; collaborator: Collaborator; amount: number; shift: Shift | undefined } => Boolean(item.collaborator))
    }

    const items: { id: string; collaborator: Collaborator; amount: number; shift: Shift | undefined }[] = []
    positions.forEach((pos) => {
      const list = individualBreakdownByCargo.get(pos) || []
      list.forEach((item) => {
        const shift = shifts.find((s) => s.collaboratorId === item.collaborator.id && s.date === selectedDate)
        items.push({
          id: `${selectedDate}-${item.collaborator.id}`,
          collaborator: item.collaborator,
          amount: item.amount,
          shift,
        })
      })
    })
    return items
  }, [isAlreadyApproved, existingAssignmentsForDate, collaborators, shifts, selectedDate, individualBreakdownByCargo])

  // Dynamic available turnos derived from current assignment distribution
  const availableTurnos = useMemo(() => {
    const turnosSet = new Set<string>()
    allIndividualAssignments.forEach((item) => {
      if (item.shift) {
        const startsAt = item.shift.startsAt
        const label = startsAt === '10:00' ? 'Mañana' : startsAt === '19:00' ? 'Tarde' : `Turno ${startsAt}`
        turnosSet.add(label)
      }
    })

    const result = Array.from(turnosSet)
    if (result.length === 0) {
      return ['Mañana', 'Tarde']
    }
    return result
  }, [allIndividualAssignments])

  // Filtered individual assignments
  const filteredIndividualAssignments = useMemo(() => {
    return allIndividualAssignments.filter((item) => {
      if (!item.collaborator) return false
      // Search term filter (Name or RUT)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim()
        const matchName = item.collaborator.name.toLowerCase().includes(query)
        const matchRut = item.collaborator.rut.toLowerCase().includes(query)
        if (!matchName && !matchRut) return false
      }
      // Cargo filter
      if (cargoFilter !== 'Todos' && item.collaborator.position !== cargoFilter) {
        return false
      }
      // Turno / Jornada filter
      if (turnoFilter !== 'Todos') {
        const startsAt = item.shift?.startsAt || '10:00'
        const turnoName = startsAt === '10:00' ? 'Mañana' : 'Tarde'
        if (turnoFilter !== turnoName && turnoFilter !== `${item.shift?.startsAt} - ${item.shift?.endsAt}`) {
          return false
        }
      }
      return true
    })
  }, [allIndividualAssignments, searchTerm, cargoFilter, turnoFilter])

  // Total amount & count of filtered assignments
  const totalAssignedInFiltered = useMemo(() => {
    return allIndividualAssignments.reduce((sum, item) => sum + item.amount, 0)
  }, [allIndividualAssignments])

  // Pagination calculation
  const totalSummaryItems = filteredIndividualAssignments.length
  const totalPages = Math.max(1, Math.ceil(totalSummaryItems / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalSummaryItems)
  const paginatedIndividualAssignments = useMemo(() => {
    return filteredIndividualAssignments.slice(startIndex, endIndex)
  }, [filteredIndividualAssignments, startIndex, endIndex])

  // Handle percentage input change
  const handlePercentageChange = (position: Position, valueStr: string) => {
    if (isAlreadyApproved) return
    const num = parseFloat(valueStr)
    const val = isNaN(num) ? 0 : Math.max(0, Math.min(100, num))
    setPercentages((prev) => ({
      ...prev,
      [position]: val,
    }))
  }

  // Reset percentages to system default
  const handleResetPercentages = () => {
    if (isAlreadyApproved) return
    setPercentages(
      positions.reduce((acc, pos) => {
        acc[pos] = Math.round((tipPercentages[pos] || 0) * 100)
        return acc
      }, {} as Record<Position, number>),
    )
  }

  // Handle Approval execution
  const executeApproval = async () => {
    if (
      !selectedDailyTip ||
      !isPercentages100 ||
      !assignmentConfirmed ||
      isAlreadyApproved ||
      cargoWithNoCollaboratorsWarning !== null
    ) {
      return
    }

    setIsSubmitting(true)
    setShowConfirmModal(false)

    try {
      const nextAssignments: TipAssignment[] = []

      positions.forEach((position) => {
        const breakdown = individualBreakdownByCargo.get(position) || []
        breakdown.forEach((item) => {
          nextAssignments.push({
            id: crypto.randomUUID(),
            dailyTipId: selectedDailyTip.id,
            collaboratorId: item.collaborator.id,
            amount: item.amount,
            assignedAt: new Date().toISOString(),
          })
        })
      })

      if (!nextAssignments.length) {
        setMessage('No fue posible asignar: no existen colaboradores con turno validado.')
        setIsSubmitting(false)
        return
      }

      // Backend API call if server running
      try {
        const result = await apiFetch<AssignmentResponse>(`/api/daily-tips/${selectedDailyTip.id}/assign`, {
          method: 'POST',
          json: { percentages },
        })
        nextAssignments.splice(0, nextAssignments.length, ...result.assignments)
      } catch (err) {
        console.warn('Backend API endpoint call skipped/unreachable, updated in client state.', err)
      }

      setAssignments((prev) => [...prev, ...nextAssignments])
      setToastMessage(
        `✓ Asignación aprobada exitosamente para el ${selectedDate} (${nextAssignments.length} colaboradores).`,
      )
      setMessage(`Asignación de propinas del ${selectedDate} completada con éxito.`)
      setAssignmentConfirmed(false)
    } catch (error) {
      console.error('Error al aprobar asignación:', error)
      setMessage('Ocurrió un error al procesar la asignación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const userCanApprove = can(activeMenuRole, 'assignments')

  return (
    <section className="panel allocator-main-panel">
      {/* Header section */}
      <div className="allocator-header">
        <div className="panel-title">
          <ShieldCheck className="panel-title-icon" aria-hidden />
          <div>
            <h2>Asignador de propinas</h2>
            <p className="panel-subtitle">
              Distribuye el total de propinas recaudadas según los porcentajes definidos por cargo.
            </p>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: SELECCIONA EL MES Y LA SEMANA */}
      <div className="tip-card-section">
        <div className="tip-card-title">
          <Calendar className="section-icon" aria-hidden />
          <h3>1. Selecciona el mes y la semana</h3>
        </div>

        <div className="tip-selector-top-row">
          {/* Selector de Mes */}
          <div className="tip-month-selector">
            <select
              className="tip-month-select"
              value={allocatorMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
            >
              {availableYears.flatMap((year) =>
                monthNames.map((month, index) => {
                  const value = `${year}-${String(index + 1).padStart(2, '0')}`
                  if (value > today.slice(0, 7)) return null
                  return (
                    <option key={value} value={value}>
                      {month} {year}
                    </option>
                  )
                }),
              )}
            </select>
            <div className="tip-month-arrows">
              <button
                type="button"
                className="icon-button-ghost"
                aria-label="Mes anterior"
                onClick={() => handleMonthChange(previousMonth(allocatorMonth))}
              >
                <ChevronLeft aria-hidden size={18} />
              </button>
              <button
                type="button"
                className="icon-button-ghost"
                disabled={allocatorMonth >= today.slice(0, 7)}
                aria-label="Mes siguiente"
                onClick={() => {
                  const nextM = nextMonth(allocatorMonth)
                  if (nextM <= today.slice(0, 7)) {
                    handleMonthChange(nextM)
                  }
                }}
              >
                <ChevronRight aria-hidden size={18} />
              </button>
            </div>
          </div>

          {/* Pestañas de Semanas */}
          <div className="week-tabs tip-week-tabs" role="tablist" aria-label="Semanas del mes">
            {monthWeeks.map((week) => (
              <button
                type="button"
                className={allocatorWeekIndex === week.index ? 'week-tab active' : 'week-tab'}
                key={week.name}
                onClick={() => handleWeekSelect(week.index)}
              >
                <strong>{week.name}</strong>
                <span>
                  {formatShortDate(week.start)} - {formatShortDate(week.end)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 7 DÍAS DE LA SEMANA (LUNES A DOMINGO) */}
        <div className="tip-days-grid" role="tablist" aria-label="Días de la semana">
          {activeWeek?.days.map((dayItem) => {
            const d = dayItem.date
            const inMonth = dayItem.inMonth
            const isSelected = selectedDate === d
            const tip = dailyTips.find((item) => item.date === d)
            const isTipLoadedForDay = Boolean(tip)
            const isApprovedForDay = Boolean(tip && assignments.some((a) => a.dailyTipId === tip.id))

            const { capWeekday, dayNum, monthShort } = formatDayMonthShort(d)
            const outOfPrevMonth = d < `${allocatorMonth}-01`

            return (
              <button
                type="button"
                key={d}
                disabled={!inMonth}
                className={
                  !inMonth
                    ? 'tip-day-card out-of-month disabled'
                    : isSelected
                    ? 'tip-day-card active'
                    : isApprovedForDay
                    ? 'tip-day-card registered'
                    : isTipLoadedForDay
                    ? 'tip-day-card available'
                    : 'tip-day-card disabled'
                }
                onClick={() => {
                  if (inMonth) {
                    setSelectedDate(d)
                    setAssignmentConfirmed(false)
                  }
                }}
              >
                <span className="tip-day-weekday">{capWeekday}</span>
                <strong className="tip-day-date">
                  {dayNum} {monthShort}
                </strong>

                {!inMonth ? (
                  <>
                    <span className="tip-day-badge disabled">
                      <Ban aria-hidden size={12} /> No disponible
                    </span>
                    <small className="tip-day-subtext">
                      {outOfPrevMonth ? 'Mes anterior' : 'Mes siguiente'}
                    </small>
                  </>
                ) : isApprovedForDay ? (
                  <>
                    <span className="tip-day-badge registered">
                      <CheckCircle2 aria-hidden size={12} /> Aprobada
                    </span>
                    <small className="tip-day-subtext">{currency(tip?.amount || 0)}</small>
                  </>
                ) : isTipLoadedForDay ? (
                  <>
                    <span className="tip-day-badge available">
                      <CheckCircle2 aria-hidden size={12} /> Registrada
                    </span>
                    <small className="tip-day-subtext">{currency(tip?.amount || 0)}</small>
                  </>
                ) : (
                  <>
                    <span className="tip-day-badge pending">Sin propina</span>
                    <small className="tip-day-subtext">Sin registro</small>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* RESUMEN DEL DÍA */}
      <div className="allocator-day-summary-row">
        {/* Card 1: Fecha seleccionada */}
        <div className="allocator-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrapper blue">
              <Calendar size={18} />
            </div>
            <div className="summary-card-title-group">
              <span className="summary-card-label">FECHA SELECCIONADA</span>
              <strong className="summary-card-value">{formatShortDate(selectedDate)}</strong>
            </div>
          </div>
          <div className="summary-card-badge-container">
            {isAlreadyApproved ? (
              <span className="allocator-badge badge-completed">Asignación aprobada</span>
            ) : isTipLoaded ? (
              <span className="allocator-badge badge-in-progress">Propina cargada</span>
            ) : (
              <span className="allocator-badge badge-pending">Sin propina cargada</span>
            )}
          </div>
        </div>

        {/* Card 2: Total de propinas del día */}
        <div className="allocator-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrapper green">
              <Coins size={18} />
            </div>
            <div className="summary-card-title-group">
              <span className="summary-card-label">TOTAL DE PROPINAS DEL DÍA</span>
              <strong className="summary-card-value">{currency(totalTipAmount)}</strong>
            </div>
          </div>
          <p className="summary-card-subtext">
            {isTipLoaded ? 'Monto cargado en el Cargador de Propinas.' : 'Sin carga en el Cargador de Propinas.'}
          </p>
        </div>

        {/* Card 3: Colaboradores con turno */}
        <div className="allocator-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrapper purple">
              <Users size={18} />
            </div>
            <div className="summary-card-title-group">
              <span className="summary-card-label">COLABORADORES CON TURNO</span>
              <strong className="summary-card-value">{totalEligibleCollaborators}</strong>
            </div>
          </div>
          <p className="summary-card-subtext">Con asistencia validada para la fecha.</p>
        </div>

        {/* Card 4: Jornadas */}
        <div className="allocator-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrapper orange">
              <Clock size={18} />
            </div>
            <div className="summary-card-title-group">
              <span className="summary-card-label">JORNADAS</span>
              <strong className="summary-card-value">
                {shiftTimesForDate.length || (totalEligibleCollaborators > 0 ? 2 : 0)}
              </strong>
            </div>
          </div>
          <p className="summary-card-subtext">
            {shiftTimesForDate.length > 0
              ? shiftTimesForDate.join(' | ')
              : totalEligibleCollaborators > 0
              ? '10:00 - 19:00 | 19:00 - 04:00'
              : 'Sin jornadas registradas.'}
          </p>
        </div>
      </div>

      {/* BANNER EN CASO DE NO EXISTIR PROPINA CARGADA */}
      {!isTipLoaded && (
        <div className="tip-no-data-alert">
          <AlertTriangle className="alert-icon" size={20} />
          <div>
            <strong>
              {!monthHasAnyLoadedTip
                ? 'No existen propinas cargadas para el mes seleccionado.'
                : !weekHasAnyLoadedTip
                ? 'No existen propinas cargadas para esta semana.'
                : 'No existe una propina cargada para el día seleccionado.'}
            </strong>
            <span>
              Para realizar una asignación, primero debes ingresar el monto recolectado en el Cargador de Propinas.
            </span>
          </div>
          <button
            type="button"
            className="secondary-button compact-btn"
            onClick={() => setActiveMenu(4)}
          >
            Ir al Cargador de Propinas <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* BANNER EN CASO DE ASIGNACIÓN YA APROBADA */}
      {isAlreadyApproved && (
        <div className="tip-approved-alert">
          <CheckCircle2 className="alert-icon" size={20} />
          <div>
            <strong>Asignación aprobada para el {formatFullDate(selectedDate)}</strong>
            <span>
              Esta asignación ya fue procesada previamente ({existingAssignmentsForDate.length} colaboradores beneficiados con un total de {currency(totalTipAmount)}).
            </span>
          </div>
        </div>
      )}

      {/* CONTENIDO EN 2 COLUMNAS (SECCIÓN 2 Y SECCIÓN 3) */}
      <div className="allocator-content-grid">
        {/* COLUMNA IZQUIERDA: 2. DEFINE LOS PORCENTAJES POR CARGO */}
        <div className="allocator-left-column">
          <div className="allocator-card-section compact-card-section">
            <div className="allocator-card-header">
              <div>
                <h3>2. Define los porcentajes por cargo</h3>
                <p className="card-subtitle">
                  Establece qué porcentaje del total de propinas corresponde a cada cargo.
                </p>
              </div>
              {!isAlreadyApproved && (
                <button
                  type="button"
                  className="icon-text-button-ghost"
                  onClick={handleResetPercentages}
                  title="Restablecer porcentajes iniciales"
                >
                  <RotateCcw size={14} /> Restablecer
                </button>
              )}
            </div>

            <div className="tip-info-callout compact-callout">
              <Info size={15} className="callout-icon" />
              <span>La suma de los porcentajes debe ser exactamente 100%.</span>
            </div>

            {/* TABLA DE CARGOS Y PORCENTAJES */}
            <div className="table-responsive-wrapper">
              <table className="allocator-table compact-table">
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th className="text-center">Colaboradores</th>
                    <th className="text-center">Porcentaje (%)</th>
                    <th className="text-right">Monto estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const count = collaboratorsCountByPos[pos] || 0
                    const pct = percentages[pos] ?? 0
                    const est = estimatedAmountsByCargo[pos] || 0

                    return (
                      <tr key={pos} className={pct > 0 ? 'active-row' : ''}>
                        <td className="position-cell">
                          <strong>{pos}</strong>
                        </td>
                        <td className="text-center">
                          <span className="collaborator-pill-count">{count}</span>
                        </td>
                        <td className="text-center pct-input-cell">
                          <div className="pct-input-wrapper">
                            <input
                              type="number"
                              className="pct-input"
                              min="0"
                              max="100"
                              step="any"
                              value={pct === 0 ? '' : pct}
                              onChange={(e) => handlePercentageChange(pos, e.target.value)}
                              disabled={isAlreadyApproved || !isTipLoaded}
                              placeholder="0"
                            />
                            <span className="pct-symbol">%</span>
                          </div>
                        </td>
                        <td className="text-right amount-cell">
                          <strong>{currency(est)}</strong>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="allocator-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="text-center">
                      <strong className="text-blue">{totalEligibleCollaborators}</strong>
                    </td>
                    <td className="text-center">
                      <span className={`pct-total-pill ${isPercentages100 ? 'valid' : 'invalid'}`}>
                        {sumPercentages}%
                      </span>
                    </td>
                    <td className="text-right amount-total-cell">
                      <strong className="text-blue">{currency(totalEstimatedAmount)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: 3. VISTA PREVIA DE DISTRIBUCIÓN */}
        <div className="allocator-right-column">
          <div className="allocator-card-section compact-card-section">
            <div className="allocator-card-header">
              <div>
                <h3>3. Vista previa de distribución</h3>
                <p className="card-subtitle">Resumen de cómo se distribuirán las propinas del día.</p>
              </div>
            </div>

            {/* TABLA DE RESUMEN POR CARGO (EXCLUSIVAMENTE RESUMEN DE CARGOS) */}
            <div className="table-responsive-wrapper">
              <table className="allocator-preview-table compact-table">
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th className="text-center">Porcentaje</th>
                    <th className="text-right">Monto</th>
                    <th className="text-right">Por colaborador (promedio)</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const count = collaboratorsCountByPos[pos] || 0
                    const pct = percentages[pos] ?? 0
                    const est = estimatedAmountsByCargo[pos] || 0
                    const avg = count > 0 ? currency(Math.round(est / count)) : '—'

                    return (
                      <tr key={pos}>
                        <td className="font-medium">{pos}</td>
                        <td className="text-center">{pct}%</td>
                        <td className="text-right font-medium">{currency(est)}</td>
                        <td className="text-right text-muted">{avg}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="preview-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="text-center">
                      <strong>{sumPercentages}%</strong>
                    </td>
                    <td className="text-right">
                      <strong className="text-blue">{currency(totalEstimatedAmount)}</strong>
                    </td>
                    <td className="text-right">
                      <strong>—</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ESTADO DE VALIDACIÓN DE PORCENTAJES */}
            <div className="allocator-validation-status-box">
              {cargoWithNoCollaboratorsWarning !== null ? (
                <div className="status-box error">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Cargo sin colaboradores elegibles</strong>
                    <span>
                      {cargoWithNoCollaboratorsWarning === 'Administrativo'
                        ? 'El cargo Administrativo tiene un porcentaje asignado, pero no existen colaboradores activos con este cargo.'
                        : `El cargo ${cargoWithNoCollaboratorsWarning} tiene un porcentaje asignado pero no cuenta con colaboradores con turno cumplido en esta fecha.`}
                    </span>
                  </div>
                </div>
              ) : isPercentages100 ? (
                <div className="status-box valid">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Porcentajes válidos</strong>
                    <span>La suma de los porcentajes es exactamente 100%.</span>
                  </div>
                </div>
              ) : sumPercentages < 100 ? (
                <div className="status-box warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Porcentajes incompletos</strong>
                    <span>
                      La distribución suma {sumPercentages}%. Falta asignar {percentageDelta}%.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="status-box error">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Porcentajes excedidos</strong>
                    <span>
                      La distribución suma {sumPercentages}%. Debes reducir {percentageDelta}%.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 4: RESUMEN DE ASIGNACIÓN DE PROPINAS (ANCHO COMPLETO 100%) */}
      <div className="allocator-card-section fullwidth-section">
        <div className="allocator-summary-header-row">
          <div>
            <h3>4. Resumen de asignación de propinas</h3>
            <p className="card-subtitle">
              Detalle de lo que recibirá cada colaborador según la distribución definida.
            </p>
          </div>

          {/* FILTROS Y BUSCADOR */}
          <div className="summary-filters-group">
            {/* Buscador por Nombre o RUT */}
            <div className="summary-search-wrapper">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                className="summary-search-input"
                placeholder="Buscar colaborador (nombre o RUT)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filtro por Cargo (Botones) */}
            <div className="button-filter-group">
              <span className="button-filter-label">Cargos</span>
              <div className="button-filter-pills" role="tablist" aria-label="Filtro por cargo">
                <button
                  type="button"
                  className={`filter-pill ${cargoFilter === 'Todos' ? 'active' : ''}`}
                  onClick={() => setCargoFilter('Todos')}
                >
                  Todos
                </button>
                {positions.map((pos) => (
                  <button
                    type="button"
                    key={pos}
                    className={`filter-pill ${cargoFilter === pos ? 'active' : ''}`}
                    onClick={() => setCargoFilter(pos)}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por Turno / Jornada (Botones) */}
            <div className="button-filter-group">
              <span className="button-filter-label">Turnos</span>
              <div className="button-filter-pills" role="tablist" aria-label="Filtro por turno">
                <button
                  type="button"
                  className={`filter-pill ${turnoFilter === 'Todos' ? 'active' : ''}`}
                  onClick={() => setTurnoFilter('Todos')}
                >
                  Todos
                </button>
                {availableTurnos.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`filter-pill ${turnoFilter === t ? 'active' : ''}`}
                    onClick={() => setTurnoFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TABLA DE DETALLE INDIVIDUAL */}
        <div className="table-responsive-wrapper">
          <table className="allocator-table summary-individual-table">
            <thead>
              <tr>
                <th className="text-center" style={{ width: '48px' }}>#</th>
                <th>Nombre del colaborador</th>
                <th>RUT</th>
                <th>Cargo</th>
                <th>Turno</th>
                <th>Jornada</th>
                <th className="text-right">Monto asignado</th>
              </tr>
            </thead>
            <tbody>
              {paginatedIndividualAssignments.length > 0 ? (
                paginatedIndividualAssignments.map((item, idx) => {
                  const globalIdx = startIndex + idx + 1
                  const startsAt = item.shift?.startsAt || '10:00'
                  const endsAt = item.shift?.endsAt || '19:00'
                  const turnoName = startsAt === '10:00' ? 'Mañana' : 'Tarde'
                  const jornadaText = `${startsAt} - ${endsAt}`

                  return (
                    <tr key={item.id}>
                      <td className="text-center font-muted">{globalIdx}</td>
                      <td className="font-semibold">{item.collaborator.name}</td>
                      <td>
                        <code className="rut-code">{item.collaborator.rut}</code>
                      </td>
                      <td>
                        <span className="position-badge">{item.collaborator.position}</span>
                      </td>
                      <td>{turnoName}</td>
                      <td className="text-muted">{jornadaText}</td>
                      <td className="text-right font-bold text-dark">
                        {currency(item.amount)}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted">
                    {totalEligibleCollaborators === 0
                      ? 'No hay colaboradores elegibles con turno validado para la fecha seleccionada.'
                      : 'No se encontraron colaboradores que coincidan con la búsqueda y filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER BAR: PAGINACIÓN Y TARJETA DE TOTAL ASIGNADO */}
        <div className="summary-pagination-footer-row">
          <div className="summary-pagination-left">
            <span className="pagination-info-text">
              {totalSummaryItems > 0
                ? `Mostrando ${startIndex + 1} a ${endIndex} de ${totalSummaryItems} colaboradores`
                : 'Sin registros'}
            </span>

            <div className="pagination-btn-group">
              <button
                type="button"
                className="pagination-arrow-btn"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 2)
                .map((p, idx, arr) => {
                  const prevP = arr[idx - 1]
                  const showEllipsis = prevP && p - prevP > 1
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && <span className="pagination-ellipsis">...</span>}
                      <button
                        type="button"
                        className={`pagination-num-btn ${p === safeCurrentPage ? 'active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  )
                })}

              <button
                type="button"
                className="pagination-arrow-btn"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Filas por página selector */}
            <div className="page-size-wrapper">
              <span className="page-size-label">Filas por página</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* STAT CARD TOTAL ASIGNADO A COLABORADORES */}
          <div className="summary-total-stat-card">
            <div className="total-stat-icon-wrapper">
              <Users size={20} />
            </div>
            <div className="total-stat-info">
              <span className="total-stat-label">Total asignado a colaboradores</span>
              <strong className="total-stat-value">{currency(totalAssignedInFiltered)}</strong>
              <small className="total-stat-subtext">{allIndividualAssignments.length} colaboradores</small>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 5: APROBAR ASIGNACIÓN (ANCHO COMPLETO 100%) */}
      <div className="allocator-card-section fullwidth-section approval-fullwidth-section">
        <div className="allocator-card-header">
          <div>
            <h3>5. Aprobar asignación</h3>
            <p className="card-subtitle">
              Una vez que estés conforme con la distribución, aprueba la asignación para registrar los montos
              por cargo y por colaborador.
            </p>
          </div>
        </div>

        {isAlreadyApproved ? (
          <div className="approval-locked-notice">
            <Lock size={16} />
            <span>La asignación de propinas para este día ya fue aprobada previamente.</span>
          </div>
        ) : (
          <div className="approval-horizontal-row">
            <label
              className={`confirm-checkbox-label ${
                !isTipLoaded || !isPercentages100 || cargoWithNoCollaboratorsWarning !== null
                  ? 'disabled'
                  : ''
              }`}
            >
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={assignmentConfirmed}
                onChange={(e) => setAssignmentConfirmed(e.target.checked)}
                disabled={
                  !isTipLoaded ||
                  !isPercentages100 ||
                  cargoWithNoCollaboratorsWarning !== null ||
                  isSubmitting
                }
              />
              <span>
                Confirmo que los porcentajes ingresados son correctos y deseo registrar la asignación.
              </span>
            </label>

            <button
              type="button"
              className="primary-button approve-btn-wide"
              disabled={
                !isTipLoaded ||
                !isPercentages100 ||
                !assignmentConfirmed ||
                isSubmitting ||
                !userCanApprove ||
                cargoWithNoCollaboratorsWarning !== null
              }
              onClick={() => setShowConfirmModal(true)}
            >
              {isSubmitting ? (
                'Procesando...'
              ) : (
                <>
                  <CheckCircle2 size={18} /> Aprobar asignación
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN FINAL */}
      {showConfirmModal && (
        <div className="modal-backdrop" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <ShieldCheck size={24} className="modal-icon" />
              <div>
                <h3>Confirmar asignación de propinas</h3>
                <p>Por favor confirma los detalles antes de registrar la asignación final.</p>
              </div>
            </div>

            <div className="modal-body-details">
              <div className="modal-detail-row">
                <span>Fecha:</span>
                <strong>{formatFullDate(selectedDate)}</strong>
              </div>
              <div className="modal-detail-row">
                <span>Total de propinas:</span>
                <strong className="modal-amount-highlight">{currency(totalTipAmount)}</strong>
              </div>
              <div className="modal-detail-row">
                <span>Colaboradores a recibir:</span>
                <strong>{totalEligibleCollaborators} colaboradores con turno validado</strong>
              </div>

              <div className="modal-breakdown-title">Resumen por cargo y colaboradores:</div>
              <div className="modal-breakdown-list">
                {positions.map((pos) => {
                  const pct = percentages[pos] || 0
                  const amount = estimatedAmountsByCargo[pos] || 0
                  const count = (individualBreakdownByCargo.get(pos) || []).length
                  if (pct === 0) return null
                  return (
                    <div key={pos} className="modal-breakdown-item">
                      <span>
                        {pos} ({pct}% · {count} colabs)
                      </span>
                      <strong>{currency(amount)}</strong>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="modal-footer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={executeApproval}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Registrando...' : 'Confirmar y Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

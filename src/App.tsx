import {
  Ban,
  Briefcase,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Coins,
  Copy,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Info,
  Route,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  useCallback,
  useMemo,
  useEffect,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { apiFetch } from './api'
import './App.css'
import { CollaboratorCard } from './components/CollaboratorCard'
import { RuleList } from './components/RuleList'
import { StatCard } from './components/StatCard'
import { TipAllocatorModule } from './components/TipAllocatorModule'
import {
  currency,
  initialAssignments,
  initialCollaborators,
  initialDailyTips,
  initialShifts,
  normalizeRut,
  maxDailyShiftCoverageByPosition,
  positions,
  requiredCollaboratorsByPosition,
  roles,
  tipPercentages,
  today,
  type Collaborator,
  type DailyTip,
  type Position,
  type RoleId,
  type Shift,
  type TipAssignment,
  type TipFilter,
} from './domain'

const rolePermissions: Record<RoleId, string[]> = {
  0: ['dashboard', 'summary'],
  1: ['people'],
  2: ['shifts'],
  3: ['validation'],
  4: ['tips'],
  5: ['assignments'],
  6: ['dashboard', 'people', 'shifts', 'validation', 'tips', 'assignments', 'accounts', 'formats', 'audit', 'summary'],
  7: ['audit', 'summary'],
}

const roleDisplayOrder: RoleId[] = [0, 1, 2, 3, 4, 5, 7]

type MenuKey = RoleId | 'project' | 'incidents'

const uploadFormats = [
  {
    name: 'Colaboradores',
    description: 'Carga inicial o masiva de personas. El RUT es unico y no se duplica.',
    headers: ['rut', 'nombre', 'primer_apellido', 'segundo_apellido', 'telefono', 'direccion', 'cargo', 'fecha_ingreso'],
    example: '11111111-1;Ana;Lopez;Rojas;+56911111111;Av. Providencia 1200;Garzon;2026-09-01',
    filename: 'formato-colaboradores.csv',
  },
  {
    name: 'Validacion de turnos',
    description: 'Confirmacion operativa antes de permitir asignar propinas.',
    headers: ['rut', 'fecha', 'cumplido'],
    example: '11111111-1;2026-09-05;SI',
    filename: 'formato-validacion-turnos.csv',
  },
  {
    name: 'Propinas diarias',
    description: 'Monto total diario que luego se distribuye por cargo.',
    headers: ['fecha', 'monto'],
    example: '2026-09-05;850000',
    filename: 'formato-propinas.csv',
  },
]

const roadmapSteps = [
  {
    roleIds: [1, 6],
    title: '1. Crear colaboradores',
    text: 'Gestion de Personas registra RUT, nombre y cargo. El RUT queda protegido contra duplicados.',
  },
  {
    roleIds: [2, 6],
    title: '2. Planificar turnos',
    text: 'Asignador de Turnos carga la semana por colaborador existente, fecha, hora de inicio y termino.',
  },
  {
    roleIds: [3, 6],
    title: '3. Validar asistencia',
    text: 'Validador confirma si el turno fue cumplido. Sin esta validacion no entra al reparto.',
  },
  {
    roleIds: [4, 6],
    title: '4. Cargar propina diaria',
    text: 'Cargador de Propinas registra el total del dia una sola vez para evitar montos duplicados.',
  },
  {
    roleIds: [5, 6],
    title: '5. Asignar por reglas',
    text: 'Asignador distribuye segun porcentajes por cargo y solo a colaboradores con turno cumplido.',
  },
  {
    roleIds: [0, 7, 6],
    title: '6. Revisar dashboard',
    text: 'Dashboard y Auditor consultan por dia, semana o mes, filtrando por cargo y trazabilidad.',
  },
]

const businessRules = [
  'El RUT y el nombre completo del colaborador son unicos; una carga masiva no puede registrar duplicados.',
  'Las propinas solo se asignan si la persona existe, tiene turno, el turno fue cumplido y existe propina diaria cargada.',
  'Distribucion fija del total diario: Garzon 30%, Cocina 25%, Barra 20%, Anfitrion 15%, Guardia 5%, Administrativo 5%.',
  'Dotacion actual: Garzon 60, Cocina 40, Barra 30, Anfitrion 20, Guardia 30, Administrativo 5.',
  'Topes diarios de planificacion: Garzon 40, Cocina 30, Barra 20, Anfitrion 12, Guardia 20.',
  'Administrativos no participan en asignacion de turnos operativos.',
  'Los turnos se arman por mes y por semana interna del mes; una semana no cruza de un mes a otro.',
  'Jornadas permitidas: 10:00-19:00 y 19:00-04:00.',
  'Un colaborador no puede superar 5 dias laborales seguidos.',
  'Un colaborador no puede trabajar mas de 2 domingos en el mes.',
  'Las jornadas son fijas; el Turno Semana se crea al completar todos los dias y ambas jornadas por rubro.',
  'No se permiten fechas superiores a hoy para cargas operativas; el mes activo puede planificar turnos hasta fin de mes.',
]

const projectImprovements = [
  'Integrar POS para cargar ventas y propinas reales sin digitacion manual.',
  'Agregar payroll export para emitir archivo de pago o remuneraciones.',
  'Crear bitacora de auditoria por accion: quien cargo, edito, valido, asigno o elimino.',
  'Publicar turnos visibles para colaboradores con confirmacion de lectura.',
  'Agregar alertas de cobertura baja, exceso de dias seguidos y turnos sin validar.',
  'Permitir reglas de reparto versionadas para conservar historico si cambia el porcentaje.',
]

const antigravityModifications = [
  {
    title: 'Rediseño y Refactorización del Asignador de Propinas',
    description:
      'Transformación integral del módulo con Roadmap de Asignación dinámico de 5 pasos, Resumen del Día interactivo con métricas reales, tabla editable de porcentajes por cargo (100%), vista previa en tiempo real y flujo de aprobación con confirmación explícita y modal.',
  },
  {
    title: 'Layout Sidebar Sticky en Desktop',
    description:
      'Corrección de CSS global para mantener el menú lateral visible durante el scroll vertical (`position: sticky; top: 0; height: 100vh; overflow-y: auto`), manteniendo la navegabilidad fluida sin solapar contenido ni afectar la experiencia responsiva en móviles/tablets.',
  },
  {
    title: 'Arquitectura Incremental y Manejo Monetario Seguro',
    description:
      'Preservación estricta de la fuente de verdad del proyecto, manteniendo las posiciones reales (`positions`), el cálculo de asistencia validada (`fulfilled === true`), redondeos seguros en CLP (`Math.round` / `Math.floor`) y la protección inmutable contra doble asignación.',
  },
]

const antigravityInterpretedRules = [
  'Regla del 100%: La suma total de los porcentajes asignados a los cargos debe ser exactamente 100% para habilitar la aprobación.',
  'Elegibilidad por Turno Cumplido: Solo los colaboradores activos con asistencia validada (`fulfilled === true`) en la fecha seleccionada reciben propina.',
  'Prerrequisito de Propina Cargada: No se permite aprobar asignaciones para días que no tengan propina registrada en el Cargador de Propinas.',
  'Inmutabilidad de Asignación Aprobada: Las fechas con asignación aprobada quedan protegidas contra re-asignaciones y bloquean cambios accidentales.',
  'Reparto Equitativo por Cargo: El pozo total de cada cargo (`total * pct`) se divide en partes iguales enteras (`Math.floor`) entre sus colaboradores elegibles.',
]

const antigravityMissingRules = [
  'Reapertura Auditable de Asignaciones: Permitir desarmar o re-editar asignaciones aprobadas mediante un permiso especial de Administrador/Auditor con registro explícito de trazabilidad.',
  'Manejo Automatizado de Remanentes por Redondeo: Definir una política automática para adjudicar sobrantes por redondeo de enteros CLP (ej. al pozo de Cocina o a un fondo común).',
  'Ponderación por Horas Trabajadas: Considerar la duración exacta de la jornada (ej. 9h vs 5h) en el cálculo del reparto entre personas del mismo cargo.',
  'Alertas de Incompatibilidad de Dotación: Notificar advertencias al usuario cuando se asigna un porcentaje a un cargo que no tiene colaboradores con turno validado en esa fecha.',
  'Exportación e Integración a Nómina / POS: Generar archivos de liquidación o integración directa con POS y software de remuneraciones para el pago automático de propinas.',
]

const identifiedHardcodedRules = [
  {
    category: '1. Reparto de Propinas por Cargo (Suma = 100%)',
    location: 'src/domain.ts & server/businessRules.ts',
    rules: [
      'Garzón: 30% (0.3)',
      'Cocina: 25% (0.25)',
      'Barra: 20% (0.2)',
      'Anfitrión: 15% (0.15)',
      'Guardia: 5% (0.05)',
      'Administrativo: 5% (0.05)',
      'La suma de porcentajes configurados debe dar exactamente 100% para autorizar la asignación.',
    ],
  },
  {
    category: '2. Requisitos de Dotación Total por Cargo',
    location: 'src/domain.ts',
    rules: [
      'Garzón: 60 colaboradores.',
      'Cocina: 40 colaboradores.',
      'Barra: 30 colaboradores.',
      'Anfitrión: 20 colaboradores.',
      'Guardia: 30 colaboradores.',
      'Administrativo: 5 colaboradores.',
      'Total plantilla del restaurante: 185 colaboradores.',
    ],
  },
  {
    category: '3. Límites de Cobertura Diaria Máxima de Turnos',
    location: 'src/domain.ts',
    rules: [
      'Garzón: Máximo 40 turnos/día.',
      'Cocina: Máximo 30 turnos/día.',
      'Barra: Máximo 20 turnos/día.',
      'Anfitrión: Máximo 12 turnos/día.',
      'Guardia: Máximo 20 turnos/día.',
      'Administrativo: Excluido de turnos operacionales (0 turnos/día).',
    ],
  },
  {
    category: '4. Estructura de Horarios y Reglas de Jornada',
    location: 'src/App.tsx',
    rules: [
      'Jornada 1: 10:00 - 19:00 hrs.',
      'Jornada 2: 19:00 - 04:00 hrs.',
      'Máximo 5 días trabajados seguidos por colaborador.',
      'Máximo 2 domingos trabajados al mes por colaborador.',
      'Cargo Administrativo excluido de la planificación de turnos operacionales.',
    ],
  },
  {
    category: '5. Criterios de Elegibilidad y Validación de Propinas',
    location: 'server/index.ts & TipAllocatorModule.tsx',
    rules: [
      'Solo se pueden validar turnos de fechas pasadas (date < today, anterior a 2026-09-07).',
      'Elegibilidad: Únicamente colaboradores activos con turno cumplido validado (fulfilled === true).',
      'Prerrequisito: Debe existir propina registrada previa en la fecha para habilitar la distribución.',
      'Inmutabilidad: Fechas con asignación aprobada quedan protegidas contra re-asignación o sobrescritura.',
    ],
  },
  {
    category: '6. Algoritmo Monetario y Redondeo CLP',
    location: 'server/businessRules.ts & src/domain.ts',
    rules: [
      'Pozo por cargo: Math.round(MontoTotal * PorcentajeCargo).',
      'Monto por persona: Math.floor(PozoCargo / CantidadElegibles).',
      'Remanentes por enteros CLP: Los sobrantes por truncamiento de decimales no se redistribuyen y quedan retenidos.',
      'Formateo monetario: Formato explícito en CLP (es-CL) sin fracciones decimales.',
    ],
  },
  {
    category: '7. Validaciones de Identidad y Registro',
    location: 'src/domain.ts & server/index.ts',
    rules: [
      'Validación de RUT chileno mediante algoritmo Módulo 11 con dígito verificador.',
      'Unicidad estricta de RUT: No se permite crear o cargar colaboradores con RUT duplicado.',
      'Unicidad estricta de Nombre: Búsqueda insensible a mayúsculas/minúsculas para evitar nombres repetidos.',
    ],
  },
  {
    category: '8. Matriz de Roles y Permisos de Acceso',
    location: 'src/domain.ts & src/App.tsx',
    rules: [
      '8 Roles fijos (ID 0 a 7): Dashboard, Gestión Personas, Turnos, Validador, Cargador Propinas, Asignador Propinas, Admin, Auditor.',
      'Definición hardcodeada de permisos por vista en la matriz rolePermissions.',
    ],
  },
]

const similarSystems = [
  {
    name: '7shifts',
    description: 'Gestiona horarios, disponibilidad, comunicacion de equipo y tip pooling con reglas configurables.',
    opportunity: 'Inspirar publicacion de turnos, clonado de plantillas, alertas de cumplimiento y calculo automatico de propinas.',
  },
  {
    name: 'TipHaus',
    description: 'Automatiza pooling, distribucion y pagos de propinas para restaurantes con integraciones POS.',
    opportunity: 'Priorizar integracion POS, historial de pagos y visibilidad por colaborador.',
  },
  {
    name: 'Kickfin',
    description: 'Calcula propinas, mantiene trazabilidad y permite pagos digitales rapidos al personal.',
    opportunity: 'Agregar estado de pago, comprobantes y trazabilidad contable.',
  },
  {
    name: 'Fourth / HotSchedules',
    description: 'Une scheduling, asistencia, labor management y procesos operativos para restaurantes.',
    opportunity: 'Mejorar control de cobertura, costos laborales y comunicacion de turnos.',
  },
  {
    name: 'Restaurant365',
    description: 'Centraliza contabilidad, operaciones, payroll y tip management en restaurantes.',
    opportunity: 'Agregar exportacion contable, conciliacion y reportes auditables.',
  },
]

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

const shiftPositions: Position[] = positions.filter((position) => position !== 'Administrativo')
const shiftJourneys = [
  { label: 'Jornada 1', startsAt: '10:00', endsAt: '19:00' },
  { label: 'Jornada 2', startsAt: '19:00', endsAt: '04:00' },
] as const

type ShiftJourney = (typeof shiftJourneys)[number]

function can(role: RoleId, permission: string) {
  return rolePermissions[role].includes(permission)
}

function downloadTemplate(filename: string, headers: string[], example: string) {
  const csv = `${headers.join(';')}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10)
}

function weekRange(date: string) {
  const selected = new Date(`${date}T12:00:00`)
  const day = selected.getDay() || 7
  const start = new Date(selected)
  start.setDate(start.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

function formatWeekdayCapitalized(date: string) {
  const weekday = formatWeekday(date)
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 2, 1).toISOString().slice(0, 7)
}

function previousDay(date: string) {
  const current = new Date(`${date}T12:00:00`)
  current.setDate(current.getDate() - 1)
  return current.toISOString().slice(0, 10)
}

function formatFullDate(date: string) {
  const d = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'long' }).format(d)
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(d)
  const dayNum = d.getDate().toString().padStart(2, '0')
  const year = d.getFullYear()
  return `${capitalizedWeekday} ${dayNum} de ${monthName} de ${year}`
}

function formatDayMonthShort(date: string) {
  const d = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'short' }).format(d)
  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '')
  const dayNum = d.getDate().toString().padStart(2, '0')
  const monthShort = new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(d).replace('.', '')
  return { capWeekday, dayNum, monthShort, fullShort: `${capWeekday} ${dayNum} ${monthShort}` }
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 1).toISOString().slice(0, 7)
}

function monthDates(month: string) {
  const end = monthEnd(month)
  const dates: string[] = []
  const cursor = new Date(`${month}-01T12:00:00`)
  const limit = new Date(`${end}T12:00:00`)
  while (cursor <= limit) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

type ShiftWeekDay = {
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

  const segments = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return segments.map((daysInWeek, index) => {
    const monthDays = daysInWeek.filter((day) => day.inMonth)
    return {
    index,
    name: `Semana ${index + 1}`,
    start: monthDays[0]?.date || daysInWeek[0].date,
    end: monthDays[monthDays.length - 1]?.date || daysInWeek[daysInWeek.length - 1].date,
    dates: daysInWeek.map((day) => day.date),
    days: daysInWeek,
    workDates: monthDays.map((day) => day.date),
  }
  })
}

function businessShiftDates(month: string) {
  return monthDates(month)
}

function dayDistance(previous: string, current: string) {
  const start = new Date(`${previous}T12:00:00`).getTime()
  const end = new Date(`${current}T12:00:00`).getTime()
  return Math.round((end - start) / 86400000)
}

function exceedsMaxConsecutiveWorkDays(dates: string[]) {
  const sorted = Array.from(new Set(dates)).sort()
  let streak = 1

  for (let index = 1; index < sorted.length; index += 1) {
    streak = dayDistance(sorted[index - 1], sorted[index]) === 1 ? streak + 1 : 1
    if (streak > 5) return true
  }

  return false
}

function consecutiveWorkDaysUntil(dates: string[], targetDate: string) {
  const sorted = Array.from(new Set(dates.filter((date) => date <= targetDate))).sort()
  if (!sorted.includes(targetDate)) return 0

  let streak = 1
  for (let index = sorted.indexOf(targetDate); index > 0; index -= 1) {
    if (dayDistance(sorted[index - 1], sorted[index]) !== 1) break
    streak += 1
  }

  return streak
}

function getPositionWeekCompletion(
  shifts: Shift[],
  collaborators: Collaborator[],
  workDates: string[],
  position: Position,
) {
  const positionShifts = shifts.filter((shift) => {
    const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
    return collaborator?.position === position
  })
  const dayCounts = workDates.map((date) => positionShifts.filter((shift) => shift.date === date).length)
  const expected = dayCounts[0] || 0
  const complete = workDates.length > 0 && expected > 0 && dayCounts.every((count) => count === expected)

  return {
    complete,
    expected,
    assigned: positionShifts.length,
    pendingDays: dayCounts.filter((count) => count === 0 || count !== expected).length,
  }
}

function isFutureDate(date: string) {
  return Boolean(date) && date > today
}

function blockManualDateInput(
  event: ClipboardEvent<HTMLInputElement> | ReactDragEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>,
) {
  event.preventDefault()
}

function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function shiftCloseKey(month: string, weekIndex: number, position: Position) {
  return `${month}:${weekIndex}:${position}`
}

const editableShiftStart = `${today.slice(0, 7)}-01`
const storedShiftsKey = 'pub-tips-shifts'
const storedClosedShiftKeysKey = 'pub-tips-closed-shift-weeks'

function readStoredArray<T>(key: string, isValid: (value: unknown) => value is T) {
  if (typeof window === 'undefined') return []

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isValid) : []
  } catch {
    return []
  }
}

function isStoredShift(value: unknown): value is Shift {
  if (!value || typeof value !== 'object') return false
  const shift = value as Record<string, unknown>
  return (
    typeof shift.id === 'string' &&
    typeof shift.collaboratorId === 'string' &&
    typeof shift.date === 'string' &&
    typeof shift.startsAt === 'string' &&
    typeof shift.endsAt === 'string' &&
    (typeof shift.fulfilled === 'boolean' || shift.fulfilled === null)
  )
}

function normalizeApiShift(value: unknown): Shift | null {
  if (!isStoredShift(value)) return null
  return {
    ...value,
    date: value.date.slice(0, 10),
  }
}

function normalizeApiClosedShiftKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const weeklyShift = value as Record<string, unknown>
  if (
    typeof weeklyShift.month !== 'string' ||
    typeof weeklyShift.weekIndex !== 'number' ||
    !positions.some((position) => position === weeklyShift.position)
  ) {
    return null
  }

  return shiftCloseKey(weeklyShift.month, weeklyShift.weekIndex, weeklyShift.position as Position)
}

type BootstrapData = {
  collaborators: Collaborator[]
  shifts: Shift[]
  weeklyShifts: unknown[]
  dailyTips: DailyTip[]
  assignments: TipAssignment[]
}

function readStoredShifts() {
  const storedShifts = readStoredArray<Shift>(storedShiftsKey, isStoredShift)
  if (!storedShifts.length) return initialShifts

  return [
    ...initialShifts.filter((shift) => shift.date < editableShiftStart),
    ...storedShifts,
  ]
}

function readStoredClosedShiftKeys() {
  return readStoredArray<string>(storedClosedShiftKeysKey, (value): value is string => typeof value === 'string')
}

function App() {
  const [roleId, setRoleId] = useState<RoleId>(6)
  const [activeMenu, setActiveMenu] = useState<MenuKey>(0)
  const [period, setPeriod] = useState<TipFilter>('month')
  const [activeMonth, setActiveMonth] = useState(today.slice(0, 7))
  const [activeYear, setActiveYear] = useState(today.slice(0, 4))
  const [dashboardPosition, setDashboardPosition] = useState<Position | 'Todos'>('Todos')
  const [validationPosition, setValidationPosition] = useState<Position>('Garzon')
  const [validationStatus, setValidationStatus] = useState<'Todos' | 'Pendiente' | 'Asiste' | 'No asiste'>('Pendiente')
  const [validationMonth, setValidationMonth] = useState(today.slice(0, 7))
  const [validationWeekIndex, setValidationWeekIndex] = useState(0)
  const [validationDay, setValidationDay] = useState<string>('')
  const [validationJourneyStartsAt, setValidationJourneyStartsAt] = useState<string>('')
  const [validationSearch, setValidationSearch] = useState<string>('')
  const [validationPage, setValidationPage] = useState<number>(1)
  const [validationPageSize, setValidationPageSize] = useState<number>(10)
  const yesterday = useMemo(() => previousDay(today), [])
  const [tipMonth, setTipMonth] = useState<string>(today.slice(0, 7))
  const [tipWeekIndex, setTipWeekIndex] = useState<number>(0)
  const [tipFormDate, setTipFormDate] = useState<string>(today)
  const [tipFormAmount, setTipFormAmount] = useState<string>('')
  const [peoplePosition, setPeoplePosition] = useState<Position | 'Todos'>('Todos')
  const [peoplePage, setPeoplePage] = useState(1)
  const [shiftMonth, setShiftMonth] = useState(today.slice(0, 7))
  const [shiftView, setShiftView] = useState<'planner' | 'created'>('planner')
  const [shiftWeekIndex, setShiftWeekIndex] = useState(0)
  const [shiftPosition, setShiftPosition] = useState<Position>('Garzon')
  const [quickShiftStartsAt, setQuickShiftStartsAt] = useState<ShiftJourney['startsAt']>('10:00')
  const [quickShiftDate, setQuickShiftDate] = useState('')
  const [closedShiftKeys, setClosedShiftKeys] = useState<string[]>(readStoredClosedShiftKeys)
  const [editingShiftKeys, setEditingShiftKeys] = useState<string[]>([])
  const [copiedShiftDay, setCopiedShiftDay] = useState('')
  const [draggedCollaboratorId, setDraggedCollaboratorId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(today)
  const [rangeStart, setRangeStart] = useState(`${today.slice(0, 7)}-01`)
  const [rangeEnd, setRangeEnd] = useState(today)
  const [collaborators, setCollaborators] = useState<Collaborator[]>(initialCollaborators)
  const [shifts, setShifts] = useState<Shift[]>(readStoredShifts)
  const [dailyTips, setDailyTips] = useState<DailyTip[]>(initialDailyTips)
  const [assignments, setAssignments] = useState<TipAssignment[]>(initialAssignments)
  const [message, setMessage] = useState('')
  void message
  const [shiftCreateMessage, setShiftCreateMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const monthStart = `${activeMonth}-01`
  const cutoffDate = selectedDate.startsWith(activeMonth) ? selectedDate : monthStart
  const maxShiftMonth = nextMonth(today.slice(0, 7))
  const availableYears = Array.from(
    new Set([...dailyTips.map((tip) => tip.date.slice(0, 4)), today.slice(0, 4), maxShiftMonth.slice(0, 4)]),
  ).sort()

  const isInActivePeriodRange = useCallback((date: string) => {
    if (period === 'day') return date === selectedDate
    if (period === 'range') return date >= rangeStart && date <= rangeEnd
    if (period === 'week') {
      const range = weekRange(selectedDate)
      return date >= range.start && date <= range.end && date.startsWith(activeMonth)
    }

    return date >= monthStart && date <= cutoffDate
  }, [activeMonth, cutoffDate, monthStart, period, rangeEnd, rangeStart, selectedDate])

  const tipWeeks = useMemo(() => monthWeekSegments(tipMonth), [tipMonth])
  const activeTipWeek = tipWeeks[tipWeekIndex] || tipWeeks[0]

  const activeTipDate = useMemo(() => {
    if (tipFormDate && activeTipWeek?.dates.includes(tipFormDate)) {
      return tipFormDate
    }
    const firstInMonth = activeTipWeek?.days.find((d) => d.inMonth)?.date
    return firstInMonth || activeTipWeek?.days[0]?.date || yesterday
  }, [tipFormDate, activeTipWeek, yesterday])

  const isTipDatePast = activeTipDate < today
  const isTipDateToday = activeTipDate === today
  const isTipDateFuture = activeTipDate > today
  const existingTipForDate = dailyTips.find((tip) => tip.date === activeTipDate)
  const isTipDateRegistered = Boolean(existingTipForDate)
  const isTipDateAvailable = activeTipDate.startsWith(tipMonth) && isTipDatePast && !isTipDateRegistered && !isTipDateFuture

  const fulfilledShiftsForTipDate = shifts.filter((s) => s.date === activeTipDate && s.fulfilled === true)
  const fulfilledShiftsCountForTipDate = fulfilledShiftsForTipDate.length
  const uniqueCollaboratorsForTipDate = new Set(fulfilledShiftsForTipDate.map((s) => s.collaboratorId)).size
  const journeysForTipDate = shiftJourneys.filter((j) =>
    shifts.some((s) => s.date === activeTipDate && s.startsAt === j.startsAt),
  )
  const journeysCountForTipDate = journeysForTipDate.length || (fulfilledShiftsCountForTipDate > 0 ? 2 : 0)

  const recentDailyTips = useMemo(() => {
    return [...dailyTips].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  }, [dailyTips])

  const visibleTips = useMemo(
    () => dailyTips.filter((tip) => isInActivePeriodRange(tip.date)),
    [dailyTips, isInActivePeriodRange],
  )

  const visibleAssignments = useMemo(
    () => assignments.filter((assignment) => {
      const tip = dailyTips.find((item) => item.id === assignment.dailyTipId)
      return tip ? isInActivePeriodRange(tip.date) : false
    }),
    [assignments, dailyTips, isInActivePeriodRange],
  )

  const dashboardRows = useMemo(
    () =>
      collaborators
        .filter((collaborator) => dashboardPosition === 'Todos' || collaborator.position === dashboardPosition)
        .map((collaborator) => ({
          collaborator,
          amount: visibleAssignments
            .filter((assignment) => assignment.collaboratorId === collaborator.id)
            .reduce((sum, assignment) => sum + assignment.amount, 0),
          shiftLabel: shifts.some(
            (shift) =>
              shift.collaboratorId === collaborator.id &&
              isInActivePeriodRange(shift.date) &&
              shift.fulfilled === true,
          )
            ? 'Turno cumplido'
            : 'Sin turno validado',
        })),
    [collaborators, dashboardPosition, isInActivePeriodRange, shifts, visibleAssignments],
  )



  const collaboratorCountByPosition = positions.reduce(
    (counts, position) => ({
      ...counts,
      [position]: collaborators.filter((collaborator) => collaborator.position === position).length,
    }),
    {} as Record<Position, number>,
  )

  const visibleValidationShifts = shifts.filter((shift) => isInActivePeriodRange(shift.date))
  const validationWeeks = monthWeekSegments(validationMonth)
  const activeValidationWeek = validationWeeks[validationWeekIndex] || validationWeeks[0]
  
  const selectedValidationDay =
    (validationDay && activeValidationWeek?.days.some((d) => d.date === validationDay && d.inMonth))
      ? validationDay
      : activeValidationWeek?.days.find((d) => d.inMonth)?.date || ''

  const validationWeekShifts = shifts.filter((shift) => activeValidationWeek?.dates.includes(shift.date))
  const dayValidationShifts = validationWeekShifts.filter((shift) => shift.date === selectedValidationDay)

  const positionValidationRows = dayValidationShifts.filter((shift) => {
    const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
    return collaborator?.position === validationPosition
  })

  // Dynamic available journeys for selected Day + Position
  const availableJourneys = shiftJourneys.filter((journey) =>
    positionValidationRows.some((shift) => shift.startsAt === journey.startsAt),
  )

  const activeJourney =
    availableJourneys.find((j) => j.startsAt === validationJourneyStartsAt) ||
    availableJourneys[0] ||
    shiftJourneys[0]

  // Journey shifts (all shifts for Day + Position + activeJourney)
  const journeyValidationRows = positionValidationRows.filter(
    (shift) => shift.startsAt === activeJourney.startsAt,
  )

  // Status counts for selected Day + Position + Journey
  const statusCounts = {
    pending: journeyValidationRows.filter((shift) => shift.fulfilled === null).length,
    attends: journeyValidationRows.filter((shift) => shift.fulfilled === true).length,
    absent: journeyValidationRows.filter((shift) => shift.fulfilled === false).length,
    total: journeyValidationRows.length,
  }

  // Filtered by status
  const statusFilteredRows = journeyValidationRows.filter((shift) => {
    if (validationStatus === 'Pendiente') return shift.fulfilled === null
    if (validationStatus === 'Asiste') return shift.fulfilled === true
    if (validationStatus === 'No asiste') return shift.fulfilled === false
    return true
  })

  // Filtered by search (name or rut)
  const searchNormalized = validationSearch.trim().toLowerCase()
  const filteredJourneyRows = statusFilteredRows.filter((shift) => {
    if (!searchNormalized) return true
    const collaborator = collaborators.find((c) => c.id === shift.collaboratorId)
    if (!collaborator) return false
    const nameMatch = collaborator.name.toLowerCase().includes(searchNormalized)
    const rutMatch = collaborator.rut.toLowerCase().includes(searchNormalized)
    return nameMatch || rutMatch
  })

  // Pagination for the active journey table
  const totalJourneyPages = Math.max(1, Math.ceil(filteredJourneyRows.length / validationPageSize))
  const currentValidationPage = Math.min(Math.max(1, validationPage), totalJourneyPages)
  const paginatedJourneyRows = filteredJourneyRows.slice(
    (currentValidationPage - 1) * validationPageSize,
    currentValidationPage * validationPageSize,
  )

  const validationContext = {
    month: `${monthNames[Number(validationMonth.slice(5, 7)) - 1]} ${validationMonth.slice(0, 4)}`,
    period: activeValidationWeek
      ? `${activeValidationWeek.name}: ${formatShortDate(activeValidationWeek.start)} - ${formatShortDate(activeValidationWeek.end)}`
      : 'Sin semana',
    day: selectedValidationDay
      ? `${formatWeekdayCapitalized(selectedValidationDay)} ${formatShortDate(selectedValidationDay)}`
      : 'Sin día',
    position: validationPosition,
  }

  const peoplePageSize = 15
  const filteredPeople = collaborators.filter(
    (collaborator) => peoplePosition === 'Todos' || collaborator.position === peoplePosition,
  )
  const peopleTotalPages = Math.max(1, Math.ceil(filteredPeople.length / peoplePageSize))
  const peopleRows = filteredPeople.slice((peoplePage - 1) * peoplePageSize, peoplePage * peoplePageSize)
  const shiftMonthShifts = shifts.filter((shift) => shift.date.startsWith(shiftMonth))
  const shiftWeeks = monthWeekSegments(shiftMonth)
  const activeShiftWeek = shiftWeeks[shiftWeekIndex] || shiftWeeks[0]
  const selectedQuickDate =
    quickShiftDate && activeShiftWeek?.workDates.includes(quickShiftDate)
      ? quickShiftDate
      : activeShiftWeek?.workDates[0] || ''

  useEffect(() => {
    if (!toastMessage) return
    const timeout = window.setTimeout(() => setToastMessage(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  useEffect(() => {
    window.localStorage.setItem(
      storedShiftsKey,
      JSON.stringify(shifts.filter((shift) => shift.date >= editableShiftStart)),
    )
  }, [shifts])

  useEffect(() => {
    window.localStorage.setItem(storedClosedShiftKeysKey, JSON.stringify(closedShiftKeys))
  }, [closedShiftKeys])

  useEffect(() => {
    let cancelled = false

    async function loadPersistedSchedule() {
      try {
        const persisted = await apiFetch<BootstrapData>('/api/bootstrap')
        const remoteShifts = persisted.shifts
          .map(normalizeApiShift)
          .filter((shift): shift is Shift => Boolean(shift))
        const remoteClosedKeys = persisted.weeklyShifts
          .map(normalizeApiClosedShiftKey)
          .filter((key): key is string => Boolean(key))

        if (cancelled) return

        if (persisted.collaborators.length > 0) setCollaborators(persisted.collaborators)
        if (persisted.dailyTips.length > 0) setDailyTips(persisted.dailyTips)
        if (persisted.assignments.length > 0) setAssignments(persisted.assignments)
        if (remoteShifts.length > 0) setShifts(remoteShifts)
        if (remoteClosedKeys.length > 0) {
          setClosedShiftKeys(remoteClosedKeys)
        }
      } catch (error) {
        console.error('No se pudo cargar la planificacion persistida.', error)
      }
    }

    void loadPersistedSchedule()

    return () => {
      cancelled = true
    }
  }, [])
  const activeWeekShifts = shiftMonthShifts.filter((shift) => activeShiftWeek?.dates.includes(shift.date))
  const activePositionWeekShifts = activeWeekShifts.filter((shift) => {
    const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
    return collaborator?.position === shiftPosition
  })
  const activeShiftCloseKey = activeShiftWeek ? shiftCloseKey(shiftMonth, activeShiftWeek.index, shiftPosition) : ''
  const activeShiftCreated = Boolean(activeShiftCloseKey && closedShiftKeys.includes(activeShiftCloseKey))
  const activeShiftEditing = Boolean(activeShiftCloseKey && editingShiftKeys.includes(activeShiftCloseKey))
  const canEditActiveShift = !activeShiftCreated || activeShiftEditing
  const completedShiftWeeks = shiftWeeks.flatMap((week) =>
    shiftPositions.map((position) => {
      const weekShifts = shiftMonthShifts.filter((shift) => week.dates.includes(shift.date))
      const completion = getPositionWeekCompletion(weekShifts, collaborators, week.workDates, position)
      return {
        ...completion,
        created: closedShiftKeys.includes(shiftCloseKey(shiftMonth, week.index, position)),
        key: `${week.name}-${position}`,
        position,
        week,
      }
    }),
  )
  const completedShiftGroups = completedShiftWeeks.filter((item) => item.created)
  const createdShiftCount = completedShiftGroups.length
  const totalCreatableShiftWeeks = shiftWeeks.length * shiftPositions.length
  const shiftRuleChecks = (() => {
    const dayCounts = new Map<string, number>()
    const collaboratorDays = new Map<string, string[]>()
    let adminShifts = 0
    let invalidMonthDates = 0
    let invalidHours = 0

    for (const shift of shiftMonthShifts) {
      const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
      const isFixedJourney =
        (shift.startsAt === '10:00' && shift.endsAt === '19:00') ||
        (shift.startsAt === '19:00' && shift.endsAt === '04:00')

      if (collaborator?.position === 'Administrativo') adminShifts += 1
      if (!shift.date.startsWith(shiftMonth)) invalidMonthDates += 1
      if (!isFixedJourney) invalidHours += 1

      dayCounts.set(shift.date, (dayCounts.get(shift.date) || 0) + 1)
      collaboratorDays.set(shift.collaboratorId, [...(collaboratorDays.get(shift.collaboratorId) || []), shift.date])
    }

    const coverageCounts = Array.from(dayCounts.values())
    const evenCoverage = coverageCounts.length === 0 || new Set(coverageCounts).size === 1
    let overFiveConsecutive = 0
    let overTwoSundays = 0

    for (const dates of collaboratorDays.values()) {
      const sorted = Array.from(new Set(dates)).sort()
      let streak = 1
      let sundays = 0

      for (let index = 0; index < sorted.length; index += 1) {
        if (new Date(`${sorted[index]}T12:00:00`).getDay() === 0) sundays += 1
        if (index === 0) continue
        streak = dayDistance(sorted[index - 1], sorted[index]) === 1 ? streak + 1 : 1
        if (streak > 5) overFiveConsecutive += 1
      }

      if (sundays > 2) overTwoSundays += 1
    }

    return [
      {
        label: 'Cargos operativos',
        ok: adminShifts === 0,
        detail: adminShifts === 0 ? 'Administrativos excluidos.' : `${adminShifts} turnos administrativos detectados.`,
      },
      {
        label: 'Dias del mes',
        ok: invalidMonthDates === 0,
        detail: invalidMonthDates === 0 ? 'Sin turnos fuera del mes activo.' : `${invalidMonthDates} turnos fuera del mes activo.`,
      },
      {
        label: 'Jornadas fijas',
        ok: invalidHours === 0,
        detail: '10:00-19:00 y 19:00-04:00.',
      },
      {
        label: 'Cobertura pareja',
        ok: evenCoverage,
        detail: evenCoverage ? 'Todos los dias tienen la misma dotacion.' : 'Hay dias con menos colaboradores.',
      },
      {
        label: 'Maximo 5 dias seguidos',
        ok: overFiveConsecutive === 0,
        detail: overFiveConsecutive === 0 ? 'Sin excesos detectados.' : `${overFiveConsecutive} excesos detectados.`,
      },
      {
        label: 'Maximo 2 domingos',
        ok: overTwoSundays === 0,
        detail: overTwoSundays === 0 ? 'Sin excesos de domingos.' : `${overTwoSundays} colaboradores excedidos.`,
      },
    ]
  })()

  const shiftIncidents = (() => {
    const incidents: { title: string; detail: string; severity: 'Alta' | 'Media' | 'Baja' }[] = []
    const dates = monthDates(shiftMonth)

    for (const position of shiftPositions) {
      const target = maxDailyShiftCoverageByPosition[position as keyof typeof maxDailyShiftCoverageByPosition]
      const positionCollaborators = collaborators.filter((collaborator) => collaborator.position === position)
      const sundayDates = dates.filter((date) => new Date(`${date}T12:00:00`).getDay() === 0)
      const sundayDemand = sundayDates.length * target
      const sundayCapacity = positionCollaborators.length * 2
      const underCoveredDates = dates.filter((date) => {
        const total = shiftMonthShifts.filter((shift) => {
          const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
          return shift.date === date && collaborator?.position === position
        }).length
        return total < target
      })

      if (sundayDemand > sundayCapacity) {
        incidents.push({
          severity: 'Alta',
          title: `${position}: domingos incompatibles con el tope diario`,
          detail: `Septiembre requiere ${sundayDemand} cupos dominicales y la regla permite ${sundayCapacity}. Se respetan los 2 domingos maximos por colaborador, por eso puede bajar la cobertura.`,
        })
      }

      if (underCoveredDates.length > 0) {
        incidents.push({
          severity: 'Media',
          title: `${position}: cobertura bajo tope en ${underCoveredDates.length} dias`,
          detail: `Tope diario ${target}. Dias afectados: ${underCoveredDates.slice(0, 6).map(formatShortDate).join(', ')}${underCoveredDates.length > 6 ? '...' : ''}.`,
        })
      }
    }

    const invalidAdminShifts = shiftMonthShifts.filter((shift) => {
      const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
      return collaborator?.position === 'Administrativo'
    })
    if (invalidAdminShifts.length > 0) {
      incidents.push({
        severity: 'Alta',
        title: 'Administrativos con turnos operativos',
        detail: `${invalidAdminShifts.length} asignaciones no permitidas.`,
      })
    }

    const invalidHourShifts = shiftMonthShifts.filter(
      (shift) =>
        !((shift.startsAt === '10:00' && shift.endsAt === '19:00') ||
          (shift.startsAt === '19:00' && shift.endsAt === '04:00')),
    )
    if (invalidHourShifts.length > 0) {
      incidents.push({
        severity: 'Alta',
        title: 'Jornadas fuera de horario permitido',
        detail: `${invalidHourShifts.length} asignaciones no cumplen 10:00-19:00 o 19:00-04:00.`,
      })
    }

    for (const collaborator of collaborators) {
      const collaboratorDates = shiftMonthShifts
        .filter((shift) => shift.collaboratorId === collaborator.id)
        .map((shift) => shift.date)
      const sundayCount = collaboratorDates.filter((date) => new Date(`${date}T12:00:00`).getDay() === 0).length

      if (exceedsMaxConsecutiveWorkDays(collaboratorDates)) {
        incidents.push({
          severity: 'Alta',
          title: `${collaborator.name}: supera 5 dias seguidos`,
          detail: 'Debe corregirse antes de cerrar o validar turnos.',
        })
      }
      if (sundayCount > 2) {
        incidents.push({
          severity: 'Alta',
          title: `${collaborator.name}: supera 2 domingos`,
          detail: `Tiene ${sundayCount} domingos asignados en ${shiftMonth}.`,
        })
      }
    }

    return incidents
  })()

  const ruleChecks = [
    {
      label: 'Colaborador unico',
      ok:
        collaborators.length === new Set(collaborators.map((item) => normalizeRut(item.rut))).size &&
        collaborators.length === new Set(collaborators.map((item) => normalizeFullName(item.name))).size,
      detail: 'La carga masiva o manual rechaza RUT y nombres ya registrados.',
    },
    {
      label: 'Turno requerido',
      ok: shifts.length > 0,
      detail: 'No se asignan propinas a personas sin turno para el dia cargado.',
    },
    {
      label: 'Turno cumplido',
      ok: shifts.some((shift) => shift.fulfilled === true),
      detail: 'Solo los turnos validados como cumplidos entran al reparto.',
    },
    {
      label: 'Porcentajes cerrados',
      ok: Math.round(Object.values(tipPercentages).reduce((sum, value) => sum + value, 0) * 100) === 100,
      detail: 'Garzon 30%, cocina 25%, barra 20%, anfitrion 15%, guardia 5%, administrativo 5%.',
    },
  ]

  function addCollaborator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const rut = normalizeRut(String(form.get('rut') || ''))
    const firstName = String(form.get('firstName') || '').trim()
    const firstLastName = String(form.get('firstLastName') || '').trim()
    const secondLastName = String(form.get('secondLastName') || '').trim()
    const phone = String(form.get('phone') || '').trim()
    const address = String(form.get('address') || '').trim()
    const position = String(form.get('position')) as Position
    const startDate = String(form.get('startDate') || '')

    if (!rut || !firstName || !firstLastName || !secondLastName || !phone || !address || !startDate) {
      return setMessage('Completa todos los datos requeridos del colaborador.')
    }
    if (isFutureDate(startDate)) return setMessage('La fecha de ingreso no puede ser superior a hoy.')
    if (collaborators.some((item) => normalizeRut(item.rut) === rut)) {
      return setMessage(`No se cargo ${rut}: el RUT ya existe.`)
    }

    const name = `${firstName} ${firstLastName} ${secondLastName}`
    if (collaborators.some((item) => normalizeFullName(item.name) === normalizeFullName(name))) {
      return setMessage(`No se cargo ${name}: el nombre ya existe.`)
    }
    setCollaborators((current) => [
      ...current,
      { id: crypto.randomUUID(), rut, firstName, firstLastName, secondLastName, name, phone, address, position, startDate, active: true },
    ])
    event.currentTarget.reset()
    setMessage(`${name} fue agregado correctamente.`)
  }

  function saveImportedCollaborators(rows: string[][], source: string) {
    const existingRuts = new Set(collaborators.map((item) => normalizeRut(item.rut)))
    const existingNames = new Set(collaborators.map((item) => normalizeFullName(item.name)))
    const imported: Collaborator[] = []
    let rejected = 0

    for (const row of rows) {
      const cells = row.map((cell) => String(cell || '').trim())
      if (cells.length < 8 || cells[0].toLowerCase() === 'rut') continue
      const [rutRaw, firstName, firstLastName, secondLastName, phone, address, positionRaw, startDate] = cells
      const rut = normalizeRut(rutRaw)
      const name = `${firstName} ${firstLastName} ${secondLastName}`
      const position = positions.find((item) => item.toLowerCase() === positionRaw.toLowerCase())
      if (!firstName || !firstLastName || !secondLastName || !rut || !phone || !address || !position || !startDate || isFutureDate(startDate) || existingRuts.has(rut) || existingNames.has(normalizeFullName(name))) {
        rejected += 1
        continue
      }
      existingRuts.add(rut)
      existingNames.add(normalizeFullName(name))
      imported.push({
        id: crypto.randomUUID(),
        rut,
        firstName,
        firstLastName,
        secondLastName,
        name,
        phone,
        address,
        position,
        startDate,
        active: true,
      })
    }

    setCollaborators((current) => [...current, ...imported])
    setPeoplePage(1)
    setMessage(`${source}: ${imported.length} colaboradores registrados, ${rejected} rechazados.`)
  }

  async function importCollaboratorsFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setMessage('Por seguridad, la carga masiva acepta solo CSV separado por punto y coma.')
      event.target.value = ''
      return
    }

    const raw = await file.text()
    const rows = raw.trim().split('\n').map((row) => row.split(';').map((cell) => cell.trim()))
    saveImportedCollaborators(rows, 'Archivo CSV cargado')
    event.target.value = ''
  }

  function isShiftProtected(shift: Shift) {
    // 1. Turno con asistencia asistida/validada
    if (shift.fulfilled === true || shift.fulfilled !== null) return true

    // 2. Propina cargada o asignada para esa fecha
    if (dailyTips.some((tip) => tip.date === shift.date)) return true
    if (
      assignments.some((assignment) => {
        const tip = dailyTips.find((t) => t.id === assignment.dailyTipId)
        return tip?.date === shift.date
      })
    ) {
      return true
    }

    return false
  }

  function clearMonthShifts(month: string) {
    const monthShifts = shifts.filter((shift) => shift.date.startsWith(month))
    if (!monthShifts.length) return setMessage('El mes seleccionado no tiene turnos asignados.')

    const protectedShifts = monthShifts.filter(isShiftProtected)
    const removableShifts = monthShifts.filter((shift) => !isShiftProtected(shift))

    if (removableShifts.length === 0) {
      return setMessage('No se eliminó ningún turno: todos los turnos del mes tienen asistencia asistida o propinas asignadas.')
    }

    const removableIds = new Set(removableShifts.map((shift) => shift.id))
    setShifts((current) => current.filter((shift) => !removableIds.has(shift.id)))

    removableShifts.forEach((shift) => {
      void apiFetch<void>(`/api/shifts/${shift.id}`, { method: 'DELETE' }).catch((error) => {
        console.error('No se pudo eliminar el turno en base de datos.', error)
      })
    })

    setClosedShiftKeys((current) =>
      current.filter((key) => {
        if (!key.startsWith(`${month}:`)) return true
        const parts = key.split(':')
        const m = parts[0]
        const wIdx = Number(parts[1])
        const pos = parts[2]

        const weekObj = monthWeekSegments(m)[wIdx]
        if (!weekObj) return false

        const remainingShifts = shifts.filter(
          (s) =>
            !removableIds.has(s.id) &&
            s.date.startsWith(m) &&
            weekObj.workDates.includes(s.date) &&
            collaborators.find((c) => c.id === s.collaboratorId)?.position === pos,
        )
        return remainingShifts.length > 0
      }),
    )
    setDraggedCollaboratorId(null)

    if (protectedShifts.length > 0) {
      setMessage(`Se eliminaron ${removableShifts.length} turnos. Se conservaron ${protectedShifts.length} turnos por tener asistencia asistida o propinas asignadas.`)
    } else {
      setMessage(`Turnos de ${month} eliminados correctamente.`)
    }
  }

  function canDropCollaborator(collaboratorId: string, date: string, startsAt: string) {
    const collaborator = collaborators.find((item) => item.id === collaboratorId)
    if (!collaborator) return 'Colaborador no encontrado.'
    if (!shiftPositions.includes(collaborator.position)) return 'Administrativos no tienen turno.'
    if (collaborator.position !== shiftPosition) return `Selecciona la pestaña ${collaborator.position} para asignar este colaborador.`
    if (date.slice(0, 7) !== shiftMonth) return 'El turno debe pertenecer al mes activo.'
    if (shifts.some((shift) => shift.collaboratorId === collaboratorId && shift.date === date)) {
      return 'El colaborador ya tiene turno ese dia.'
    }
    if (!['10:00', '19:00'].includes(startsAt)) return 'Jornada invalida.'

    const dates = shifts
      .filter((shift) => shift.collaboratorId === collaboratorId)
      .map((shift) => shift.date)
      .concat(date)
    if (exceedsMaxConsecutiveWorkDays(dates)) return 'No puede superar 5 dias laborales seguidos.'

    let sundays = 0
    for (let index = 0; index < dates.length; index += 1) {
      if (new Date(`${dates[index]}T12:00:00`).getDay() === 0) sundays += 1
    }
    if (sundays > 2) return 'No puede superar 2 domingos trabajados.'
    return ''
  }

  function dropCollaborator(date: string, startsAt: string, endsAt: string) {
    if (!draggedCollaboratorId) return
    if (!canEditActiveShift) {
      setDraggedCollaboratorId(null)
      return setMessage('Activa Editar Turno para modificar un turno creado.')
    }
    const error = canDropCollaborator(draggedCollaboratorId, date, startsAt)
    if (error) {
      setMessage(error)
      setDraggedCollaboratorId(null)
      return
    }

    addShift(draggedCollaboratorId, date, startsAt, endsAt)
    setDraggedCollaboratorId(null)
  }

  function addShift(collaboratorId: string, date: string, startsAt: string, endsAt: string) {
    const shift = {
      id: crypto.randomUUID(),
      collaboratorId,
      date,
      startsAt,
      endsAt,
      fulfilled: null,
    }

    setShifts((current) => [
      ...current,
      shift,
    ])
    persistShift(shift)
  }

  function persistShift(shift: Shift) {
    void apiFetch<Shift>('/api/shifts', {
      json: shift,
      method: 'POST',
    }).catch((error) => {
      console.error('No se pudo persistir el turno en base de datos.', error)
    })
  }

  function persistWeeklyShift() {
    if (!activeShiftWeek) return

    void apiFetch('/api/shift-weeks', {
      json: {
        month: shiftMonth,
        weekIndex: activeShiftWeek.index,
        weekName: activeShiftWeek.name,
        position: shiftPosition,
        startDate: activeShiftWeek.start,
        endDate: activeShiftWeek.end,
      },
      method: 'POST',
    }).catch((error) => {
      console.error('No se pudo persistir el turno semanal en base de datos.', error)
    })
  }

  function assignCollaboratorToNextAvailableDay(collaboratorId: string) {
    if (!canEditActiveShift) return setMessage('Activa Editar Turno para modificar un turno creado.')

    const weekWorkDates = activeShiftWeek?.workDates || []
    const activeStartDate = selectedQuickDate || weekWorkDates[0]
    const dates = weekWorkDates.filter((date) => date >= activeStartDate)
    const selectedJourney = shiftJourneys.find((journey) => journey.startsAt === quickShiftStartsAt) || shiftJourneys[0]

    for (const date of dates) {
      if (shifts.some((shift) => shift.collaboratorId === collaboratorId && shift.date === date)) continue

      const error = canDropCollaborator(collaboratorId, date, selectedJourney.startsAt)
      if (error) continue
      addShift(collaboratorId, date, selectedJourney.startsAt, selectedJourney.endsAt)
      setQuickShiftDate(date)
      return
    }

    setMessage(`No hay dias disponibles en ${activeShiftWeek?.name || 'esta semana'} sin romper la regla de maximo 5 dias seguidos.`)
  }

  function removeDayShifts(date: string) {
    if (!canEditActiveShift) return setMessage('Activa Editar Turno para modificar un turno creado.')

    const targetShifts = activePositionWeekShifts.filter((shift) => shift.date === date)
    if (!targetShifts.length) return setMessage('Ese dia no tiene asignaciones para eliminar.')

    const removableShifts = targetShifts.filter((shift) => !isShiftProtected(shift))
    if (!removableShifts.length) {
      return setMessage('No se pueden borrar los turnos de este día porque tienen asistencia asistida o propinas asignadas.')
    }

    const shiftIds = new Set(removableShifts.map((shift) => shift.id))
    setShifts((current) => current.filter((shift) => !shiftIds.has(shift.id)))
    shiftIds.forEach((shiftId) => {
      void apiFetch<void>(`/api/shifts/${shiftId}`, { method: 'DELETE' }).catch((error) => {
        console.error('No se pudo eliminar el turno en base de datos.', error)
      })
    })

    if (removableShifts.length < targetShifts.length) {
      setMessage(`Se eliminaron ${removableShifts.length} turnos del ${formatShortDate(date)}. ${targetShifts.length - removableShifts.length} se conservaron por tener asistencia asistida o propinas asignadas.`)
    } else {
      setMessage(`Asignaciones del ${formatShortDate(date)} eliminadas para ${shiftPosition}.`)
    }
  }

  function copyDayShifts(date: string) {
    const sourceShifts = activePositionWeekShifts.filter((shift) => shift.date === date)
    if (!sourceShifts.length) return setMessage(`El ${formatShortDate(date)} no tiene asignaciones para copiar.`)

    setCopiedShiftDay(date)
    setMessage(`Dia ${formatShortDate(date)} copiado para ${shiftPosition}.`)
  }

  function pasteCopiedDayShifts(targetDate: string) {
    if (!canEditActiveShift) return setMessage('Activa Editar Turno para modificar un turno creado.')
    if (!copiedShiftDay) return setMessage('Primero copia un dia con asignaciones.')

    const sourceShifts = activePositionWeekShifts.filter((shift) => shift.date === copiedShiftDay)
    if (!sourceShifts.length) return setMessage('El dia copiado ya no tiene asignaciones disponibles.')

    const nextShifts: Shift[] = []
    let skipped = 0

    for (const sourceShift of sourceShifts) {
      const existingShifts = [...shifts, ...nextShifts]
      const alreadyAssigned = existingShifts.some(
        (shift) => shift.collaboratorId === sourceShift.collaboratorId && shift.date === targetDate,
      )
      const collaboratorDates = existingShifts
        .filter((shift) => shift.collaboratorId === sourceShift.collaboratorId)
        .map((shift) => shift.date)
        .concat(targetDate)

      if (alreadyAssigned || exceedsMaxConsecutiveWorkDays(collaboratorDates)) {
        skipped += 1
        continue
      }

      nextShifts.push({
        id: crypto.randomUUID(),
        collaboratorId: sourceShift.collaboratorId,
        date: targetDate,
        startsAt: sourceShift.startsAt,
        endsAt: sourceShift.endsAt,
        fulfilled: null,
      })
    }

    if (!nextShifts.length) return setMessage('No se clonaron asignaciones: ya existian o incumplian reglas.')
    setShifts((current) => [...current, ...nextShifts])
    nextShifts.forEach(persistShift)
    setMessage(`Asignaciones pegadas desde ${formatShortDate(copiedShiftDay)} hacia ${formatShortDate(targetDate)}. ${nextShifts.length} agregadas, ${skipped} omitidas.`)
  }

  function createActiveShiftWeek() {
    if (!activeShiftWeek) return
    const dayCounts = activeShiftWeek.workDates.map((date) => {
      const firstCount = activePositionWeekShifts.filter((shift) => shift.date === date && shift.startsAt === '10:00').length
      const secondCount = activePositionWeekShifts.filter((shift) => shift.date === date && shift.startsAt === '19:00').length
      return {
        date,
        firstCount,
        secondCount,
        total: firstCount + secondCount,
      }
    })
    const missingFirst = dayCounts.filter((day) => day.firstCount === 0)
    const missingSecond = dayCounts.filter((day) => day.secondCount === 0)
    const expectedTotal = Math.max(...dayCounts.map((day) => day.total))
    const lowerCoverageDays = dayCounts.filter((day) => day.total < expectedTotal)

    if (missingFirst.length || missingSecond.length) {
      const missingDates = Array.from(new Set([...missingFirst, ...missingSecond].map((day) => formatShortDate(day.date)))).join(', ')
      const detail = `No se puede crear Turno ${activeShiftWeek.name}: faltan asignaciones en ${missingDates}.`
      setShiftCreateMessage(detail)
      return setMessage(detail)
    }
    if (lowerCoverageDays.length) {
      const detail = `No se puede crear Turno ${activeShiftWeek.name}: hay dias con menos colaboradores (${lowerCoverageDays.map((day) => `${formatShortDate(day.date)}: ${day.total}/${expectedTotal}`).join(', ')}).`
      setShiftCreateMessage(detail)
      return setMessage(detail)
    }
    setClosedShiftKeys((current) => Array.from(new Set([...current, shiftCloseKey(shiftMonth, activeShiftWeek.index, shiftPosition)])))
    setEditingShiftKeys((current) => current.filter((key) => key !== shiftCloseKey(shiftMonth, activeShiftWeek.index, shiftPosition)))
    persistWeeklyShift()
    setToastMessage(
      `Turno ${activeShiftWeek.name} creado satisfactoriamente para ${shiftPosition}.`,
    )
    setShiftCreateMessage('')
    setMessage('')
  }

  function clonePreviousWeekAssignment() {
    if (!canEditActiveShift) return setMessage('Activa Editar Turno para modificar un turno creado.')
    if (!activeShiftWeek) return
    if (shiftWeekIndex === 0) return setMessage('No hay una semana anterior dentro del mes seleccionado.')

    const previousWeek = shiftWeeks[shiftWeekIndex - 1]
    const sourceShifts = shiftMonthShifts.filter((shift) => {
      const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
      return previousWeek.dates.includes(shift.date) && collaborator?.position === shiftPosition
    })

    if (!sourceShifts.length) return setMessage(`No hay asignacion anterior para ${shiftPosition}.`)
    if (!previousWeek.workDates.length) return setMessage('La semana anterior no tiene dias del mes para clonar.')

    const nextShifts: Shift[] = []
    let skipped = 0

    for (const targetDate of activeShiftWeek.workDates) {
      const targetIndex = activeShiftWeek.workDates.indexOf(targetDate)
      const sourceDate = previousWeek.workDates[targetIndex % previousWeek.workDates.length]
      const sourceDayShifts = sourceShifts.filter((shift) => shift.date === sourceDate)

      for (const sourceShift of sourceDayShifts) {
        const alreadyAssigned = [...shifts, ...nextShifts].some(
          (shift) => shift.collaboratorId === sourceShift.collaboratorId && shift.date === targetDate,
        )
        const collaboratorDates = [...shifts, ...nextShifts]
          .filter((shift) => shift.collaboratorId === sourceShift.collaboratorId)
          .map((shift) => shift.date)
          .concat(targetDate)

        if (alreadyAssigned || exceedsMaxConsecutiveWorkDays(collaboratorDates)) {
          skipped += 1
          continue
        }

        nextShifts.push({
          id: crypto.randomUUID(),
          collaboratorId: sourceShift.collaboratorId,
          date: targetDate,
          startsAt: sourceShift.startsAt,
          endsAt: sourceShift.endsAt,
          fulfilled: null,
        })
      }
    }

    if (!nextShifts.length) return setMessage('No se clonaron asignaciones: todas incumplian reglas o ya estaban asignadas.')
    setShifts((current) => [...current, ...nextShifts])
    nextShifts.forEach(persistShift)
    setMessage(`Asignacion anterior clonada para ${shiftPosition}. ${nextShifts.length} asignaciones agregadas, ${skipped} omitidas por reglas.`)
  }

  function clonePreviousMonthShifts(month: string) {
    const sourceMonth = previousMonth(month)
    const targetDates = businessShiftDates(month)
    const sourceDates = businessShiftDates(sourceMonth)
    const sourceShifts = shifts.filter((shift) => shift.date.startsWith(sourceMonth))
    if (month > maxShiftMonth) return setMessage('Solo puedes clonar turnos hasta el mes siguiente.')
    if (shifts.some((shift) => shift.date.startsWith(month))) return setMessage('El mes destino ya tiene asignaciones.')
    if (!targetDates.length) return setMessage('No hay dias disponibles en el mes destino.')
    if (!sourceShifts.length) {
      return setMessage('No hay asignaciones del mes anterior para clonar.')
    }

    const nextShifts: Shift[] = []
    let skipped = 0

    for (const [index, date] of targetDates.entries()) {
      const sourceDate = sourceDates[index % sourceDates.length]
      const shiftsToClone = sourceShifts
        .filter((shift) => shift.date === sourceDate)
        .filter((shift) => {
          const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
          return collaborator && shiftPositions.includes(collaborator.position)
        })

      for (const shift of shiftsToClone) {
        const collaboratorDates = [...shifts, ...nextShifts]
          .filter((item) => item.collaboratorId === shift.collaboratorId)
          .map((item) => item.date)
          .concat(date)

        if (exceedsMaxConsecutiveWorkDays(collaboratorDates)) {
          skipped += 1
          continue
        }

        nextShifts.push({
          id: crypto.randomUUID(),
          collaboratorId: shift.collaboratorId,
          date,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          fulfilled: null,
        })
      }
    }

    setShifts((current) => [...current, ...nextShifts])
    nextShifts.forEach(persistShift)
    setMessage(`Asignaciones clonadas desde ${sourceMonth} hacia ${month}. ${nextShifts.length} agregadas, ${skipped} omitidas por reglas.`)
  }



  function validateShiftAttendance(shiftId: string, fulfilled: boolean) {
    setShifts((current) => current.map((item) => item.id === shiftId ? { ...item, fulfilled } : item))
    void apiFetch<Shift>(`/api/shifts/${shiftId}/validation`, {
      json: { fulfilled },
      method: 'PATCH',
    }).catch((error) => {
      console.error('No se pudo persistir la asistencia.', error)
    })
  }



  const totalTips = visibleTips.reduce((sum, tip) => sum + tip.amount, 0)
  const assignedTotal = visibleAssignments.reduce((sum, assignment) => sum + assignment.amount, 0)
  const activeRole = roles.find((role) => role.id === roleId) || roles[0]
  const activeMenuRole = typeof activeMenu === 'number' ? activeMenu : roleId
  const activeWorkspaceMenu = activeMenu !== 'project' && activeMenu !== 'incidents'
  const periodText = period === 'day' ? 'dia' : period === 'week' ? 'semana' : period === 'range' ? 'rango' : 'mes'
  const selectedWeek = weekRange(selectedDate)

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <Coins aria-hidden />
          <div>
            <strong>Pub Propinas</strong>
            <span>Administracion operacional</span>
          </div>
        </div>
        <label>
          Perfil activo
          <select
            value={roleId}
            onChange={(event) => {
              const nextRole = Number(event.target.value) as RoleId
              setRoleId(nextRole)
              setActiveMenu(nextRole)
            }}
          >
            {roleDisplayOrder.map((id) => {
              const role = roles.find((item) => item.id === id) || roles[0]
              return (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
              )
            })}
          </select>
        </label>
        <p className="active-role-description">{activeRole.description}</p>
        <nav>
          {roleDisplayOrder.map((id) => {
            const role = roles.find((item) => item.id === id) || roles[0]
            return (
            <button
              type="button"
              className={activeMenu === role.id ? 'nav-pill active' : 'nav-pill'}
              key={role.id}
              onClick={() => {
                setRoleId(role.id)
                setActiveMenu(role.id)
              }}
            >
              {role.name}
            </button>
            )
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span>Primer hito</span>
            <h1>Administracion de propinas</h1>
          </div>
        </header>

        <section className="panel roadmap-panel">
          <div className="panel-title">
            <Route aria-hidden />
            <h2>Roadmap operativo</h2>
          </div>
          <div className="roadmap">
            {roadmapSteps.map((step) => (
              <article
                className={step.roleIds.includes(activeMenuRole) ? 'roadmap-step selected' : 'roadmap-step'}
                key={step.title}
              >
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        {toastMessage && <div className="toast-notice">{toastMessage}</div>}


        {activeWorkspaceMenu && (activeMenuRole === 0 || activeMenuRole === 7) && (
        <section className="period-panel" aria-label="Periodo del resumen">
          <label>
            Año
            <select
              value={activeYear}
              onChange={(event) => {
                const nextYear = event.target.value
                const nextMonth = `${nextYear}-01`
                setActiveYear(nextYear)
                setActiveMonth(nextMonth)
                setSelectedDate(nextMonth === today.slice(0, 7) ? today : monthEnd(nextMonth))
                setRangeStart(`${nextMonth}-01`)
                setRangeEnd(nextMonth === today.slice(0, 7) ? today : monthEnd(nextMonth))
              }}
            >
              {availableYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            Mes
            <select
              value={activeMonth}
              onChange={(event) => {
                const monthValue = event.target.value
                setActiveMonth(monthValue)
                setSelectedDate(monthValue === today.slice(0, 7) ? today : monthEnd(monthValue))
                setRangeStart(`${monthValue}-01`)
                setRangeEnd(monthValue === today.slice(0, 7) ? today : monthEnd(monthValue))
              }}
            >
              {monthNames.map((month, index) => {
                const monthValue = `${activeYear}-${String(index + 1).padStart(2, '0')}`
                if (monthValue > today.slice(0, 7)) return null
                return (
                  <option key={monthValue} value={monthValue}>
                    {month}
                  </option>
                )
              })}
            </select>
          </label>
          <div className="range-tabs" role="tablist" aria-label="Vista del resumen">
            <button
              type="button"
              className={period === 'day' ? 'range-tab active' : 'range-tab'}
              onClick={() => setPeriod('day')}
            >
              Dia
            </button>
            <button
              type="button"
              className={period === 'week' ? 'range-tab active' : 'range-tab'}
              onClick={() => setPeriod('week')}
            >
              Semana
            </button>
            <button
              type="button"
              className={period === 'month' ? 'range-tab active' : 'range-tab'}
              onClick={() => setPeriod('month')}
            >
              Mes
            </button>
            <button
              type="button"
              className={period === 'range' ? 'range-tab active' : 'range-tab'}
              onClick={() => setPeriod('range')}
            >
              Rango
            </button>
          </div>
          {period !== 'range' && (
            <label>
              {period === 'week' ? 'Fecha de referencia' : 'Fecha de corte'}
              <input
                type="date"
                value={selectedDate}
                max={today}
                onKeyDown={blockManualDateInput}
                onPaste={blockManualDateInput}
                onDrop={blockManualDateInput}
                onChange={(event) => {
                  setSelectedDate(event.target.value)
                  setActiveMonth(event.target.value.slice(0, 7))
                  setActiveYear(event.target.value.slice(0, 4))
                  setRangeEnd(event.target.value)
                }}
              />
            </label>
          )}
          {period === 'range' && (
            <>
              <label>
                Desde
                <input
                  type="date"
                  value={rangeStart}
                  max={rangeEnd > today ? today : rangeEnd}
                  onKeyDown={blockManualDateInput}
                  onPaste={blockManualDateInput}
                  onDrop={blockManualDateInput}
                  onChange={(event) => {
                    setRangeStart(event.target.value)
                    setActiveMonth(event.target.value.slice(0, 7))
                    setActiveYear(event.target.value.slice(0, 4))
                  }}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  max={today}
                  onKeyDown={blockManualDateInput}
                  onPaste={blockManualDateInput}
                  onDrop={blockManualDateInput}
                  onChange={(event) => {
                    setRangeEnd(event.target.value)
                    setSelectedDate(event.target.value)
                  }}
                />
              </label>
            </>
          )}
          <div className="period-help">
            {period === 'day' && `Dia seleccionado: ${formatShortDate(selectedDate)}`}
            {period === 'week' &&
              `Semana: ${formatShortDate(selectedWeek.start)} - ${formatShortDate(selectedWeek.end)}`}
            {period === 'month' && `Acumulado: ${formatShortDate(monthStart)} - ${formatShortDate(cutoffDate)}`}
            {period === 'range' && `Rango: ${formatShortDate(rangeStart)} - ${formatShortDate(rangeEnd)}`}
          </div>
        </section>
        )}

        {activeWorkspaceMenu && (
        <section className="stats-grid">
          <StatCard label="Colaboradores" value={String(collaborators.length)} />
          <StatCard label={`Propinas cargadas ${periodText}`} value={currency(totalTips)} tone="good" />
          <StatCard label={`Propinas asignadas ${periodText}`} value={currency(assignedTotal)} />
          <StatCard label="Turnos por validar" value={String(visibleValidationShifts.filter((shift) => shift.fulfilled === null).length)} tone="warn" />
        </section>
        )}

        {activeMenu === 'project' && (
          <section className="panel project-panel">
            <div className="panel-title">
              <FolderKanban aria-hidden />
              <h2>Proyecto</h2>
            </div>

            <div className="project-research">
              <strong>Modificaciones Antigravity</strong>
              <div className="project-research-grid">
                {antigravityModifications.map((mod) => (
                  <article key={mod.title}>
                    <span>{mod.title}</span>
                    <p>{mod.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="project-grid">
              <article>
                <strong>Reglas Antigravity (Interpretación actual)</strong>
                <ul>
                  {antigravityInterpretedRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </article>
              <article>
                <strong>Reglas Antigravity (Sugeridas que faltan)</strong>
                <ul>
                  {antigravityMissingRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="project-research">
              <strong>Reglas Hardcodeadas Identificadas en el Proyecto</strong>
              <div className="project-research-grid">
                {identifiedHardcodedRules.map((item) => (
                  <article key={item.category}>
                    <span>{item.category}</span>
                    <small style={{ color: '#2563eb', marginTop: '2px', marginBottom: '6px' }}>{item.location}</small>
                    <ul style={{ paddingLeft: '16px', margin: '4px 0 0', fontSize: '13px', color: '#475569', lineHeight: '1.45' }}>
                      {item.rules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>

            <div className="project-grid">
              <article>
                <strong>Reglas de negocio</strong>
                <ul>
                  {businessRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </article>
              <article>
                <strong>Mejoras recomendadas</strong>
                <ul>
                  {projectImprovements.map((improvement) => (
                    <li key={improvement}>{improvement}</li>
                  ))}
                </ul>
              </article>
            </div>
            <div className="project-research">
              <strong>Sistemas similares analizados</strong>
              <div className="project-research-grid">
                {similarSystems.map((system) => (
                  <article key={system.name}>
                    <span>{system.name}</span>
                    <p>{system.description}</p>
                    <small>{system.opportunity}</small>
                  </article>
                ))}
              </div>
            </div>
            <div className="project-research">
              <strong>Errores y riesgos encapsulados</strong>
              <div className="project-risk-list">
                <p>Cargas externas con datos incompletos o formatos no reconocidos se rechazan sin modificar registros existentes.</p>
                <p>Asignaciones que no cumplen reglas de turno quedan omitidas y se informa el conteo de elementos no aplicados.</p>
                <p>Cuando no es posible determinar una fuente real, el sistema mantiene la operacion pendiente y evita asignar propinas.</p>
              </div>
            </div>
          </section>
        )}

        {activeMenu === 'incidents' && (
          <section className="panel project-panel">
            <div className="panel-title">
              <ShieldCheck aria-hidden />
              <h2>Incidencias</h2>
            </div>
            <div className="project-research">
              <strong>Validacion de reglas para {monthNames[Number(shiftMonth.slice(5, 7)) - 1]} {shiftMonth.slice(0, 4)}</strong>
              <div className="project-risk-list">
                {shiftIncidents.length > 0 ? (
                  shiftIncidents.map((incident) => (
                    <p key={`${incident.title}-${incident.detail}`}>
                      <b>{incident.severity}</b> · {incident.title}: {incident.detail}
                    </p>
                  ))
                ) : (
                  <p>Sin incidencias detectadas para el mes seleccionado.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeMenuRole === 0 && activeWorkspaceMenu && (
          <section className="panel">
            <div className="panel-title">
              <Users aria-hidden />
              <h2>Dashboard de colaboradores</h2>
            </div>
            <div className="tabs" role="tablist" aria-label="Filtro por cargo">
              <button
                type="button"
                className={dashboardPosition === 'Todos' ? 'tab active' : 'tab'}
                onClick={() => setDashboardPosition('Todos')}
              >
                Todos ({collaborators.length})
              </button>
              {positions.map((position) => (
                <button
                  type="button"
                  className={dashboardPosition === position ? 'tab active' : 'tab'}
                  key={position}
                  onClick={() => setDashboardPosition(position)}
                >
                  {position} ({collaboratorCountByPosition[position]}/{requiredCollaboratorsByPosition[position]})
                </button>
              ))}
            </div>
            <div className="cards-grid">
              {dashboardRows.map((row) => (
                <CollaboratorCard key={row.collaborator.id} {...row} />
              ))}
            </div>
          </section>
        )}

        {can(activeMenuRole, 'formats') && activeWorkspaceMenu && (
        <section className="panel">
          <div className="panel-title">
            <FileSpreadsheet aria-hidden />
            <h2>Formatos de carga</h2>
          </div>
          <div className="formats-grid">
            {uploadFormats.map((format) => (
              <article className="format-card" key={format.name}>
                <div>
                  <strong>{format.name}</strong>
                  <p>{format.description}</p>
                </div>
                <div className="format-grid" style={{ gridTemplateColumns: `repeat(${format.headers.length}, minmax(90px, 1fr))` }}>
                  {format.headers.map((header) => (
                    <span key={header}>{header}</span>
                  ))}
                </div>
                <code>{format.example}</code>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => downloadTemplate(format.filename, format.headers, format.example)}
                >
                  <Download size={17} aria-hidden />
                  CSV
                </button>
              </article>
            ))}
          </div>
        </section>
        )}

        <section className="flow-grid">
          {can(activeMenuRole, 'people') && activeWorkspaceMenu && (
            <section className="panel people-panel">
              <div className="panel-title">
                <UserPlus aria-hidden />
                <h2>Gestion de personas</h2>
              </div>
              <div className="people-actions">
                <form className="person-form" onSubmit={addCollaborator}>
                  <input name="rut" placeholder="RUT" />
                  <input name="firstName" placeholder="Nombre" />
                  <input name="firstLastName" placeholder="Primer apellido" />
                  <input name="secondLastName" placeholder="Segundo apellido" />
                  <input name="phone" placeholder="Telefono" />
                  <input name="address" placeholder="Direccion" />
                  <select name="position" defaultValue="Garzon">
                    {positions.map((position) => (
                      <option key={position}>{position}</option>
                    ))}
                  </select>
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={today}
                    max={today}
                    onKeyDown={blockManualDateInput}
                    onPaste={blockManualDateInput}
                    onDrop={blockManualDateInput}
                  />
                  <button type="submit">Registrar colaborador</button>
                </form>
                <article className="file-card">
                  <strong>Carga masiva</strong>
                  <span>Descargar plantilla</span>
                  <div className="download-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => downloadTemplate(uploadFormats[0].filename, uploadFormats[0].headers, uploadFormats[0].example)}
                    >
                      <Download size={17} aria-hidden />
                      CSV
                    </button>
                  </div>
                  <label className="file-upload">
                    <Upload size={18} aria-hidden />
                    <span>Cargar archivo CSV</span>
                    <input type="file" accept=".csv,text/csv" onChange={importCollaboratorsFile} />
                  </label>
                </article>
              </div>
              <div className="tabs" role="tablist" aria-label="Filtro de colaboradores por cargo">
                <button
                  type="button"
                  className={peoplePosition === 'Todos' ? 'tab active' : 'tab'}
                  onClick={() => {
                    setPeoplePosition('Todos')
                    setPeoplePage(1)
                  }}
                >
                  Todos ({collaborators.length})
                </button>
                {positions.map((position) => (
                  <button
                    type="button"
                    className={peoplePosition === position ? 'tab active' : 'tab'}
                    key={position}
                    onClick={() => {
                      setPeoplePosition(position)
                      setPeoplePage(1)
                    }}
                  >
                    {position} ({collaboratorCountByPosition[position]})
                  </button>
                ))}
              </div>
              <div className="people-table">
                <div className="people-row people-head">
                  <span>RUT</span>
                  <span>Nombre</span>
                  <span>Telefono</span>
                  <span>Direccion</span>
                  <span>Cargo</span>
                  <span>Ingreso</span>
                </div>
                {peopleRows.map((collaborator) => (
                  <div className="people-row" key={collaborator.id}>
                    <span>{collaborator.rut}</span>
                    <span>{collaborator.name}</span>
                    <span>{collaborator.phone}</span>
                    <span>{collaborator.address}</span>
                    <span>{collaborator.position}</span>
                    <span>{collaborator.startDate}</span>
                  </div>
                ))}
              </div>
              <div className="pagination">
                <button type="button" disabled={peoplePage === 1} onClick={() => setPeoplePage((page) => page - 1)}>
                  Anterior
                </button>
                <span>Pagina {peoplePage} de {peopleTotalPages}</span>
                <button type="button" disabled={peoplePage === peopleTotalPages} onClick={() => setPeoplePage((page) => page + 1)}>
                  Siguiente
                </button>
              </div>
            </section>
          )}

          {can(activeMenuRole, 'shifts') && activeWorkspaceMenu && (
            <section className="panel shift-panel">
              <div className="panel-title">
                <CalendarCheck aria-hidden />
                <h2>Asignacion de turnos</h2>
              </div>
              <div className="shift-actions">
                <label>
                  Mes de turnos
                  <select
                    value={shiftMonth}
                    onChange={(event) => {
                      setShiftMonth(event.target.value)
                      setShiftWeekIndex(0)
                    }}
                  >
                    {availableYears.flatMap((year) =>
                      monthNames.map((month, index) => {
                        const value = `${year}-${String(index + 1).padStart(2, '0')}`
                        if (value > maxShiftMonth) return null
                        return (
                          <option key={value} value={value}>
                            {month} {year}
                          </option>
                        )
                      }),
                    )}
                  </select>
                </label>
                <button type="button" className="ghost" onClick={() => clonePreviousMonthShifts(shiftMonth)}>
                  Clonar mes anterior
                </button>
                <button type="button" className="danger-ghost" onClick={() => clearMonthShifts(shiftMonth)}>
                  Limpiar turnos del mes
                </button>
              </div>
              <div className="week-tabs" role="tablist" aria-label="Semanas del mes">
                {shiftWeeks.map((week) => {
                  const weekCreated = closedShiftKeys.includes(shiftCloseKey(shiftMonth, week.index, shiftPosition))
                  return (
                    <button
                      type="button"
                      className={shiftWeekIndex === week.index ? 'week-tab active' : 'week-tab'}
                      key={week.name}
                      onClick={() => {
                        setShiftWeekIndex(week.index)
                        setQuickShiftDate(week.workDates[0] || '')
                      }}
                    >
                      <strong>{week.name}</strong>
                      <span>{formatShortDate(week.start)} - {formatShortDate(week.end)}</span>
                      <small className={weekCreated ? 'week-status created' : 'week-status pending'}>
                        {weekCreated ? 'Turno Creado' : 'Pendiente de Crear'}
                      </small>
                    </button>
                  )
                })}
              </div>
              <div className="shift-view-tabs" role="tablist" aria-label="Vista de turnos">
                <button
                  type="button"
                  className={shiftView === 'planner' ? 'active' : ''}
                  onClick={() => setShiftView('planner')}
                >
                  Planificar turnos
                </button>
                <button
                  type="button"
                  className={shiftView === 'created' ? 'active' : ''}
                  onClick={() => setShiftView('created')}
                >
                  Ver turnos creados ({createdShiftCount})
                </button>
              </div>
              <div className="tabs role-tabs" role="tablist" aria-label="Rubro para asignar turnos">
                {shiftPositions.map((position) => (
                  <button
                    type="button"
                    className={shiftPosition === position ? 'tab active' : 'tab'}
                    key={position}
                    onClick={() => setShiftPosition(position)}
                  >
                    {position} ({collaboratorCountByPosition[position]})
                  </button>
                ))}
              </div>
              {shiftView === 'planner' && <div className="rule-list shift-rules">
                {shiftRuleChecks.map((rule) => (
                  <div className={rule.ok ? 'rule rule-ok' : 'rule rule-blocked'} key={rule.label}>
                    <span>{rule.ok ? 'OK' : 'Revisar'}</span>
                    <div>
                      <strong>{rule.label}</strong>
                      <p>{rule.detail}</p>
                    </div>
                  </div>
                ))}
              </div>}
              {shiftView === 'planner' && <div className="shift-builder">
                <aside className="drag-pool">
                  <div className="drag-pool-head">
                    <strong>{shiftPosition}</strong>
                    <span>Doble click asigna al bloque seleccionado</span>
                  </div>
                  <div className="quick-shift-selector" role="group" aria-label="Turno para doble click">
                    {shiftJourneys.map((journey) => (
                      <button
                        type="button"
                        className={quickShiftStartsAt === journey.startsAt ? 'active' : ''}
                        key={journey.startsAt}
                        onClick={() => setQuickShiftStartsAt(journey.startsAt)}
                      >
                        <span>{journey.label}</span>
                        <small>{journey.startsAt} - {journey.endsAt}</small>
                      </button>
                    ))}
                  </div>
                  <p className="quick-shift-current">
                    Seleccionado: {selectedQuickDate ? formatShortDate(selectedQuickDate) : 'sin dia'} · {quickShiftStartsAt}
                  </p>
                  <p className="quick-shift-current">
                    Las jornadas ya existen. Completa los dias y crea el Turno Semana.
                  </p>
                  <section>
                    <div>
                      {collaborators
                        .filter((collaborator) => collaborator.position === shiftPosition)
                        .map((collaborator) => {
                          const weekAssignments = activePositionWeekShifts.filter(
                            (shift) => shift.collaboratorId === collaborator.id,
                          ).length
                          return (
                            <button
                              type="button"
                              className="drag-person"
                              draggable
                              key={collaborator.id}
                              onDragStart={() => setDraggedCollaboratorId(collaborator.id)}
                              onDoubleClick={() => assignCollaboratorToNextAvailableDay(collaborator.id)}
                            >
                              <span>{collaborator.name}</span>
                              <small>{weekAssignments} dias semana</small>
                            </button>
                          )
                        })}
                    </div>
                  </section>
                </aside>
                <div className="shift-board">
                  <div className="shift-board-head">
                    <strong>{activeShiftWeek?.name} · {shiftPosition}</strong>
                    <span>{activeShiftWeek ? `${formatShortDate(activeShiftWeek.start)} - ${formatShortDate(activeShiftWeek.end)}` : ''}</span>
                  </div>
                  {activeShiftWeek?.days.map((day) => (
                    <article className={day.inMonth ? 'shift-day' : 'shift-day blocked'} key={day.date}>
                      <div className="shift-day-head">
                        <div>
                          <b>{formatWeekday(day.date)}</b>
                          <strong>{formatShortDate(day.date)}</strong>
                          <span>
                            {day.inMonth
                              ? `${activePositionWeekShifts.filter((shift) => shift.date === day.date).length} asignados`
                              : 'Fuera del mes'}
                          </span>
                        </div>
                        {day.inMonth && <div className="shift-day-actions">
                          <button
                            type="button"
                            aria-label={`Copiar asignaciones del ${formatShortDate(day.date)}`}
                            onClick={() => copyDayShifts(day.date)}
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="paste-day-button"
                            disabled={!copiedShiftDay || copiedShiftDay === day.date}
                            aria-label={`Pegar asignaciones en ${formatShortDate(day.date)}`}
                            onClick={() => pasteCopiedDayShifts(day.date)}
                          >
                            Pegar
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar asignaciones del ${formatShortDate(day.date)}`}
                            onClick={() => removeDayShifts(day.date)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>}
                      </div>
                      {day.inMonth ? [
                        ['10:00', '19:00'],
                        ['19:00', '04:00'],
                      ].map(([startsAt, endsAt]) => {
                        const slotShifts = activePositionWeekShifts.filter(
                          (shift) => shift.date === day.date && shift.startsAt === startsAt && shift.endsAt === endsAt,
                        )
                        return (
                          <div
                            className={
                              selectedQuickDate === day.date && quickShiftStartsAt === startsAt
                                ? 'shift-slot selected'
                                : 'shift-slot'
                            }
                            key={`${day.date}-${startsAt}`}
                            onClick={() => {
                              setQuickShiftDate(day.date)
                              setQuickShiftStartsAt(startsAt as ShiftJourney['startsAt'])
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => dropCollaborator(day.date, startsAt, endsAt)}
                          >
                            <span>{startsAt} - {endsAt}</span>
                            {slotShifts.map((shift) => {
                              const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
                              const consecutiveDays = consecutiveWorkDaysUntil(
                                shifts
                                  .filter((item) => item.collaboratorId === shift.collaboratorId)
                                  .map((item) => item.date),
                                shift.date,
                              )
                              return (
                                <div className="shift-assignee" key={shift.id}>
                                  <small>
                                    {collaborator?.name}
                                    <b>{collaborator?.position}</b>
                                    <em>{consecutiveDays} dias seguidos</em>
                                  </small>
                                </div>
                              )
                            })}
                            {!slotShifts.length && <em>Soltar aqui</em>}
                          </div>
                        )
                      }) : <div className="shift-blocked-day">Bloqueado</div>}
                    </article>
                  ))}
                  {!activeShiftWeek?.workDates.length && <p>No hay dias del mes disponibles en esta semana.</p>}
                </div>
              </div>}
              {shiftView === 'planner' && <div className="shift-footer">
                <span>
                  {activePositionWeekShifts.length} asignaciones de {shiftPosition} en {activeShiftWeek?.name}
                  {activeShiftCreated
                    ? ' · Turno creado'
                    : ''}
                  {activeShiftEditing ? ' · Editando' : ''}
                </span>
                <div className="shift-footer-actions">
                  <button type="button" className="ghost" onClick={clonePreviousWeekAssignment}>
                    Clonar semana anterior
                  </button>
                  {activeShiftCreated && !activeShiftEditing && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingShiftKeys((current) => Array.from(new Set([...current, activeShiftCloseKey])))
                        setMessage(`Editando Turno ${activeShiftWeek?.name} de ${shiftPosition}.`)
                      }}
                    >
                      Editar Turno
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={activeShiftCreated && !activeShiftEditing}
                    onClick={createActiveShiftWeek}
                  >
                    {activeShiftEditing ? `Guardar edicion ${activeShiftWeek?.name}` : `Crear Turno ${activeShiftWeek?.name}`}
                  </button>
                </div>
              </div>}
              {shiftCreateMessage && <div className="shift-create-message">{shiftCreateMessage}</div>}
              <section className={shiftView === 'created' ? 'completed-shifts created-view' : 'completed-shifts'}>
                <div className="completed-shifts-head">
                  <div>
                    <strong>Estado de turnos por cargo</strong>
                    <p>Selecciona una celda para revisar o completar ese cargo en la semana.</p>
                  </div>
                  <span className={createdShiftCount === totalCreatableShiftWeeks ? 'status-pill complete' : 'status-pill pending'}>
                    {createdShiftCount}/{totalCreatableShiftWeeks} turnos creados
                  </span>
                </div>
                {shiftView === 'created' && completedShiftGroups.length > 0 && (
                  <div className="created-turns-by-position">
                    {shiftPositions.map((position) => {
                      const createdForPosition = completedShiftGroups.filter((item) => item.position === position)
                      return (
                        <article className="created-position-group" key={position}>
                          <div>
                            <strong>{position}</strong>
                            <span>{createdForPosition.length}/{shiftWeeks.length} semanas creadas</span>
                          </div>
                          <div className="created-position-weeks">
                            {shiftWeeks.map((week) => {
                              const item = createdForPosition.find((created) => created.week.index === week.index)
                              return (
                                <button
                                  type="button"
                                  className={item ? 'created-week-card active' : 'created-week-card'}
                                  key={`${position}-${week.name}`}
                                  onClick={() => {
                                    setValidationPosition(position)
                                    setValidationMonth(shiftMonth)
                                    setValidationWeekIndex(week.index)
                                    setValidationStatus('Pendiente')
                                    setActiveMenu(3)
                                  }}
                                >
                                  <strong>{week.name}</strong>
                                  <span>{item ? 'Validar asistencia' : 'Sin crear'}</span>
                                  <small>{item ? `${item.expected} por dia · ${item.assigned} asignaciones` : `${formatShortDate(week.start)} - ${formatShortDate(week.end)}`}</small>
                                </button>
                              )
                            })}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
                {completedShiftGroups.length === 0 && (
                  <div className="empty-state">
                    Aun no hay turnos semanales creados. Completa Jornada 1 y Jornada 2 con la misma dotacion por rubro.
                  </div>
                )}
              </section>
            </section>
          )}

          {can(activeMenuRole, 'validation') && activeWorkspaceMenu && (
            <section className="panel validation-panel">
              <div className="panel-title">
                <ClipboardCheck aria-hidden />
                <div>
                  <h2>Validación de turnos</h2>
                  <small className="panel-subtitle">Revisa y valida la asistencia de los colaboradores.</small>
                </div>
              </div>

              <div className="validation-controls">
                <label>
                  Mes
                  <select
                    value={validationMonth}
                    onChange={(event) => {
                      setValidationMonth(event.target.value)
                      setValidationWeekIndex(0)
                      setValidationDay('')
                      setValidationStatus('Pendiente')
                      setValidationPage(1)
                    }}
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
                </label>
              </div>

              <div className="week-tabs validation-week-tabs" role="tablist" aria-label="Semana a validar">
                {validationWeeks.map((week) => {
                  const weekShifts = shifts.filter((shift) => week.dates.includes(shift.date))
                  const pending = weekShifts.filter((shift) => shift.fulfilled === null && shift.date < today).length
                  return (
                    <button
                      type="button"
                      className={validationWeekIndex === week.index ? 'week-tab active' : 'week-tab'}
                      key={week.name}
                      onClick={() => {
                        setValidationWeekIndex(week.index)
                        setValidationDay('')
                        setValidationStatus('Pendiente')
                        setValidationPage(1)
                      }}
                    >
                      <strong>{week.name}</strong>
                      <span>{formatShortDate(week.start)} - {formatShortDate(week.end)}</span>
                      <small className={pending ? 'week-status pending' : 'week-status created'}>
                        {pending ? `${pending} pendientes` : 'Sin pendientes'}
                      </small>
                    </button>
                  )
                })}
              </div>

              {/* FILTRAR POR DÍA DE LA SEMANA */}
              <div className="validation-section-block">
                <div className="validation-section-header">
                  <Calendar className="section-icon" aria-hidden />
                  <h3>Filtrar por día de la semana</h3>
                </div>
                <div className="validation-day-selector" role="tablist" aria-label="Filtrar por día de la semana">
                  {activeValidationWeek?.days.map((day) => {
                    const isDisabled = !day.inMonth
                    const isSelected = selectedValidationDay === day.date
                    return (
                      <button
                        type="button"
                        key={day.date}
                        disabled={isDisabled}
                        className={
                          isDisabled
                            ? 'day-tab disabled'
                            : isSelected
                            ? 'day-tab active'
                            : 'day-tab'
                        }
                        onClick={() => {
                          if (!isDisabled) {
                            setValidationDay(day.date)
                            setValidationStatus('Pendiente')
                            setValidationPage(1)
                          }
                        }}
                      >
                        {isDisabled && <Ban className="disabled-icon" aria-hidden />}
                        <span className="day-name">{formatWeekdayCapitalized(day.date)}</span>
                        <span className="day-date">{formatShortDate(day.date)}</span>
                        {isDisabled && <small className="out-of-month-badge">Fuera del mes</small>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* FILTRAR POR CARGO (con contadores dinámicos) */}
              <div className="validation-section-block">
                <div className="validation-section-header">
                  <Briefcase className="section-icon" aria-hidden />
                  <h3>Filtrar por cargo</h3>
                </div>
                <div className="tabs validation-position-tabs" role="tablist" aria-label="Filtro de validación por cargo">
                  {shiftPositions.map((position) => {
                    const count = shifts.filter((shift) => {
                      if (shift.date !== selectedValidationDay) return false
                      const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
                      return collaborator?.position === position
                    }).length

                    return (
                      <button
                        type="button"
                        className={validationPosition === position ? 'tab active' : 'tab'}
                        key={position}
                        onClick={() => {
                          setValidationPosition(position)
                          setValidationPage(1)
                        }}
                      >
                        {position} ({count})
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* BARRA DE CONTROL (FILTROS DE ESTADO CON CONTEO, BUSCADOR Y ACCIONES MASIVAS) */}
              <div className="validation-toolbar">
                <div className="validation-status-tabs" role="tablist" aria-label="Filtro por estado de asistencia">
                  {(
                    [
                      { label: 'Pendiente', count: statusCounts.pending },
                      { label: 'Asiste', count: statusCounts.attends },
                      { label: 'No asiste', count: statusCounts.absent },
                      { label: 'Todos', count: statusCounts.total },
                    ] as const
                  ).map((item) => (
                    <button
                      type="button"
                      className={validationStatus === item.label ? 'active' : ''}
                      key={item.label}
                      onClick={() => {
                        setValidationStatus(item.label)
                        setValidationPage(1)
                      }}
                    >
                      {item.label} ({item.count})
                    </button>
                  ))}
                </div>

                {/* BUSCADOR POR NOMBRE O RUT */}
                <div className="validation-search-box">
                  <Search className="search-icon" aria-hidden />
                  <input
                    type="text"
                    className="validation-search-input"
                    placeholder="Buscar por nombre o RUT..."
                    value={validationSearch}
                    onChange={(event) => {
                      setValidationSearch(event.target.value)
                      setValidationPage(1)
                    }}
                  />
                </div>


              </div>

              {/* LISTADO POR JORNADA (PESTAÑAS DE JORNADA + TABLA ÚNICA + PAGINACIÓN) */}
              <div className="validation-journey-section">
                <div className="validation-section-header journey-section-header">
                  <div>
                    <h3>Listado por jornada</h3>
                    <small className="journey-summary-label">
                      {validationPosition} · {validationContext.day} · {journeyValidationRows.length} colaboradores ({statusCounts.pending} pendientes)
                    </small>
                  </div>
                </div>

                {positionValidationRows.length === 0 ? (
                  <div className="validation-empty-state">
                    <p>No hay trabajadores asignados para este día y cargo.</p>
                  </div>
                ) : (
                  <>
                    {/* PESTAÑAS DE JORNADA (TABS) */}
                    <div className="journey-tabs" role="tablist" aria-label="Pestañas de Jornada">
                      {availableJourneys.map((journey) => {
                        const count = positionValidationRows.filter((s) => s.startsAt === journey.startsAt).length
                        const isSelected = activeJourney.startsAt === journey.startsAt
                        return (
                          <button
                            type="button"
                            key={journey.startsAt}
                            className={isSelected ? 'journey-tab active' : 'journey-tab'}
                            onClick={() => {
                              setValidationJourneyStartsAt(journey.startsAt)
                              setValidationPage(1)
                            }}
                          >
                            <div className="journey-tab-top">
                              <strong>{journey.label}</strong>
                              <span className="journey-tab-badge">{count}</span>
                            </div>
                            <small className="journey-tab-time">{journey.startsAt} - {journey.endsAt}</small>
                          </button>
                        )
                      })}
                    </div>

                    {/* TABLA ÚNICA DE LA JORNADA SELECCIONADA */}
                    {filteredJourneyRows.length === 0 ? (
                      <div className="validation-empty-state">
                        <p>No hay colaboradores para los filtros seleccionados.</p>
                      </div>
                    ) : (
                      <div className="journey-table-container">
                        <div className="validation-table-wrapper">
                          <table className="validation-journey-table">
                            <thead>
                              <tr>
                                <th className="col-index">#</th>
                                <th className="col-name">Nombre del empleado</th>
                                <th className="col-rut">RUT</th>
                                <th className="col-status">Estado actual</th>
                                <th className="col-action">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedJourneyRows.map((shift, index) => {
                                const collaborator = collaborators.find((item) => item.id === shift.collaboratorId)
                                const canValidateShift = shift.date < today
                                const statusLabel =
                                  shift.fulfilled === true ? 'Asiste' : shift.fulfilled === false ? 'No asiste' : 'Pendiente'
                                const statusClass =
                                  shift.fulfilled === true ? 'attends' : shift.fulfilled === false ? 'absent' : 'pending'
                                const rowIndex = (currentValidationPage - 1) * validationPageSize + index + 1

                                return (
                                  <tr key={shift.id}>
                                    <td className="col-index">{rowIndex}</td>
                                    <td className="col-name">
                                      <strong>{collaborator?.name}</strong>
                                    </td>
                                    <td className="col-rut">
                                      <code>{collaborator?.rut}</code>
                                    </td>
                                    <td className="col-status">
                                      <em className={`attendance-status ${canValidateShift ? statusClass : 'pending'}`}>
                                        {canValidateShift ? statusLabel : 'Bloqueado'}
                                      </em>
                                    </td>
                                    <td className="col-action">
                                      <div className="action-button-group">
                                        <button
                                          type="button"
                                          className={shift.fulfilled === true ? 'attendance-button selected' : 'attendance-button'}
                                          disabled={!canValidateShift}
                                          onClick={() => validateShiftAttendance(shift.id, true)}
                                        >
                                          Asiste
                                        </button>
                                        <button
                                          type="button"
                                          className={
                                            shift.fulfilled === false
                                              ? 'attendance-button absent selected'
                                              : 'attendance-button absent'
                                          }
                                          disabled={!canValidateShift}
                                          onClick={() => validateShiftAttendance(shift.id, false)}
                                        >
                                          No asiste
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* PAGINACIÓN */}
                        <div className="validation-pagination">
                          <div className="pagination-info">
                            Mostrar{' '}
                            <select
                              value={validationPageSize}
                              onChange={(e) => {
                                setValidationPageSize(Number(e.target.value))
                                setValidationPage(1)
                              }}
                              className="page-size-select"
                            >
                              <option value={10}>10</option>
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                            </select>{' '}
                            de {filteredJourneyRows.length} empleados
                          </div>
                          <div className="pagination-buttons">
                            <button
                              type="button"
                              disabled={currentValidationPage <= 1}
                              onClick={() => setValidationPage((prev) => Math.max(1, prev - 1))}
                              className="page-button icon-page-button"
                              aria-label="Página anterior"
                            >
                              <ChevronLeft aria-hidden />
                            </button>

                            {Array.from({ length: totalJourneyPages }, (_, i) => i + 1).map((pageNum) => (
                              <button
                                type="button"
                                key={pageNum}
                                className={pageNum === currentValidationPage ? 'page-button active' : 'page-button'}
                                onClick={() => setValidationPage(pageNum)}
                              >
                                {pageNum}
                              </button>
                            ))}

                            <button
                              type="button"
                              disabled={currentValidationPage >= totalJourneyPages}
                              onClick={() => setValidationPage((prev) => Math.min(totalJourneyPages, prev + 1))}
                              className="page-button icon-page-button"
                              aria-label="Página siguiente"
                            >
                              <ChevronRight aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {can(activeMenuRole, 'tips') && activeWorkspaceMenu && (
            <section className="panel tip-loader-panel">
              {/* Header con título y callout de advertencia */}
              <div className="tip-loader-header">
                <div className="panel-title">
                  <Coins className="panel-title-icon" aria-hidden />
                  <div>
                    <h2>Carga de propinas</h2>
                    <p className="panel-subtitle">
                      Registra el total de propinas recaudadas por día. Solo se pueden cargar días anteriores.
                    </p>
                  </div>
                </div>
                <div className="tip-rule-alert">
                  <Info className="alert-icon" aria-hidden />
                  <div>
                    <strong>Importante</strong>
                    <span>No es posible cargar propinas del día actual ni de fechas futuras.</span>
                  </div>
                </div>
              </div>

              {/* Layout en 2 columnas: Formulario e Historial */}
              <div className="tip-loader-grid">
                {/* Columna Izquierda: Carga y Resumen */}
                <div className="tip-loader-left-column">
                  {/* SECCIÓN 1: Selecciona el mes y la semana */}
                  <div className="tip-card-section">
                    <div className="tip-card-title">
                      <Calendar className="section-icon" aria-hidden />
                      <h3>1. Selecciona el mes y la semana</h3>
                    </div>

                    <div className="tip-selector-top-row">
                      <div className="tip-month-selector">
                        <select
                          className="tip-month-select"
                          value={tipMonth}
                          onChange={(e) => {
                            setTipMonth(e.target.value)
                            setTipWeekIndex(0)
                            setTipFormDate('')
                            setTipFormAmount('')
                          }}
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
                            onClick={() => {
                              const prev = previousMonth(tipMonth)
                              setTipMonth(prev)
                              setTipWeekIndex(0)
                              setTipFormDate('')
                              setTipFormAmount('')
                            }}
                          >
                            <ChevronLeft aria-hidden size={18} />
                          </button>
                          <button
                            type="button"
                            className="icon-button-ghost"
                            disabled={tipMonth >= today.slice(0, 7)}
                            aria-label="Mes siguiente"
                            onClick={() => {
                              const nextM = nextMonth(tipMonth)
                              if (nextM <= today.slice(0, 7)) {
                                setTipMonth(nextM)
                                setTipWeekIndex(0)
                                setTipFormDate('')
                                setTipFormAmount('')
                              }
                            }}
                          >
                            <ChevronRight aria-hidden size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="week-tabs tip-week-tabs" role="tablist" aria-label="Semanas del mes">
                        {tipWeeks.map((week) => (
                          <button
                            type="button"
                            className={tipWeekIndex === week.index ? 'week-tab active' : 'week-tab'}
                            key={week.name}
                            onClick={() => {
                              setTipWeekIndex(week.index)
                              setTipFormDate('')
                              setTipFormAmount('')
                            }}
                          >
                            <strong>{week.name}</strong>
                            <span>{formatShortDate(week.start)} - {formatShortDate(week.end)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 7 DÍAS DE LA SEMANA (LUNES A DOMINGO) */}
                    <div className="tip-days-grid" role="tablist" aria-label="Días de la semana">
                      {activeTipWeek?.days.map((dayItem) => {
                        const d = dayItem.date
                        const inMonth = dayItem.inMonth
                        const isPast = d < today
                        const isToday = d === today
                        const isFuture = d > today
                        const isSelected = activeTipDate === d
                        const tip = dailyTips.find((item) => item.date === d)
                        const isRegistered = Boolean(tip)
                        const isAvailable = inMonth && isPast && !isRegistered
                        const isDisabled = !inMonth || isToday || isFuture

                        const { capWeekday, dayNum, monthShort } = formatDayMonthShort(d)
                        const outOfPrevMonth = d < `${tipMonth}-01`

                        return (
                          <button
                            type="button"
                            key={d}
                            disabled={isDisabled}
                            className={
                              !inMonth
                                ? 'tip-day-card out-of-month disabled'
                                : isSelected
                                ? 'tip-day-card active'
                                : isRegistered
                                ? 'tip-day-card registered'
                                : isAvailable
                                ? 'tip-day-card available'
                                : 'tip-day-card disabled'
                            }
                            onClick={() => {
                              if (!isDisabled) {
                                setTipFormDate(d)
                                setTipFormAmount('')
                              }
                            }}
                          >
                            <span className="tip-day-weekday">{capWeekday}</span>
                            <strong className="tip-day-date">{dayNum} {monthShort}</strong>

                            {!inMonth ? (
                              <>
                                <span className="tip-day-badge disabled">
                                  <Ban aria-hidden size={12} /> No disponible
                                </span>
                                <small className="tip-day-subtext">
                                  {outOfPrevMonth ? 'Mes anterior' : 'Mes siguiente'}
                                </small>
                              </>
                            ) : isRegistered ? (
                              <>
                                <span className="tip-day-badge registered">
                                  <CheckCircle2 aria-hidden size={12} /> Registrada
                                </span>
                                <small className="tip-day-amount">{currency(tip?.amount || 0)}</small>
                              </>
                            ) : isAvailable ? (
                              <span className="tip-day-badge available">
                                <span className="badge-dot" /> Disponible
                              </span>
                            ) : isToday ? (
                              <>
                                <span className="tip-day-badge today">
                                  <Ban aria-hidden size={12} /> No disponible
                                </span>
                                <small className="tip-day-subtext">Hoy</small>
                              </>
                            ) : (
                              <>
                                <span className="tip-day-badge future">
                                  <Ban aria-hidden size={12} /> No disponible
                                </span>
                                <small className="tip-day-subtext">Fecha futura</small>
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* SECCIÓN 2: Resumen del día seleccionado */}
                  <div className="tip-card-section">
                    <div className="tip-card-title">
                      <Calendar className="section-icon" aria-hidden />
                      <h3>2. Resumen del día seleccionado</h3>
                    </div>

                    <div className="tip-summary-wrapper">
                      <div className="tip-summary-main">
                        <h4>{formatFullDate(activeTipDate)}</h4>
                        {isTipDateRegistered ? (
                          <span className="summary-status-badge registered">
                            ● Propina registrada ({currency(existingTipForDate?.amount || 0)})
                          </span>
                        ) : isTipDateAvailable ? (
                          <span className="summary-status-badge available">
                            ● Disponible para carga
                          </span>
                        ) : isTipDateToday ? (
                          <span className="summary-status-badge today">
                            ● No disponible (Día actual)
                          </span>
                        ) : (
                          <span className="summary-status-badge future">
                            ● No disponible (Fecha futura)
                          </span>
                        )}

                        <p className="tip-summary-subtext">
                          {isTipDateRegistered
                            ? `Este día ya tiene una carga de propinas registrada por ${existingTipForDate?.loadedBy || 'Administrador'}.`
                            : isTipDateAvailable
                            ? 'El día seleccionado ya se encuentra cerrado y puede recibir la carga de propinas.'
                            : 'Solo se pueden registrar propinas para fechas anteriores al día de hoy.'}
                        </p>
                      </div>

                      <div className="tip-metrics-grid">
                        <div className="tip-metric-card">
                          <Calendar className="metric-icon" aria-hidden />
                          <div>
                            <span>Turnos validados</span>
                            <strong>{fulfilledShiftsCountForTipDate}</strong>
                          </div>
                        </div>

                        <div className="tip-metric-card">
                          <Users className="metric-icon" aria-hidden />
                          <div>
                            <span>Colaboradores con turno validado</span>
                            <strong>{uniqueCollaboratorsForTipDate}</strong>
                          </div>
                        </div>

                        <div className="tip-metric-card">
                          <Clock className="metric-icon" aria-hidden />
                          <div>
                            <span>Jornadas</span>
                            <strong>{journeysCountForTipDate}</strong>
                            {journeysForTipDate.length > 0 && (
                              <small>
                                {journeysForTipDate.map((j) => `${j.startsAt} - ${j.endsAt}`).join(' | ')}
                              </small>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: Ingresa el monto recaudado */}
                  <div className="tip-card-section">
                    <div className="tip-card-title">
                      <Coins className="section-icon" aria-hidden />
                      <h3>3. Ingresa el monto recaudado</h3>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (!isTipDateAvailable) return
                        const amountNum = Number(tipFormAmount.replace(/\D/g, ''))
                        if (!amountNum || amountNum <= 0) return setMessage('Ingresa un monto de propina valido.')
                        if (dailyTips.some((tip) => tip.date === activeTipDate))
                          return setMessage('Ya existe una propina cargada para esa fecha.')

                        setDailyTips((current) => [
                          ...current,
                          {
                            id: crypto.randomUUID(),
                            date: activeTipDate,
                            amount: amountNum,
                            loadedBy: roles.find((role) => role.id === roleId)?.name || 'Administrador',
                          },
                        ])
                        setMessage(`Propina de ${currency(amountNum)} registrada correctamente para el ${formatShortDate(activeTipDate)}.`)
                        setTipFormAmount('')
                      }}
                    >
                      <div className="tip-amount-field-group">
                        <label htmlFor="tip-amount-input">Monto total recaudado</label>
                        <div className="tip-amount-input-box">
                          <span className="currency-prefix">$</span>
                          <input
                            id="tip-amount-input"
                            type="text"
                            className="tip-amount-input"
                            placeholder="350.000"
                            disabled={!isTipDateAvailable}
                            value={
                              tipFormAmount
                                ? Number(tipFormAmount.replace(/\D/g, '')).toLocaleString('es-CL')
                                : isTipDateRegistered
                                ? (existingTipForDate?.amount || 0).toLocaleString('es-CL')
                                : ''
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '')
                              setTipFormAmount(raw)
                            }}
                          />
                        </div>
                      </div>

                      <div className="tip-info-callout">
                        <Info className="callout-icon" aria-hidden />
                        <span>
                          Ingresa el total de propinas recaudadas durante el día seleccionado. Este monto será distribuido posteriormente en el asignador de propinas.
                        </span>
                      </div>

                      <div className="tip-form-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={!tipFormAmount}
                          onClick={() => setTipFormAmount('')}
                        >
                          Limpiar
                        </button>
                        <button
                          type="submit"
                          className="icon-button"
                          disabled={!isTipDateAvailable || !Number(tipFormAmount.replace(/\D/g, ''))}
                        >
                          <Coins aria-hidden />
                          Guardar propina del día
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Columna Derecha: Últimas Cargas Registradas */}
                <div className="tip-loader-right-column">
                  <div className="tip-card-section history-section">
                    <div className="tip-card-title">
                      <Clock className="section-icon" aria-hidden />
                      <h3>Últimas cargas registradas</h3>
                    </div>

                    <div className="history-table-wrapper">
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Monto</th>
                            <th>Estado</th>
                            <th>Registrado por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentDailyTips.map((tip) => (
                            <tr key={tip.id} className={tip.date === activeTipDate ? 'active-history-row' : ''}>
                              <td className="col-date">
                                <strong>{formatShortDate(tip.date)}</strong>
                              </td>
                              <td className="col-amount">{currency(tip.amount)}</td>
                              <td className="col-status">
                                <span className="history-status-badge">Registrada</span>
                              </td>
                              <td className="col-user">{tip.loadedBy}</td>
                            </tr>
                          ))}
                          {recentDailyTips.length === 0 && (
                            <tr>
                              <td colSpan={4} className="history-empty">
                                No hay cargas de propina registradas aún.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="history-footer-link">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          if (can(activeMenuRole, 'audit')) {
                            setActiveMenu(7)
                          }
                        }}
                      >
                        Ver historial completo <ChevronRight aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {can(activeMenuRole, 'assignments') && activeWorkspaceMenu && (
            <TipAllocatorModule
              collaborators={collaborators}
              shifts={shifts}
              dailyTips={dailyTips}
              assignments={assignments}
              setAssignments={setAssignments}
              setMessage={setMessage}
              setToastMessage={setToastMessage}
              activeMenuRole={activeMenuRole}
              can={can}
              setActiveMenu={setActiveMenu}
              initialDate={selectedDate}
            />
          )}
        </section>

        {can(activeMenuRole, 'audit') && activeWorkspaceMenu && (
          <section className="panel">
            <div className="panel-title">
              <ShieldCheck aria-hidden />
              <h2>Auditor</h2>
            </div>
            <RuleList rules={ruleChecks} />
          </section>
        )}
      </section>
    </main>
  )
}

export default App

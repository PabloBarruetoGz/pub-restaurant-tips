export const roles = [
  { id: 0, name: 'Dashboard', description: 'Visualiza propinas por dia, semana y mes.' },
  { id: 1, name: 'Gestion de Personas', description: 'Carga colaboradores y cargos.' },
  { id: 2, name: 'Asignador de Turnos', description: 'Planifica turnos semanales.' },
  { id: 3, name: 'Validador de Turnos', description: 'Confirma turnos cumplidos.' },
  { id: 4, name: 'Cargador de Propinas', description: 'Registra propinas diarias.' },
  { id: 5, name: 'Asignador de Propinas', description: 'Distribuye propinas validadas.' },
  { id: 6, name: 'Administrador', description: 'Acceso completo y gestion de cuentas.' },
  { id: 7, name: 'Auditor', description: 'Revision de trazabilidad y reglas.' },
] as const

export const positions = [
  'Garzon',
  'Cocina',
  'Barra',
  'Anfitrion',
  'Guardia',
  'Administrativo',
] as const

export const tipPercentages: Record<Position, number> = {
  Garzon: 0.3,
  Cocina: 0.25,
  Barra: 0.2,
  Anfitrion: 0.15,
  Guardia: 0.05,
  Administrativo: 0.05,
}

export const requiredCollaboratorsByPosition: Record<Position, number> = {
  Garzon: 60,
  Cocina: 40,
  Barra: 30,
  Anfitrion: 20,
  Guardia: 30,
  Administrativo: 5,
}

export const maxDailyShiftCoverageByPosition: Record<Exclude<Position, 'Administrativo'>, number> = {
  Garzon: 40,
  Cocina: 30,
  Barra: 20,
  Anfitrion: 12,
  Guardia: 20,
}

export type RoleId = (typeof roles)[number]['id']
export type Position = (typeof positions)[number]

export type Collaborator = {
  id: string
  rut: string
  firstName: string
  firstLastName: string
  secondLastName: string
  name: string
  phone: string
  address: string
  position: Position
  startDate: string
  active: boolean
}

export type Shift = {
  id: string
  collaboratorId: string
  date: string
  startsAt: string
  endsAt: string
  fulfilled: boolean | null
}

export type DailyTip = {
  id: string
  date: string
  amount: number
  loadedBy: string
}

export type TipAssignment = {
  id: string
  dailyTipId: string
  collaboratorId: string
  amount: number
  assignedAt: string
}

export type TipFilter = 'day' | 'week' | 'month' | 'range'
export type RuleCheck = {
  label: string
  ok: boolean
  detail: string
}

const firstNames = [
  'Camila',
  'Mateo',
  'Valentina',
  'Nicolas',
  'Diego',
  'Laura',
  'Sofia',
  'Tomas',
  'Isidora',
  'Benjamin',
  'Antonia',
  'Joaquin',
  'Fernanda',
  'Martin',
  'Catalina',
  'Agustin',
  'Josefa',
  'Vicente',
  'Trinidad',
  'Maximiliano',
]

const firstLastNames = [
  'Soto',
  'Rivas',
  'Paz',
  'Vera',
  'Fuentes',
  'Mena',
  'Lagos',
  'Araya',
  'Silva',
  'Castro',
  'Morales',
  'Herrera',
  'Navarro',
  'Pizarro',
  'Cortes',
  'Salinas',
  'Carrasco',
  'Miranda',
  'Espinoza',
  'Valdes',
]

const secondLastNames = [
  'Rojas',
  'Munoz',
  'Vega',
  'Tapia',
  'Contreras',
  'Saavedra',
  'Campos',
  'Reyes',
  'Figueroa',
  'Gallardo',
]

const addresses = [
  'Av. Providencia 1200',
  'Los Leones 540',
  'Merced 310',
  'Irarrázaval 880',
  'Santa Isabel 455',
  'Bellavista 701',
]

function rutCheckDigit(value: number) {
  let multiplier = 2
  let sum = 0
  for (const digit of String(value).split('').reverse()) {
    sum += Number(digit) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const result = 11 - (sum % 11)
  if (result === 11) return '0'
  if (result === 10) return 'K'
  return String(result)
}

function validRut(seed: number) {
  const body = 16000000 + seed
  return `${body}-${rutCheckDigit(body)}`
}

export const initialCollaborators: Collaborator[] = positions.flatMap((position) =>
  Array.from({ length: requiredCollaboratorsByPosition[position] }, (_, index) => {
    const sequence = positions.indexOf(position) * 100 + index + 1
    const firstName = firstNames[(sequence - 1) % firstNames.length]
    const firstLastName = firstLastNames[Math.floor((sequence - 1) / firstNames.length) % firstLastNames.length]
    const secondLastName = secondLastNames[Math.floor((sequence - 1) / (firstNames.length * firstLastNames.length)) % secondLastNames.length]
    return {
      id: `c${sequence}`,
      rut: validRut(sequence),
      firstName,
      firstLastName,
      secondLastName,
      name: `${firstName} ${firstLastName} ${secondLastName}`,
      phone: `+569${80000000 + sequence}`,
      address: addresses[index % addresses.length],
      position,
      startDate: `2025-${String((index % 12) + 1).padStart(2, '0')}-01`,
      active: true,
    }
  }),
)

export const today = '2026-09-07'

const historyStart = '2025-01-01'
const historyEnd = '2026-08-31'

function dateRange(from: string, to: string) {
  const dates: string[] = []
  const cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function realisticDailyTip(date: string) {
  const current = new Date(`${date}T12:00:00`)
  const day = current.getDay()
  const month = current.getMonth()
  const weekendBoost = day === 5 ? 1.42 : day === 6 ? 1.72 : day === 0 ? 1.18 : 1
  const seasonalBoost = month === 0 || month === 1 ? 1.24 : month === 6 ? 1.15 : month === 8 ? 1.08 : 1
  const deterministicVariation = 0.88 + ((current.getDate() * 17 + month * 11) % 29) / 100
  const base = 620000

  return Math.round((base * weekendBoost * seasonalBoost * deterministicVariation) / 10000) * 10000
}

export const initialDailyTips: DailyTip[] = dateRange(historyStart, historyEnd).map((date, index) => ({
  id: `t${index + 1}`,
  date,
  amount: realisticDailyTip(date),
  loadedBy: 'Administrador',
}))

const operationalPositions: Position[] = positions.filter((position) => position !== 'Administrativo')
const operationalTipDays = initialDailyTips.filter((tip) => {
  const day = new Date(`${tip.date}T12:00:00`).getDay()
  return day >= 1 && day <= 5
})

export const initialShifts: Shift[] = operationalTipDays.flatMap((tip, dayIndex) =>
  initialCollaborators
    .filter((collaborator) => operationalPositions.includes(collaborator.position))
    .map((collaborator, collaboratorIndex) => ({
      id: `s${dayIndex + 1}-${collaborator.id}`,
      collaboratorId: collaborator.id,
      date: tip.date,
      startsAt: collaboratorIndex % 2 === 0 ? '10:00' : '19:00',
      endsAt: collaboratorIndex % 2 === 0 ? '19:00' : '04:00',
      fulfilled: (dayIndex + collaboratorIndex) % 19 === 0 ? false : true,
    })),
)

export const initialAssignments: TipAssignment[] = initialDailyTips.flatMap((tip) =>
  positions.flatMap((position) => {
    const dayIndex = operationalTipDays.findIndex((item) => item.id === tip.id)
    const eligibleCollaborators = initialCollaborators.filter(
      (collaborator, collaboratorIndex) =>
        collaborator.position === position &&
        collaborator.active &&
        (position === 'Administrativo' || (dayIndex >= 0 && (dayIndex + collaboratorIndex) % 19 !== 0)),
    )
    const pool = Math.round(tip.amount * tipPercentages[position])
    const basePerPerson = eligibleCollaborators.length ? Math.floor(pool / eligibleCollaborators.length) : 0
    const remainder = eligibleCollaborators.length ? pool - basePerPerson * eligibleCollaborators.length : 0

    return eligibleCollaborators.map((collaborator, index) => ({
      id: `a-${tip.id}-${collaborator.id}`,
      dailyTipId: tip.id,
      collaboratorId: collaborator.id,
      amount: basePerPerson + (index < remainder ? 1 : 0),
      assignedAt: `${tip.date}T23:30:00.000Z`,
    }))
  }),
)

export function normalizeRut(rut: string) {
  return rut.replace(/\./g, '').trim().toUpperCase()
}

export function currency(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function samePeriod(date: string, selectedDate: string, filter: TipFilter) {
  const current = new Date(`${date}T12:00:00`)
  const selected = new Date(`${selectedDate}T12:00:00`)

  if (filter === 'day') return date === selectedDate
  if (filter === 'month') {
    return current.getFullYear() === selected.getFullYear() && current.getMonth() === selected.getMonth()
  }

  const start = new Date(selected)
  const day = start.getDay() || 7
  start.setDate(start.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return current >= start && current <= end
}

export function calculateTipPool(total: number) {
  return positions.map((position) => ({
    position,
    percentage: tipPercentages[position],
    amount: Math.round(total * tipPercentages[position]),
  }))
}

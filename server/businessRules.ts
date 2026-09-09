const positionKeys = ['GARZON', 'COCINA', 'BARRA', 'ANFITRION', 'GUARDIA', 'ADMINISTRATIVO'] as const

type Position = (typeof positionKeys)[number]
type PositionPercentages = Record<Position, number>

export const positionPercentages: PositionPercentages = {
  GARZON: 0.3,
  COCINA: 0.25,
  BARRA: 0.2,
  ANFITRION: 0.15,
  GUARDIA: 0.05,
  ADMINISTRATIVO: 0.05,
}

type EligibleCollaborator = {
  id: string
  position: Position
}

export function assertClosedPercentages(percentages = positionPercentages) {
  const total = Object.values(percentages).reduce((sum, value) => sum + value, 0)
  if (Math.round(total * 100) !== 100) {
    throw new Error('Los porcentajes de reparto deben sumar 100%.')
  }
}

export function normalizeRut(rut: string) {
  return rut.replace(/\./g, '').trim().toUpperCase()
}

export function buildTipAssignments(
  dailyTipId: string,
  totalAmount: number,
  eligible: EligibleCollaborator[],
  percentages: PositionPercentages = positionPercentages,
) {
  assertClosedPercentages(percentages)

  return Object.entries(percentages).flatMap(([position, percentage]) => {
    const members = eligible.filter((collaborator) => collaborator.position === position)
    if (!members.length) return []

    const pool = Math.round(totalAmount * percentage)
    const baseAmount = Math.floor(pool / members.length)
    const remainder = pool - baseAmount * members.length

    return members.map((member, index) => ({
      dailyTipId,
      collaboratorId: member.id,
      amount: baseAmount + (index < remainder ? 1 : 0),
    }))
  })
}

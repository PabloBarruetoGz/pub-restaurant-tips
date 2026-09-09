import type { Collaborator, DailyTip, Shift, TipAssignment, WeeklyShift } from '@prisma/client'
import { dateOnly } from './http.js'

const positionLabels = {
  GARZON: 'Garzon',
  COCINA: 'Cocina',
  BARRA: 'Barra',
  ANFITRION: 'Anfitrion',
  GUARDIA: 'Guardia',
  ADMINISTRATIVO: 'Administrativo',
} as const

export function mapCollaborator(collaborator: Collaborator) {
  return {
    ...collaborator,
    position: positionLabels[collaborator.position],
    startDate: dateOnly(collaborator.startDate),
  }
}

export function mapShift(shift: Shift) {
  return {
    ...shift,
    date: dateOnly(shift.date),
  }
}

export function mapWeeklyShift(weeklyShift: WeeklyShift) {
  return {
    ...weeklyShift,
    position: positionLabels[weeklyShift.position],
    startDate: dateOnly(weeklyShift.startDate),
    endDate: dateOnly(weeklyShift.endDate),
  }
}

export function mapDailyTip(dailyTip: DailyTip & { loadedBy?: { name: string } }) {
  return {
    ...dailyTip,
    date: dateOnly(dailyTip.date),
    loadedBy: dailyTip.loadedBy?.name || dailyTip.loadedById,
  }
}

export function mapTipAssignment(assignment: TipAssignment) {
  return {
    ...assignment,
    assignedAt: assignment.assignedAt.toISOString(),
  }
}

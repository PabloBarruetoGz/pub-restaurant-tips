import { z } from 'zod'

export const positions = ['GARZON', 'COCINA', 'BARRA', 'ANFITRION', 'GUARDIA', 'ADMINISTRATIVO'] as const
export const operationalPositions = ['GARZON', 'COCINA', 'BARRA', 'ANFITRION', 'GUARDIA'] as const

export const positionToPrisma = {
  Garzon: 'GARZON',
  Cocina: 'COCINA',
  Barra: 'BARRA',
  Anfitrion: 'ANFITRION',
  Guardia: 'GUARDIA',
} as const

export const collaboratorSchema = z.object({
  rut: z.string().min(7),
  firstName: z.string().min(2),
  firstLastName: z.string().min(2),
  secondLastName: z.string().min(2),
  phone: z.string().min(6),
  address: z.string().min(4),
  position: z.enum(positions),
  startDate: z.coerce.date(),
})

const fixedJourneySchema = z.union([
  z.object({ startsAt: z.literal('10:00'), endsAt: z.literal('19:00') }),
  z.object({ startsAt: z.literal('19:00'), endsAt: z.literal('04:00') }),
])

export const shiftSchema = z.object({
  id: z.string().optional(),
  collaboratorId: z.string().min(1),
  date: z.coerce.date(),
}).and(fixedJourneySchema)

export const weeklyShiftSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  weekIndex: z.number().int().min(0),
  weekName: z.string().min(3),
  position: z.enum(['Garzon', 'Cocina', 'Barra', 'Anfitrion', 'Guardia']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export const dailyTipSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().int().positive(),
  loadedById: z.string().min(1),
})

export const assignmentSchema = z.object({
  percentages: z.object({
    Garzon: z.number().min(0).max(100),
    Cocina: z.number().min(0).max(100),
    Barra: z.number().min(0).max(100),
    Anfitrion: z.number().min(0).max(100),
    Guardia: z.number().min(0).max(100),
    Administrativo: z.number().min(0).max(100),
  }),
})

export type CollaboratorInput = z.infer<typeof collaboratorSchema>
export type ShiftInput = z.infer<typeof shiftSchema>
export type WeeklyShiftInput = z.infer<typeof weeklyShiftSchema>
export type DailyTipInput = z.infer<typeof dailyTipSchema>
export type AssignmentInput = z.infer<typeof assignmentSchema>

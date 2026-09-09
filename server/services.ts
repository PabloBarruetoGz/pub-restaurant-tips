import { buildTipAssignments, normalizeRut } from './businessRules.js'
import { ApiError, dateOnly, dayBounds } from './http.js'
import { mapCollaborator, mapDailyTip, mapShift, mapTipAssignment, mapWeeklyShift } from './mappers.js'
import { prisma } from './prisma.js'
import {
  operationalPositions,
  positionToPrisma,
  type AssignmentInput,
  type CollaboratorInput,
  type DailyTipInput,
  type ShiftInput,
  type WeeklyShiftInput,
} from './schemas.js'

function todayText() {
  return new Date().toISOString().slice(0, 10)
}

function assertNotFuture(date: Date, message: string) {
  if (dateOnly(date) > todayText()) throw new ApiError(422, message)
}

export async function getBootstrapData() {
  const [collaborators, shifts, weeklyShifts, dailyTips, assignments] = await Promise.all([
    prisma.collaborator.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    prisma.shift.findMany({ orderBy: [{ date: 'asc' }, { startsAt: 'asc' }] }),
    prisma.weeklyShift.findMany({ orderBy: [{ month: 'asc' }, { weekIndex: 'asc' }, { position: 'asc' }] }),
    prisma.dailyTip.findMany({ include: { loadedBy: { select: { name: true } } }, orderBy: { date: 'asc' } }),
    prisma.tipAssignment.findMany({ orderBy: [{ assignedAt: 'asc' }, { collaboratorId: 'asc' }] }),
  ])

  return {
    collaborators: collaborators.map(mapCollaborator),
    shifts: shifts.map(mapShift),
    weeklyShifts: weeklyShifts.map(mapWeeklyShift),
    dailyTips: dailyTips.map(mapDailyTip),
    assignments: assignments.map(mapTipAssignment),
  }
}

export async function getDashboardData(date = todayText()) {
  const { from, to } = dayBounds(date)
  const [collaborators, assignments] = await Promise.all([
    prisma.collaborator.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.tipAssignment.findMany({
      where: { dailyTip: { date: { gte: from, lte: to } } },
      include: { collaborator: true },
      orderBy: { collaborator: { name: 'asc' } },
    }),
  ])

  return {
    collaborators: collaborators.map(mapCollaborator),
    assignments: assignments.map(mapTipAssignment),
  }
}

export async function listCollaborators() {
  const collaborators = await prisma.collaborator.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })
  return collaborators.map(mapCollaborator)
}

export async function createCollaborator(input: CollaboratorInput) {
  assertNotFuture(input.startDate, 'La fecha de ingreso no puede ser superior a hoy.')

  const rut = normalizeRut(input.rut)
  const name = `${input.firstName} ${input.firstLastName} ${input.secondLastName}`.trim().replace(/\s+/g, ' ')
  const duplicate = await prisma.collaborator.findFirst({
    where: {
      OR: [
        { rut },
        { name: { equals: name, mode: 'insensitive' } },
      ],
    },
    select: { rut: true },
  })

  if (duplicate?.rut === rut) throw new ApiError(409, 'El RUT ya existe.')
  if (duplicate) throw new ApiError(409, 'El nombre del colaborador ya existe.')

  return mapCollaborator(await prisma.collaborator.create({ data: { ...input, rut, name } }))
}

export async function listShifts(from?: Date, to?: Date) {
  const shifts = await prisma.shift.findMany({
    orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
    where: {
      date: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    },
  })
  return shifts.map(mapShift)
}

export async function saveShift(input: ShiftInput) {
  const collaborator = await prisma.collaborator.findUnique({ where: { id: input.collaboratorId } })
  if (!collaborator?.active) throw new ApiError(422, 'El colaborador activo debe existir antes del turno.')
  if (!operationalPositions.includes(collaborator.position as (typeof operationalPositions)[number])) {
    throw new ApiError(422, 'Administrativos no tienen turno operativo.')
  }

  const existing = await prisma.shift.findUnique({
    where: { collaboratorId_date: { collaboratorId: input.collaboratorId, date: input.date } },
  })
  const data = {
    collaboratorId: input.collaboratorId,
    date: input.date,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  }
  const shift = existing
    ? await prisma.shift.update({ where: { id: existing.id }, data })
    : await prisma.shift.create({ data: { id: input.id, ...data } })

  return { created: !existing, shift: mapShift(shift) }
}

export async function deleteShift(id: string) {
  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) throw new ApiError(404, 'Turno no encontrado.')
  if (shift.fulfilled !== null) throw new ApiError(422, 'No se puede borrar un turno con asistencia validada.')

  const dailyTip = await prisma.dailyTip.findUnique({ where: { date: shift.date }, select: { id: true } })
  if (dailyTip) throw new ApiError(422, 'No se puede borrar un turno con propina diaria asociada.')

  await prisma.shift.delete({ where: { id: shift.id } })
}

export async function validateShift(id: string, fulfilled: boolean) {
  const currentShift = await prisma.shift.findUnique({ where: { id } })
  if (!currentShift) throw new ApiError(404, 'Turno no encontrado.')
  if (dateOnly(currentShift.date) >= todayText()) {
    throw new ApiError(422, 'Solo se pueden validar turnos anteriores a hoy.')
  }

  return mapShift(await prisma.shift.update({ where: { id }, data: { fulfilled } }))
}

export async function listWeeklyShifts(month?: string) {
  const weeklyShifts = await prisma.weeklyShift.findMany({
    orderBy: [{ month: 'asc' }, { weekIndex: 'asc' }, { position: 'asc' }],
    where: month ? { month } : undefined,
  })
  return weeklyShifts.map(mapWeeklyShift)
}

export async function saveWeeklyShift(input: WeeklyShiftInput) {
  const position = positionToPrisma[input.position]
  const weeklyShift = await prisma.weeklyShift.upsert({
    where: {
      month_weekIndex_position: {
        month: input.month,
        weekIndex: input.weekIndex,
        position,
      },
    },
    update: {
      weekName: input.weekName,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    create: {
      month: input.month,
      weekIndex: input.weekIndex,
      weekName: input.weekName,
      position,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  })
  return mapWeeklyShift(weeklyShift)
}

export async function listDailyTips(from?: Date, to?: Date) {
  const dailyTips = await prisma.dailyTip.findMany({
    include: { loadedBy: { select: { name: true } } },
    orderBy: { date: 'asc' },
    where: {
      date: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    },
  })
  return dailyTips.map(mapDailyTip)
}

export async function createDailyTip(input: DailyTipInput) {
  assertNotFuture(input.date, 'La fecha de propina no puede ser superior a hoy.')

  const loader = await prisma.account.findUnique({ where: { id: input.loadedById }, select: { id: true } })
  if (!loader) throw new ApiError(422, 'La cuenta cargadora debe existir.')

  const dailyTip = await prisma.dailyTip.create({
    data: input,
    include: { loadedBy: { select: { name: true } } },
  })
  return mapDailyTip(dailyTip)
}

export async function assignDailyTip(id: string, input: AssignmentInput) {
  const percentages = {
    GARZON: input.percentages.Garzon / 100,
    COCINA: input.percentages.Cocina / 100,
    BARRA: input.percentages.Barra / 100,
    ANFITRION: input.percentages.Anfitrion / 100,
    GUARDIA: input.percentages.Guardia / 100,
    ADMINISTRATIVO: input.percentages.Administrativo / 100,
  }

  const assignments = await prisma.$transaction(async (tx) => {
    const dailyTip = await tx.dailyTip.findUnique({ where: { id } })
    if (!dailyTip) throw new ApiError(404, 'Propina diaria no encontrada.')

    const existingAssignments = await tx.tipAssignment.count({ where: { dailyTipId: dailyTip.id } })
    if (existingAssignments > 0) throw new ApiError(409, 'La propina diaria ya fue asignada.')

    const [fulfilledShifts, adminCollaborators] = await Promise.all([
      tx.shift.findMany({
        where: { date: dailyTip.date, fulfilled: true, collaborator: { active: true } },
        include: { collaborator: true },
        orderBy: [{ collaborator: { position: 'asc' } }, { collaborator: { name: 'asc' } }],
      }),
      tx.collaborator.findMany({
        where: { position: 'ADMINISTRATIVO', active: true },
        orderBy: { name: 'asc' },
      }),
    ])

    const uniqueEligible = Array.from(
      new Map([
        ...fulfilledShifts.map((shift) => [shift.collaborator.id, {
          id: shift.collaborator.id,
          position: shift.collaborator.position,
        }] as const),
        ...adminCollaborators.map((admin) => [admin.id, {
          id: admin.id,
          position: admin.position,
        }] as const),
      ]).values(),
    )

    if (!uniqueEligible.length) {
      throw new ApiError(422, 'No hay colaboradores elegibles para asignar esta propina.')
    }

    const data = buildTipAssignments(dailyTip.id, dailyTip.amount, uniqueEligible, percentages)
    await tx.tipAssignment.createMany({ data })
    return tx.tipAssignment.findMany({
      where: { dailyTipId: dailyTip.id },
      orderBy: [{ assignedAt: 'asc' }, { collaboratorId: 'asc' }],
    })
  })

  return {
    assigned: assignments.length,
    assignments: assignments.map(mapTipAssignment),
  }
}

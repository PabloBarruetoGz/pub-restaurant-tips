import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || '' })
const prisma = new PrismaClient({ adapter })

const percentages = {
  GARZON: 0.3,
  COCINA: 0.25,
  BARRA: 0.2,
  ANFITRION: 0.15,
  GUARDIA: 0.05,
  ADMINISTRATIVO: 0.05,
} as const

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

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
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

  const cells: { date: string; inMonth: boolean }[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    cells.push({ date, inMonth: date.startsWith(month) })
    cursor.setDate(cursor.getDate() + 1)
  }

  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7))
    .map((daysInWeek, index) => {
      const monthDays = daysInWeek.filter((day) => day.inMonth)
      return {
        index,
        name: `Semana ${index + 1}`,
        start: monthDays[0]?.date || daysInWeek[0].date,
        end: monthDays[monthDays.length - 1]?.date || daysInWeek[daysInWeek.length - 1].date,
      }
    })
}

function realisticDailyTip(date: string) {
  const current = new Date(`${date}T12:00:00`)
  const day = current.getDay()
  const month = current.getMonth()
  const weekendBoost = day === 5 ? 1.42 : day === 6 ? 1.72 : day === 0 ? 1.18 : 1
  const seasonalBoost = month === 0 || month === 1 ? 1.24 : month === 6 ? 1.15 : 1
  const deterministicVariation = 0.88 + ((current.getDate() * 17 + month * 11) % 29) / 100

  return Math.round((620000 * weekendBoost * seasonalBoost * deterministicVariation) / 10000) * 10000
}

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

function dayDistance(previous: string, current: string) {
  const start = new Date(`${previous}T12:00:00`).getTime()
  const end = new Date(`${current}T12:00:00`).getTime()
  return Math.round((end - start) / 86400000)
}

function exceedsMaxConsecutiveWorkDays(dates: string[]) {
  const uniqueDates = Array.from(new Set(dates)).sort()
  let streak = 1

  for (let index = 1; index < uniqueDates.length; index += 1) {
    streak = dayDistance(uniqueDates[index - 1], uniqueDates[index]) === 1 ? streak + 1 : 1
    if (streak > 5) return true
  }

  return false
}

function deterministicRank(seed: string) {
  let hash = 0
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1000003
  }
  return hash
}

async function main() {
  const admin = await prisma.account.upsert({
    where: { email: 'admin@pub.local' },
    update: {},
    create: {
      email: 'admin@pub.local',
      name: 'Administrador General',
      role: 'ADMIN',
    },
  })

  const requiredByPosition = {
    GARZON: 60,
    COCINA: 40,
    BARRA: 30,
    ANFITRION: 20,
    GUARDIA: 30,
    ADMINISTRATIVO: 5,
  } as const

  const septemberTargets = {
    GARZON: 40,
    COCINA: 30,
    BARRA: 20,
    ANFITRION: 12,
    GUARDIA: 20,
  } as const

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

  const collaborators = Object.entries(requiredByPosition).flatMap(([position, total], positionIndex) =>
    Array.from({ length: total }, (_, index) => {
      const sequence = positionIndex * 100 + index + 1
      const firstName = firstNames[(sequence - 1) % firstNames.length]
      const firstLastName = firstLastNames[Math.floor((sequence - 1) / firstNames.length) % firstLastNames.length]
      const secondLastName = secondLastNames[Math.floor((sequence - 1) / (firstNames.length * firstLastNames.length)) % secondLastNames.length]
      return [
        `c${sequence}`,
        validRut(sequence),
        firstName,
        firstLastName,
        secondLastName,
        `+569${80000000 + sequence}`,
        addresses[index % addresses.length],
        position,
        `2025-${String((index % 12) + 1).padStart(2, '0')}-01`,
      ] as const
    }),
  )

  for (const [id, rut, firstName, firstLastName, secondLastName, phone, address, position, startDate] of collaborators) {
    await prisma.collaborator.upsert({
      where: { rut },
      update: {},
      create: {
        id,
        rut,
        firstName,
        firstLastName,
        secondLastName,
        name: `${firstName} ${firstLastName} ${secondLastName}`,
        phone,
        address,
        position,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
      },
    })
  }

  const storedCollaborators = await prisma.collaborator.findMany({ orderBy: { rut: 'asc' } })
  const operationalCollaborators = storedCollaborators.filter(
    (collaborator) => collaborator.position !== 'ADMINISTRATIVO',
  )
  let shiftDayIndex = 0

  for (const dateText of dateRange('2025-01-01', '2026-08-31')) {
    const date = new Date(`${dateText}T00:00:00.000Z`)
    const dailyTip = await prisma.dailyTip.upsert({
      where: { date },
      update: {},
      create: {
        date,
        amount: realisticDailyTip(dateText),
        loadedById: admin.id,
      },
    })

    const weekDay = new Date(`${dateText}T12:00:00`).getDay()
    const currentShiftDayIndex = shiftDayIndex
    if (weekDay >= 1 && weekDay <= 5) {
      for (const [collaboratorIndex, collaborator] of operationalCollaborators.entries()) {
        await prisma.shift.upsert({
          where: { collaboratorId_date: { collaboratorId: collaborator.id, date } },
          update: {},
          create: {
            collaboratorId: collaborator.id,
            date,
            startsAt: collaboratorIndex % 2 === 0 ? '10:00' : '19:00',
            endsAt: collaboratorIndex % 2 === 0 ? '19:00' : '04:00',
            fulfilled: (currentShiftDayIndex + collaboratorIndex) % 19 !== 0,
          },
        })
      }
      shiftDayIndex += 1
    }

    for (const [position, percentage] of Object.entries(percentages)) {
      const members = operationalCollaborators.filter(
        (collaborator, collaboratorIndex) =>
          collaborator.position === position &&
          weekDay >= 1 &&
          weekDay <= 5 &&
          (currentShiftDayIndex + collaboratorIndex) % 19 !== 0,
      )
      const amount = members.length ? Math.floor(Math.round(dailyTip.amount * percentage) / members.length) : 0

      for (const member of members) {
        await prisma.tipAssignment.upsert({
          where: { dailyTipId_collaboratorId: { dailyTipId: dailyTip.id, collaboratorId: member.id } },
          update: {},
          create: {
            dailyTipId: dailyTip.id,
            collaboratorId: member.id,
            amount,
          },
        })
      }
    }
  }

  await prisma.weeklyShift.deleteMany({ where: { month: '2026-09' } })
  await prisma.shift.deleteMany({
    where: {
      date: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T23:59:59.999Z'),
      },
    },
  })

  const septemberDates = dateRange('2026-09-01', '2026-09-30')
  const septemberSundayCount = septemberDates.filter((date) => new Date(`${date}T12:00:00`).getDay() === 0).length
  const workDatesByCollaborator = new Map<string, string[]>()
  const sundayCountByCollaborator = new Map<string, number>()
  const previousShifts = await prisma.shift.findMany({
    where: {
      date: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-31T23:59:59.999Z'),
      },
    },
  })

  for (const shift of previousShifts) {
    const dateText = shift.date.toISOString().slice(0, 10)
    workDatesByCollaborator.set(shift.collaboratorId, [
      ...(workDatesByCollaborator.get(shift.collaboratorId) || []),
      dateText,
    ])
  }

  for (const dateText of septemberDates) {
    const isSunday = new Date(`${dateText}T12:00:00`).getDay() === 0

    for (const [position, target] of Object.entries(septemberTargets)) {
      const positionSize = storedCollaborators.filter((collaborator) => collaborator.position === position).length
      const dailyTarget = isSunday ? Math.min(target, Math.floor((positionSize * 2) / septemberSundayCount)) : target
      const members = storedCollaborators
        .filter((collaborator) => collaborator.position === position)
        .map((collaborator) => ({
          collaborator,
          load: workDatesByCollaborator.get(collaborator.id)?.filter((date) => date.startsWith('2026-09')).length || 0,
          sundays: sundayCountByCollaborator.get(collaborator.id) || 0,
          rank: deterministicRank(`${dateText}-${position}-${collaborator.id}`),
        }))
        .sort((a, b) => (
          isSunday
            ? a.sundays - b.sundays || a.load - b.load || a.rank - b.rank
            : a.load - b.load || a.rank - b.rank
        ))

      let assigned = 0
      for (const member of members) {
        if (assigned >= dailyTarget) break
        const currentDates = workDatesByCollaborator.get(member.collaborator.id) || []
        const nextDates = [...currentDates, dateText]
        const sundayCount = sundayCountByCollaborator.get(member.collaborator.id) || 0

        if (exceedsMaxConsecutiveWorkDays(nextDates)) continue
        if (isSunday && sundayCount >= 2) continue

        await prisma.shift.create({
          data: {
            id: `sep-${dateText}-${member.collaborator.id}`,
            collaboratorId: member.collaborator.id,
            date: new Date(`${dateText}T00:00:00.000Z`),
            startsAt: assigned % 2 === 0 ? '10:00' : '19:00',
            endsAt: assigned % 2 === 0 ? '19:00' : '04:00',
            fulfilled: null,
          },
        })
        workDatesByCollaborator.set(member.collaborator.id, nextDates)
        if (isSunday) sundayCountByCollaborator.set(member.collaborator.id, sundayCount + 1)
        assigned += 1
      }
    }
  }

  for (const week of monthWeekSegments('2026-09')) {
    for (const position of Object.keys(septemberTargets)) {
      await prisma.weeklyShift.upsert({
        where: {
          month_weekIndex_position: {
            month: '2026-09',
            weekIndex: week.index,
            position: position as keyof typeof septemberTargets,
          },
        },
        update: {
          weekName: week.name,
          startDate: new Date(`${week.start}T00:00:00.000Z`),
          endDate: new Date(`${week.end}T00:00:00.000Z`),
        },
        create: {
          month: '2026-09',
          weekIndex: week.index,
          weekName: week.name,
          position: position as keyof typeof septemberTargets,
          startDate: new Date(`${week.start}T00:00:00.000Z`),
          endDate: new Date(`${week.end}T00:00:00.000Z`),
        },
      })
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect()
})

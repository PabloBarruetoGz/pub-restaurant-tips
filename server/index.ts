import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import { Sentry } from './sentry.js'
import { config } from './config.js'
import { asyncHandler, handleApiError, parseOptionalDate } from './http.js'
import {
  assignDailyTip,
  createCollaborator,
  createDailyTip,
  deleteShift,
  getBootstrapData,
  getDashboardData,
  listCollaborators,
  listDailyTips,
  listShifts,
  listWeeklyShifts,
  saveShift,
  saveWeeklyShift,
  validateShift,
} from './services.js'
import {
  assignmentSchema,
  collaboratorSchema,
  dailyTipSchema,
  shiftSchema,
  weeklyShiftSchema,
} from './schemas.js'

const app = express()

app.use(cors({ origin: config.CORS_ORIGIN || true }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'pub-restaurant-tips' })
})

app.get('/api/bootstrap', asyncHandler(async (_request, response) => {
  response.json(await getBootstrapData())
}))

app.get('/api/dashboard', asyncHandler(async (request, response) => {
  response.json(await getDashboardData(request.query.date ? String(request.query.date) : undefined))
}))

app.get('/api/collaborators', asyncHandler(async (_request, response) => {
  response.json(await listCollaborators())
}))

app.post('/api/collaborators', asyncHandler(async (request, response) => {
  response.status(201).json(await createCollaborator(collaboratorSchema.parse(request.body)))
}))

app.get('/api/shifts', asyncHandler(async (request, response) => {
  response.json(await listShifts(parseOptionalDate(request.query.from), parseOptionalDate(request.query.to)))
}))

app.post('/api/shifts', asyncHandler(async (request, response) => {
  const result = await saveShift(shiftSchema.parse(request.body))
  response.status(result.created ? 201 : 200).json(result.shift)
}))

app.delete('/api/shifts/:id', asyncHandler(async (request, response) => {
  await deleteShift(String(request.params.id))
  response.status(204).send()
}))

app.get('/api/shift-weeks', asyncHandler(async (request, response) => {
  response.json(await listWeeklyShifts(request.query.month ? String(request.query.month) : undefined))
}))

app.post('/api/shift-weeks', asyncHandler(async (request, response) => {
  response.status(201).json(await saveWeeklyShift(weeklyShiftSchema.parse(request.body)))
}))

app.patch('/api/shifts/:id/validation', asyncHandler(async (request, response) => {
  const body = z.object({ fulfilled: z.boolean() }).parse(request.body)
  response.json(await validateShift(String(request.params.id), body.fulfilled))
}))

app.get('/api/daily-tips', asyncHandler(async (request, response) => {
  response.json(await listDailyTips(parseOptionalDate(request.query.from), parseOptionalDate(request.query.to)))
}))

app.post('/api/daily-tips', asyncHandler(async (request, response) => {
  response.status(201).json(await createDailyTip(dailyTipSchema.parse(request.body)))
}))

app.post('/api/daily-tips/:id/assign', asyncHandler(async (request, response) => {
  response.status(201).json(await assignDailyTip(String(request.params.id), assignmentSchema.parse(request.body)))
}))

Sentry.setupExpressErrorHandler(app)
app.use(handleApiError)

app.listen(config.PORT, () => {
  console.log(`API running on http://localhost:${config.PORT}`)
})

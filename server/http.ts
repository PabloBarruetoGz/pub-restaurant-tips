import type express from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function asyncHandler(
  handler: (request: express.Request, response: express.Response, next: express.NextFunction) => Promise<unknown>,
) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    void handler(request, response, next).catch(next)
  }
}

export function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function dayBounds(dateText: string) {
  return {
    from: new Date(`${dateText}T00:00:00.000Z`),
    to: new Date(`${dateText}T23:59:59.999Z`),
  }
}

export function parseOptionalDate(value: unknown) {
  return value ? z.coerce.date().parse(value) : undefined
}

export function handleApiError(
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction,
) {
  if (error instanceof ApiError) return response.status(error.status).json({ error: error.message })
  if (error instanceof z.ZodError) return response.status(400).json({ error: error.issues })
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return response.status(409).json({ error: 'El registro ya existe.' })
    if (error.code === 'P2025') return response.status(404).json({ error: 'Registro no encontrado.' })
  }
  if (error instanceof Error) return response.status(400).json({ error: error.message })
  return response.status(500).json({ error: 'Error interno.' })
}

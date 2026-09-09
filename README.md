# Pub Restaurant Tips

Aplicacion React + Vite con API Express y Prisma para gestionar propinas.

## Desarrollo

```bash
npm install
npm run dev
```

La API corre en `http://localhost:4000` y Vite usa su puerto disponible por defecto.

## Sentry

El proyecto ya inicializa Sentry en frontend y backend:

- Frontend: `src/sentry.ts`, importado desde `src/main.tsx`.
- Backend: `server/sentry.ts`, precargado con `node --import ./server/sentry.ts`.
- Sourcemaps: `vite.config.ts` usa `@sentry/vite-plugin` cuando hay credenciales.

Variables de runtime:

```bash
SENTRY_DSN=
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0.1

VITE_SENTRY_DSN=
VITE_SENTRY_RELEASE=
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

Variables para subir sourcemaps durante `npm run build`:

```bash
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

Puedes poner las variables de sourcemaps en `.env.sentry-build-plugin`.

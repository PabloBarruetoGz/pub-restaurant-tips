import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { config as loadDotenv } from 'dotenv'
import { defineConfig, loadEnv, type PluginOption } from 'vite'

loadDotenv({ path: '.env.sentry-build-plugin', override: false })

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN || process.env.SENTRY_AUTH_TOKEN
  const plugins: PluginOption[] = [react()]

  if (sentryAuthToken && env.SENTRY_ORG && env.SENTRY_PROJECT) {
    plugins.push(sentryVitePlugin({
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      authToken: sentryAuthToken,
      release: {
        name: env.SENTRY_RELEASE || env.VITE_SENTRY_RELEASE || undefined,
      },
    }))
  }

  return {
    build: {
      sourcemap: true,
    },
    plugins,
  }
})

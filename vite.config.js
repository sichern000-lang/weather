import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// 로컬 개발용: Vercel 서버리스 함수(api/weather.js)를 Vite 개발 서버에서 대신 실행한다.
function apiDev() {
  return {
    name: 'api-dev',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      server.middlewares.use('/api', async (req, res, next) => {
        const name = /^\/(weather|history)(?:\?|$)/.exec(req.url)?.[1]
        if (!name) return next()
        const mod = await server.ssrLoadModule(`/api/${name}.js`)
        req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
        res.status = (code) => ((res.statusCode = code), res)
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        await mod.default(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDev()],
})

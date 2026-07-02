import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * LLM CORS 代理插件（仅 dev）
 *
 * 浏览器无法直接调用 Anthropic / Volces Ark / OpenAI 等 LLM API（CORS 限制）。
 * 这个中间件让前端把请求发到 /llm-proxy，在 header `x-llm-target` 中带上真实目标 URL，
 * 由 dev server 转发，去掉 Origin / Referer，避免被对方拒绝。
 *
 * 前端使用：
 *   fetch('/llm-proxy/v1/chat/completions', {
 *     headers: { 'x-llm-target': 'https://api.openai.com', ... },
 *     ...
 *   })
 * 即把 https://api.openai.com/v1/chat/completions 通过本地代理转发。
 */
function llmProxyPlugin() {
  return {
    name: 'llm-cors-proxy',
    configureServer(server: any) {
      server.middlewares.use('/llm-proxy', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const target = req.headers['x-llm-target'] as string | undefined
          if (!target) {
            res.statusCode = 400
            res.end('Missing x-llm-target header')
            return
          }

          // /llm-proxy/foo/bar -> /foo/bar
          const subPath = (req.url || '/').replace(/^\/+/, '/')
          const targetUrl = target.replace(/\/+$/, '') + subPath

          // 透传 method / headers / body
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.headers)) {
            const key = k.toLowerCase()
            // 屏蔽浏览器自动添加且会触发 CORS / 被服务端拒绝的头
            if (
              key === 'host' ||
              key === 'origin' ||
              key === 'referer' ||
              key === 'connection' ||
              key === 'content-length' ||
              key === 'x-llm-target' ||
              key === 'sec-fetch-mode' ||
              key === 'sec-fetch-site' ||
              key === 'sec-fetch-dest' ||
              key === 'accept-encoding' ||
              key.startsWith('sec-ch-')
            ) {
              continue
            }
            if (typeof v === 'string') headers[k] = v
            else if (Array.isArray(v)) headers[k] = v.join(',')
          }

          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', async () => {
            const body = chunks.length ? Buffer.concat(chunks) : undefined
            try {
              const upstream = await fetch(targetUrl, {
                method: req.method,
                headers,
                body: body && body.length ? body : undefined,
              })
              res.statusCode = upstream.status
              upstream.headers.forEach((value, key) => {
                const lk = key.toLowerCase()
                // 这些 header 必须过滤：
                //  - content-encoding：上游可能是 gzip/br，但 fetch 已自动解压，我们写出的是明文
                //  - content-length：上游若返回压缩后的字节数，浏览器会按错误长度截断
                //  - transfer-encoding / connection：node http server 自己管
                if (
                  lk === 'content-encoding' ||
                  lk === 'content-length' ||
                  lk === 'transfer-encoding' ||
                  lk === 'connection'
                ) return
                res.setHeader(key, value)
              })
              const buf = Buffer.from(await upstream.arrayBuffer())
              res.setHeader('content-length', String(buf.length))
              res.end(buf)
            } catch (err: any) {
              res.statusCode = 502
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'llm-proxy upstream error', detail: String(err?.message || err) }))
            }
          })
          req.on('error', (err) => {
            res.statusCode = 500
            res.end(String(err?.message || err))
          })
        } catch (err: any) {
          res.statusCode = 500
          res.end(String(err?.message || err))
        }
      })
    },
  }
}

/**
 * Langfuse 摄取代理插件（仅 dev）。
 *
 * 关键背景：Langfuse 的 trace/generation 摄取要求 Basic auth（publicKey:secretKey），
 * public key 单独（Bearer）只能用于 score/feedback，trace-create 会被拒 401 Access Scope Denied。
 * 而 secret key 绝不能进浏览器 bundle。因此浏览器 SDK 不能直连 Langfuse 摄取 trace。
 *
 * 本中间件把浏览器对 /langfuse-proxy/* 的请求转发到 Langfuse，
 * 用 server 端 process.env 里的 secret key 注入 Basic auth（剥离浏览器发的 Bearer public 头）。
 * secret key 只存在于 dev server 进程，绝不写入浏览器 bundle。
 *
 * 浏览器侧把 VITE_LANGFUSE_BASE_URL 设为 /langfuse-proxy，SDK 即会 POST 到
 * /langfuse-proxy/api/public/ingestion，由本插件转发到 ${LANGFUSE_BASE_URL}/api/public/ingestion。
 *
 * 仅 dev：生产环境若需 trace 上报，需另起后端代理。
 */
function langfuseProxyPlugin(env: Record<string, string>) {
  const publicKey = env.LANGFUSE_PUBLIC_KEY || env.VITE_LANGFUSE_PUBLIC_KEY
  const secretKey = env.LANGFUSE_SECRET_KEY
  const baseUrl = (env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/+$/, '')

  return {
    name: 'langfuse-ingestion-proxy',
    configureServer(server: any) {
      server.middlewares.use('/langfuse-proxy', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          if (!publicKey || !secretKey) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'langfuse-proxy: LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY 未在 .env.local 配置' }))
            return
          }
          // /langfuse-proxy/foo/bar -> /foo/bar
          const subPath = (req.url || '/').replace(/^\/+/, '/')
          const targetUrl = baseUrl + subPath

          // 透传除 auth / 浏览器自动头外的所有头
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.headers)) {
            const key = k.toLowerCase()
            if (
              key === 'host' || key === 'origin' || key === 'referer' || key === 'connection' ||
              key === 'content-length' || key === 'authorization' || // 关键：剥离浏览器 Bearer public
              key === 'sec-fetch-mode' || key === 'sec-fetch-site' || key === 'sec-fetch-dest' ||
              key === 'accept-encoding' || key.startsWith('sec-ch-')
            ) continue
            if (typeof v === 'string') headers[k] = v
            else if (Array.isArray(v)) headers[k] = v.join(',')
          }
          // 注入 server 端 Basic auth（public:secret）
          headers['authorization'] = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64')

          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', async () => {
            const body = chunks.length ? Buffer.concat(chunks) : undefined
            try {
              const upstream = await fetch(targetUrl, {
                method: req.method,
                headers,
                body: body && body.length ? body : undefined,
              })
              res.statusCode = upstream.status
              upstream.headers.forEach((value, key) => {
                const lk = key.toLowerCase()
                if (lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding' || lk === 'connection') return
                res.setHeader(key, value)
              })
              const buf = Buffer.from(await upstream.arrayBuffer())
              res.setHeader('content-length', String(buf.length))
              res.end(buf)
            } catch (err: any) {
              res.statusCode = 502
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'langfuse-proxy upstream error', detail: String(err?.message || err) }))
            }
          })
          req.on('error', (err) => {
            res.statusCode = 500
            res.end(String(err?.message || err))
          })
        } catch (err: any) {
          res.statusCode = 500
          res.end(String(err?.message || err))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // loadEnv 读取 .env / .env.local（含无 VITE_ 前缀的 server 端变量），供代理插件使用
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), llmProxyPlugin(), langfuseProxyPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
  }
})

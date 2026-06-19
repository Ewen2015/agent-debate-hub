import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react(), llmProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})

/**
 * 把真实的 LLM API URL 转成 dev 代理 URL，用于绕开浏览器的 CORS 限制。
 *
 * 例如：
 *   https://api.openai.com/v1/chat/completions
 *   →  /llm-proxy/v1/chat/completions  +  header { 'x-llm-target': 'https://api.openai.com' }
 *
 * 在生产构建中（部署到自家后端），可改用环境变量关闭代理。
 */

export interface ProxiedRequest {
  /** 实际 fetch 用的 URL，已替换为 /llm-proxy/... */
  url: string;
  /** 必须附加到 headers 上的字段 */
  proxyHeaders: Record<string, string>;
}

const PROXY_PREFIX = '/llm-proxy';

/**
 * 对常见 baseUrl 做容错修正：
 *  - 火山 Ark Coding Plan：必须以 /api/coding/v1 结尾，否则补全
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let v = baseUrl.trim().replace(/\/+$/, '');
  if (v.includes('ark.cn-beijing.volces.com')) {
    if (/\/api\/coding$/.test(v)) v = v + '/v1';
    else if (!/\/api\/coding\/v1$/.test(v) && /\/api\/coding\//.test(v) === false && v.endsWith('volces.com')) {
      v = v + '/api/coding/v1';
    }
  }
  return v;
}

/**
 * baseUrl 例：https://api.openai.com/v1
 *   origin   = https://api.openai.com
 *   subPath  = /v1
 *   path     = /chat/completions
 *   返回 url = /llm-proxy/v1/chat/completions
 */
export function buildProxiedUrl(baseUrl: string, path: string): ProxiedRequest {
  const trimmedBase = normalizeBaseUrl(baseUrl);
  let origin = trimmedBase;
  let subPath = '';
  try {
    const u = new URL(trimmedBase);
    origin = `${u.protocol}//${u.host}`;
    subPath = u.pathname.replace(/\/+$/, '');
  } catch {
    // baseUrl 不是合法 URL — 直接拼接，让上游报错
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return {
    url: `${PROXY_PREFIX}${subPath}${cleanPath}`,
    proxyHeaders: { 'x-llm-target': origin },
  };
}


/**
 * Langfuse 浏览器端追踪客户端。
 *
 * 安全模型（关键）：
 *  - 只读取 VITE_LANGFUSE_PUBLIC_KEY（public key 可安全暴露在前端 bundle）。
 *  - 绝不 import / 读取 LANGFUSE_SECRET_KEY —— 该变量无 VITE_ 前缀，Vite 不会内联，
 *    且本文件不引用它。secret key 仅在 scripts/eval/ 下的 Node 评测脚本中使用。
 *  - 未配置 public key 时返回 null，LangGraph 子图与 speak() 仍正常运行，只是不上报 trace。
 *
 * 直连 cloud.langfuse.com（已验证 CORS 放行 localhost:5173）。
 * 自托管实例若无 CORS，可在 vite.config.ts 加 langfuseProxyPlugin 并把
 * VITE_LANGFUSE_BASE_URL 指向 /langfuse-proxy（默认不开）。
 */

import { Langfuse } from 'langfuse';
import { logger } from './logger';

let client: Langfuse | null = null;
let initAttempted = false;

/**
 * 初始化 Langfuse 客户端。幂等。
 * 返回 null 表示未配置 / 追踪关闭。
 */
export function initLangfuse(): Langfuse | null {
  if (initAttempted) return client;
  initAttempted = true;

  const meta = import.meta as any;
  const publicKey = meta.env?.VITE_LANGFUSE_PUBLIC_KEY?.trim();
  if (!publicKey) {
    // 未配置 → 静默关闭，不报错
    return null;
  }

  const baseUrl = meta.env?.VITE_LANGFUSE_BASE_URL?.trim() || 'https://cloud.langfuse.com';

  try {
    client = new Langfuse({
      publicKey,
      // secretKey 在浏览器构造中被 Omit 掉，这里绝不传
      baseUrl,
      // dev 可见性优先：每条观测立即 flush；长辩论可调高以减少请求数
      flushAt: 1,
      requestTimeout: 10_000,
      enabled: true,
    });
    logger.info('langfuse', '浏览器追踪已启用', { baseUrl, publicKey: publicKey.slice(0, 10) + '…' });
  } catch (e) {
    logger.warn('langfuse', '初始化失败，追踪关闭', { error: e instanceof Error ? e.message : String(e) });
    client = null;
  }
  return client;
}

/**
 * 获取已初始化的客户端；未配置返回 null。所有 trace/span/generation 调用都应通过它，
 * 调用方用 `lf?.trace(...)` 模式，确保未配置时无副作用。
 */
export function getLangfuse(): Langfuse | null {
  if (!initAttempted) initLangfuse();
  return client;
}

/**
 * 刷新挂起的观测到 Langfuse。在 speak() / summarizeRound() 结束后调用。
 * 失败静默 —— 追踪是 fire-and-forget，绝不能阻断辩论流程。
 */
export async function flushLangfuse(): Promise<void> {
  try {
    await client?.flushAsync();
  } catch {
    // 静默
  }
}

/**
 * 进程退出前清理（如页面卸载）。dev 中可不调用。
 */
export async function shutdownLangfuse(): Promise<void> {
  try {
    await client?.shutdownAsync();
  } catch {
    // 静默
  }
}

/**
 * SearchResolver：把 LLM 想要的检索词，转换成可引用的 Source。
 *
 * 多 Provider 策略：
 *  1. 通过搜索引擎 API 拉真资料：Tavily / Serper。
 *  2. 都没有则返回空数组（不使用假数据，保持诚实）。
 *  3. 对于支持原生联网的 Provider（Anthropic / Ark），LLM 会直接搜索，
 *     不经过本文件。
 *
 * Key 来源优先级：Gateway 面板 UI 配置 > .env.local 环境变量。
 */

import type { Source } from '@/types';
import { useGatewayStore } from '@/store/staticStores';

const TAVILY_API = 'https://api.tavily.com/search';
const SERPER_API = 'https://google.serper.dev/search';

const envKey = (name: string) =>
  ((import.meta as any).env?.[`VITE_${name}`] as string | undefined)?.trim() || '';

/** 动态获取 Tavily Key：优先 UI 配置，回退 env */
const getTavilyKey = (): string => useGatewayStore.getState().tavilyKey || envKey('TAVILY_API_KEY');
/** 动态获取 Serper Key：优先 UI 配置，回退 env */
const getSerperKey = (): string => useGatewayStore.getState().serperKey || envKey('SERPER_API_KEY');

export function isSearchResolverConfigured(): boolean {
  return Boolean(getTavilyKey() || getSerperKey());
}

export async function resolveSource(query: string, recencyDays?: number): Promise<Source[]> {
  const tavilyKey = getTavilyKey();
  const serperKey = getSerperKey();

  // 1. Tavily
  if (tavilyKey) {
    try {
      const res = await fetch(TAVILY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: 4,
          days: recencyDays || 365,
          include_raw_content: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        return results.slice(0, 3).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          domain: domainOf(r.url || ''),
          snippet: r.content?.slice(0, 240) || '',
        }));
      }
    } catch {}
  }
  // 2. Serper
  if (serperKey) {
    try {
      const res = await fetch(SERPER_API, {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.organic || [];
        return results.slice(0, 3).map((r: any) => ({
          title: r.title || '',
          url: r.link || '',
          domain: domainOf(r.link || ''),
          snippet: r.snippet || '',
        }));
      }
    } catch {}
  }
  // 3. 无搜索 API Key — 返回空结果（不使用假数据，保持诚实）
  return [];
};

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

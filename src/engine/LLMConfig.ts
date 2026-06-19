import { useGatewayStore } from '@/store/staticStores';
import type { LLMConfig } from '@/engine/LLMClient';

const envValue = (key: 'VITE_LLM_API_KEY' | 'VITE_LLM_BASE_URL' | 'VITE_LLM_MODEL') =>
  (import.meta.env?.[key] as string | undefined)?.trim();

const pick = (gatewayValue: string, envKey: 'VITE_LLM_API_KEY' | 'VITE_LLM_BASE_URL' | 'VITE_LLM_MODEL') =>
  gatewayValue.trim() || envValue(envKey) || '';

export const resolveLLMConfig = (): LLMConfig | null => {
  const store = useGatewayStore.getState();
  const cur = store.providers.find((p) => p.id === store.activeProviderId);
  if (!cur) return null;

  return {
    baseUrl: pick(cur.baseUrl, 'VITE_LLM_BASE_URL'),
    apiKey: pick(cur.apiKey, 'VITE_LLM_API_KEY'),
    model: pick(cur.model, 'VITE_LLM_MODEL'),
    temperature: cur.temperature,
    maxTokens: cur.maxTokens,
    enableSearch: cur.enableSearch,
  };
};

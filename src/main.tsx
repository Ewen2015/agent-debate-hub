import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { initTheme } from './store/themeStore';
import { initLangfuse, flushLangfuse } from './engine/langfuse';

initTheme();
// 初始化 Langfuse 浏览器追踪（未配置 public key 时为 no-op）。
// 尽早初始化，确保后续 speak/summarizeRound 的 trace 能正常上报。
initLangfuse();

// 页面卸载前 flush，避免辩论中途关闭页面丢失尚未上报的观测（Langfuse 最佳实践）。
window.addEventListener('beforeunload', () => {
  void flushLangfuse();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

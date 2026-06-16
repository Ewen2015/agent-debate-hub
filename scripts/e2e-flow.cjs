// E2E: 通过单一 IIFE 包装全部操作
const WebSocket = require('ws');
const http = require('http');

const TARGET_URL = 'http://localhost:5173/';

function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const targets = JSON.parse(body);
          const page = targets.find(t => t.type === 'page');
          if (!page) reject(new Error('no page target'));
          else resolve(page.webSocketDebuggerUrl);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async run(expr) {
    // 用 awaitPromise 跑一个 IIFE；返回值必须是 plain JSON
    const r = await this.send('Runtime.evaluate', {
      expression: `(${expr})()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }
  async snap(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(path, Buffer.from(data, 'base64'));
  }
}

(async () => {
  const targetUrl = await getTarget();
  console.log('connecting to', targetUrl);
  const ws = new WebSocket(targetUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Navigate
  await cdp.send('Page.navigate', { url: TARGET_URL });
  await new Promise(r => setTimeout(r, 2000));

  // 1. 清空 storage 并 reload
  console.log('--- 1. clear storage + reload ---');
  await cdp.run(() => new Promise(res => {
    Object.keys(localStorage).filter(k => k.startsWith('gd-hub:')).forEach(k => localStorage.removeItem(k));
    res('cleared');
  }));
  await cdp.send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2000));

  // 2. 注入议题
  console.log('--- 2. type question ---');
  await cdp.run(() => {
    const ta = document.querySelector('textarea[placeholder*="提出一个值得"]');
    if (!ta) throw new Error('textarea not found');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '公司是否应该全面接入 LLM Agent 来替代一线客服？');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  });
  await new Promise(r => setTimeout(r, 800));
  await cdp.snap('/tmp/e2e-1-question.png');

  // 3. 点击开始 Brainstorm
  console.log('--- 3. start brainstorm ---');
  const click1 = await cdp.run(() => {
    const norm = s => (s || '').toLowerCase();
    const btn = [...document.querySelectorAll('button')].find(b =>
      norm(b.innerText).includes('开始 brainstorm') ||
      norm(b.innerText).includes('开始brainstorm')
    );
    if (!btn) return { ok: false, reason: 'no button', allTexts: [...document.querySelectorAll('button')].map(b => b.innerText) };
    if (btn.disabled) return { ok: false, reason: 'disabled' };
    btn.click();
    return { ok: true };
  });
  console.log('  click result:', click1);

  // 4. 等待发言出现
  console.log('--- 4. wait for speeches ---');
  const start = Date.now();
  let speechCount = 0;
  let phase = 'unknown';
  while (Date.now() - start < 20000) {
    const r = await cdp.run(() => {
      const article = document.querySelectorAll('article').length;
      const txt = document.body.innerText;
      phase = txt.includes('BRAINSTORM 进行中') ? 'brainstorm' :
              txt.includes('DEBATE 进行中') ? 'debate' :
              (txt.includes('待开始') || txt.includes('已就绪')) ? 'idle' : 'unknown';
      return { article, phase };
    });
    speechCount = r.article;
    if (r.phase === 'idle' && r.article > 0) break;
    await new Promise(r => setTimeout(r, 600));
  }
  console.log('  after wait: phase=' + phase + ', articles=' + speechCount);

  await cdp.snap('/tmp/e2e-2-bs-done.png');

  // 5. 检查「进入 Debate」按钮
  console.log('--- 5. check Enter Debate ---');
  const hasEnter = await cdp.run(() => {
    const norm = s => (s || '').toLowerCase();
    const btn = [...document.querySelectorAll('button')].find(b =>
      norm(b.innerText).includes('进入 debate')
    );
    return !!btn;
  });
  console.log('  has Enter Debate button:', hasEnter);

  // 6. 点击进入 Debate
  if (hasEnter) {
    await cdp.run(() => {
      const norm = s => (s || '').toLowerCase();
      const btn = [...document.querySelectorAll('button')].find(b =>
        norm(b.innerText).includes('进入 debate')
      );
      btn.click();
      return 'clicked';
    });
    await new Promise(r => setTimeout(r, 5000));
    await cdp.snap('/tmp/e2e-3-debate.png');

    const inDebate = await cdp.run(() => {
      return document.body.innerText.includes('Debate 进行中') ||
             document.body.innerText.includes('第 1 /');
    });
    console.log('  debate phase started:', inDebate);
  }

  ws.close();
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});

const WebSocket = require('ws');
const http = require('http');

function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const targets = JSON.parse(body);
        resolve(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
      });
    });
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.on('message', d => { const m = JSON.parse(d);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => {
    this.pending.set(id, { resolve: res, reject: rej });
    this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async run(expr) { const r = await this.send('Runtime.evaluate', { expression: `(${expr})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value; }
}

(async () => {
  const ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');

  const result = await cdp.run(() => {
    const tas = document.querySelectorAll('textarea');
    const btns = document.querySelectorAll('button');
    return {
      taCount: tas.length,
      taPlaceholders: [...tas].map(t => t.placeholder.slice(0, 30)),
      btnCount: btns.length,
      btnTexts: [...btns].slice(0, 15).map(b => b.innerText && b.innerText.trim().slice(0, 30)),
      url: location.href,
      title: document.title,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  ws.close();
})();

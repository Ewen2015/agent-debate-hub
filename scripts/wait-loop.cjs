const WebSocket = require('ws');
const http = require('http');
function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b).find(t=>t.type==='page').webSocketDebuggerUrl));
    });
  });
}
class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();
    ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});}
  send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));});}
  async run(expr){const r=await this.send('Runtime.evaluate',{expression:`(${expr})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
}
(async () => {
  const ws = new WebSocket(await getTarget());
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  const cdp = new CDP(ws);
  for (let i = 0; i < 12; i++) {
    const s = await cdp.run(() => ({
      phase: document.body.innerText.includes('BRAINSTORM 进行中') ? 'brainstorm' :
             document.body.innerText.includes('待开始') ? 'idle' :
             document.body.innerText.includes('DEBATE 进行中') ? 'debate' : 'unknown',
      eventLines: document.querySelectorAll('.scroll-shadow li').length,
      articles: document.querySelectorAll('article').length,
      buttons: [...document.querySelectorAll('button')].slice(0,5).map(b => (b.innerText||'').slice(0,20)),
    }));
    console.log(`t+${i*2}s:`, JSON.stringify(s));
    await new Promise(r => setTimeout(r, 2000));
  }
  ws.close();
})();

import { createServer } from "node:http";

const port = Number(process.argv[2]);
if (!port) throw new Error("port required");
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname !== "/") return send(response, 404, "<!doctype html><h1>Not Found</h1>");
  send(response, 200, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Popup fixture</title><style>
body{margin:0;font-family:Arial,sans-serif}main{min-height:1200px;padding:80px}.entry-layer{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:rgba(0,0,0,.68);transition:opacity 200ms ease}.entry-layer.closed{opacity:0;visibility:hidden;pointer-events:none}.entry-popup{width:min(760px,90vw);padding:32px;background:white}.popup-controls{display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-top:24px}.visually-hidden{position:absolute;width:1px;height:1px;opacity:0}.popup-close{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#111;color:white;cursor:pointer}
</style></head><body><main><h1>Underlying page</h1></main>
<div class="entry-layer" id="entry-layer"><section class="entry-popup" role="dialog" aria-modal="true" aria-label="공지 팝업">
<h2>입주 안내</h2><p>첫 방문 공지입니다.</p><div class="popup-controls"><label id="hide-today-label"><input class="visually-hidden" id="hide-today" type="checkbox"><span>오늘 하루 이 창을 열지 않음</span></label><div id="popup-close" class="popup-close" aria-label="닫기">×</div></div>
</section></div><script>
const key='popup-hidden-date';const today=new Date().toISOString().slice(0,10);const layer=document.querySelector('#entry-layer');
if(localStorage.getItem(key)===today)layer.classList.add('closed');
document.querySelector('#popup-close').addEventListener('click',()=>{if(document.querySelector('#hide-today').checked)localStorage.setItem(key,today);layer.classList.add('closed')});
</script></body></html>`);
});
server.listen(port, "127.0.0.1", () => console.log(`popup fixture ${port}`));
function send(response, status, body) { response.writeHead(status,{"content-type":"text/html; charset=utf-8"});response.end(body); }

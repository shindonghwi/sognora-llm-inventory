import { createServer } from "node:http";

const port = Number(process.argv[2]);
if (!port) throw new Error("port required");
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/robots.txt") return send(response, 200, "text/plain", `Sitemap: http://127.0.0.1:${port}/sitemap.xml`);
  if (url.pathname === "/sitemap.xml") return send(response, 200, "application/xml", `<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1:${port}/</loc></url><url><loc>http://127.0.0.1:${port}/about</loc></url></urlset>`);
  if (!["/", "/about", "/hidden"].includes(url.pathname)) return send(response, 404, "text/html", "<!doctype html><title>Not Found</title><main><h1>Not Found</h1></main>");
  const tab = url.searchParams.get("tab") === "two" ? "Second state" : "First state";
  const page = url.pathname === "/about" ? "About" : url.pathname === "/hidden" ? "Hidden" : "Home";
  const canonical = `${url.pathname}${url.search}`;
  send(response, 200, "text/html", `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="http://127.0.0.1:${port}${canonical}"><title>${page}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111;background:#fff}header{position:sticky;top:0;height:72px;background:#fff;border-bottom:1px solid #ddd;display:flex;align-items:center;padding:0 24px;z-index:2}nav{display:flex;gap:18px}a{color:#222;text-decoration:none;transition:color 120ms ease-out}a:hover{color:#075dd8}main{min-height:1800px;padding:64px 24px}section{max-width:720px;margin:auto}h1{font-size:48px;line-height:56px;margin:0 0 24px}button{padding:12px 18px;border:0;border-radius:8px;background:#111;color:#fff}.panel{height:120px;margin-top:20px;padding:24px;background:#e8f1ff;opacity:0;transform:translateY(-8px);transition:opacity 200ms ease-out,transform 200ms ease-out}.panel.open{opacity:1;transform:none}footer{height:180px;padding:40px 24px;background:#111;color:#fff}
</style></head><body><header><nav><a class="nav-home" href="/">Home</a><a class="nav-about" href="/about">About</a><a class="nav-tab" href="/?tab=two">Tab</a></nav></header>
<main><section><h1>${page}</h1><p>${tab}</p><button class="menu-button" type="button" aria-label="Menu" onclick="const p=document.querySelector('.panel');p.classList.toggle('open');if(!p.querySelector('.revealed'))p.insertAdjacentHTML('beforeend',' <a class=&quot;revealed&quot; href=&quot;/hidden&quot;>Hidden</a>')">Menu</button><div class="panel">Panel content</div></section></main><footer>Footer</footer></body></html>`);
});
server.listen(port, "127.0.0.1", () => console.log(`fixture ${port}`));
function send(response, status, type, body) { response.writeHead(status,{"content-type":`${type}; charset=utf-8`});response.end(body); }

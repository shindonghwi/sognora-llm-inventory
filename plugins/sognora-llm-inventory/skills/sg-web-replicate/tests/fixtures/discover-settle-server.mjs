import { createServer } from "node:http";

const requestedPort = Number(process.argv[2] ?? 0);
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
    return send(response, 404, "text/plain", "not found");
  }
  if (url.pathname === "/api/late-link") {
    return setTimeout(() => send(response, 200, "application/json", JSON.stringify({ href: "/late-api" })), 650);
  }
  if (url.pathname === "/late-api") {
    return send(response, 200, "text/html", "<!doctype html><title>Late API route</title><main>Loaded</main>");
  }
  if (url.pathname !== "/") {
    return send(response, 404, "text/html", "<!doctype html><title>Not Found</title><main>Not Found</main>");
  }
  send(response, 200, "text/html", `<!doctype html>
<html><head><meta charset="utf-8"><title>Resize reload fixture</title></head><body>
<main id="content">Loading</main><script>
window.addEventListener("resize", () => location.reload());
setTimeout(async () => {
  const data = await fetch("/api/late-link").then((response) => response.json());
  document.querySelector("#content").innerHTML = '<a href="' + data.href + '">Late API route</a>';
}, 150);
</script></body></html>`);
});

server.listen(requestedPort, "127.0.0.1", () => {
  console.log(`discover-settle-fixture ${server.address().port}`);
});

function send(response, status, type, body) {
  response.writeHead(status, { "content-type": `${type}; charset=utf-8` });
  response.end(body);
}

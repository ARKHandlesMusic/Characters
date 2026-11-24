// Reverse-proxy launcher for Remotion Studio inside Cloud Run / AI Studio iframes.
// Spawns Remotion Studio on internal port 3001 and serves port 3000 while normalizing
// Origin/Host headers so Remotion Studio's validateSameOrigin check succeeds behind HTTPS proxies.

import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";

const PUBLIC_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = PUBLIC_PORT + 1;
const INTERNAL_HOST = "127.0.0.1";
const INTERNAL_ORIGIN = `http://${INTERNAL_HOST}:${INTERNAL_PORT}`;

const remotionBin = path.resolve(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "remotion.cmd" : "remotion",
);

const studioChild = spawn(
  remotionBin,
  ["studio", "--port", String(INTERNAL_PORT), "--no-open"],
  {
    stdio: "inherit",
    env: { ...process.env },
  },
);

studioChild.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});

function shutdown() {
  if (!studioChild.killed) {
    studioChild.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let internalReady = false;

function pollInternalPort(port, host) {
  const attempt = () => {
    const sock = net.connect({ port, host });
    sock.once("connect", () => {
      sock.end();
      internalReady = true;
      console.log(`Remotion Studio ready on ${host}:${port}`);
    });
    sock.once("error", () => {
      sock.destroy();
      setTimeout(attempt, 250);
    });
  };
  attempt();
}

const LOADING_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="2" />
    <title>Starting Remotion Studio...</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d1021;
        color: #f6f4ef;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .card {
        text-align: center;
        padding: 24px 32px;
      }
      .title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .sub {
        font-size: 13px;
        opacity: 0.72;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">Starting Remotion Studio…</div>
      <div class="sub">Bundling project assets. This page refreshes automatically.</div>
    </div>
  </body>
</html>`;

function createProxyServer() {
  const server = http.createServer((req, res) => {
    if (!internalReady) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(LOADING_HTML);
      return;
    }

    const headers = { ...req.headers };
    headers.host = `${INTERNAL_HOST}:${INTERNAL_PORT}`;
    if (typeof headers.origin === "string") {
      headers.origin = INTERNAL_ORIGIN;
    }

    const proxyReq = http.request(
      {
        hostname: INTERNAL_HOST,
        port: INTERNAL_PORT,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      res.end(LOADING_HTML);
    });

    req.on("aborted", () => {
      proxyReq.destroy();
    });

    req.pipe(proxyReq);
  });

  // Forward WebSocket upgrades transparently to Remotion Studio with normalized Origin/Host
  server.on("upgrade", (req, socket, head) => {
    if (!internalReady) {
      socket.destroy();
      return;
    }
    const upstream = net.connect(INTERNAL_PORT, INTERNAL_HOST, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const key = req.rawHeaders[i];
        const val = req.rawHeaders[i + 1];
        const lower = key.toLowerCase();
        if (lower === "host") {
          lines.push(`Host: ${INTERNAL_HOST}:${INTERNAL_PORT}`);
        } else if (lower === "origin") {
          lines.push(`Origin: ${INTERNAL_ORIGIN}`);
        } else {
          lines.push(`${key}: ${val}`);
        }
      }
      lines.push("", "");
      upstream.write(lines.join("\r\n"));
      if (head && head.length > 0) {
        upstream.write(head);
      }
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  return server;
}

const server = createProxyServer();
server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(`Remotion Studio proxy listening on http://localhost:${PUBLIC_PORT}`);
});
pollInternalPort(INTERNAL_PORT, INTERNAL_HOST);

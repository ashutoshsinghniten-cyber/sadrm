import { createServer } from 'node:http';
import { createRuntimeGatewayMiddleware } from './runtime-gateway.mjs';
import { createAuthGatewayMiddleware } from './auth-gateway.mjs';
import { createDataGatewayMiddleware } from './data-gateway.mjs';

const PORT = Number(process.env.RUNTIME_PROXY_PORT || 8791);

const runtimeMiddleware = createRuntimeGatewayMiddleware({ env: process.env });
const authMiddleware = createAuthGatewayMiddleware();
const dataMiddleware = createDataGatewayMiddleware();

const server = createServer(async (req, res) => {
  const url = req.url || '';

  if (url.startsWith('/api/auth')) {
    const handled = await authMiddleware(req, res);
    if (!handled && !res.writableEnded) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found.' }));
    }
    return;
  }

  if (url.startsWith('/api/data')) {
    const handled = await dataMiddleware(req, res);
    if (!handled && !res.writableEnded) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found.' }));
    }
    return;
  }

  const handled = await runtimeMiddleware(req, res);
  if (!handled && !res.writableEnded) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

const HOST = process.env.RUNTIME_PROXY_HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`API gateway listening on http://${HOST}:${PORT}`);
});

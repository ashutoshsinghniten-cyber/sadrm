const MAX_BODY_BYTES = Number(process.env.RUNTIME_PROXY_MAX_BODY_BYTES || 100 * 1024 * 1024);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const readJsonBody = (req, maxBytes = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
  let size = 0;
  let raw = '';

  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) {
      reject(new Error('Request body too large.'));
      req.destroy();
      return;
    }
    raw += chunk;
  });
  req.on('end', () => {
    try {
      resolve(raw ? JSON.parse(raw) : {});
    } catch {
      reject(new Error('Invalid JSON request body.'));
    }
  });
  req.on('error', () => reject(new Error('Failed to read request body.')));
});

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const buildUpstreamConfig = (env = process.env) => ({
  endpoint: env.AI_RUNTIME_ENDPOINT || '',
  model: env.AI_RUNTIME_MODEL || '',
  apiKey: env.AI_RUNTIME_API_KEY || '',
  version: env.AI_RUNTIME_VERSION || '',
  authHeader: env.AI_RUNTIME_AUTH_HEADER || 'x-api-key',
  versionHeader: env.AI_RUNTIME_VERSION_HEADER || 'x-api-version',
});

export const isRuntimeConfigured = (env = process.env) => {
  const cfg = buildUpstreamConfig(env);
  return Boolean(cfg.endpoint && cfg.model && cfg.apiKey);
};

const callUpstream = async ({ env, system, messages, maxTokens }) => {
  const upstream = buildUpstreamConfig(env);
  const headers = { 'Content-Type': 'application/json' };
  headers[upstream.authHeader] = upstream.apiKey;
  if (upstream.version) headers[upstream.versionHeader] = upstream.version;

  const response = await fetch(upstream.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: upstream.model,
      max_tokens: Number(maxTokens) || 1500,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    console.error(`Runtime gateway upstream request failed with status ${response.status}.`);
    throw new Error(`Runtime gateway upstream error (${response.status}).`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((block) => block?.type === 'text' && typeof block?.text === 'string')
    : null;

  return {
    text: textBlock?.text || '',
    usage: {
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0,
    },
  };
};

export const createRuntimeGatewayMiddleware = ({ env = process.env, basePath = '/api/runtime' } = {}) => {
  return async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: 'Missing request URL.' });
      return true;
    }

    const method = req.method || 'GET';
    const url = new URL(req.url, `https://${req.headers.host || '127.0.0.1'}`);

    if (!url.pathname.startsWith(basePath)) return false;

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return true;
    }

    if (method === 'GET' && url.pathname === `${basePath}/health`) {
      sendJson(res, 200, {
        ok: true,
        configured: isRuntimeConfigured(env),
        
        endpoint: `${basePath}/extraction`,
      });
      return true;
    }

    if (method === 'POST' && url.pathname === `${basePath}/extraction`) {
      if (!isRuntimeConfigured(env)) {
        sendJson(res, 503, {
          error: 'Runtime gateway is not configured. Set the AI_RUNTIME_* variables and restart the server.',
        });
        return true;
      }

      try {
        const body = await readJsonBody(req);
        if (!body || !Array.isArray(body.messages)) {
          sendJson(res, 400, { error: 'Request must include a messages payload.' });
          return true;
        }

        const result = await callUpstream({
          env,
          system: body.system,
          messages: body.messages,
          maxTokens: body.maxTokens,
        });

        if (!result.text) {
          sendJson(res, 502, { error: 'Runtime gateway returned no text output.' });
          return true;
        }

        sendJson(res, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Runtime gateway request failed.';
        const statusCode = message === 'Request body too large.'
          ? 413
          : message === 'Invalid JSON request body.' || message === 'Failed to read request body.'
            ? 400
            : 502;
        console.error(`Runtime gateway error: ${message}`);
        sendJson(res, statusCode, { error: message });
      }
      return true;
    }

    sendJson(res, 404, { error: 'Not found.' });
    return true;
  };
};

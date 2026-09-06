import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  defineConfig,
  loadEnv,
  type Connect,
  type HttpServer,
  type Plugin,
} from 'vite';
import react from '@vitejs/plugin-react';
import {
  WebSocket as UpstreamSocket,
  WebSocketServer,
  type RawData,
} from 'ws';

type RoomMapRequest = {
  roomTitle?: string;
  topic?: string;
  reference?: string;
  criteria?: string[];
  recentConversation?: Array<{
    sequence?: number;
    text?: string;
    speakerLabel?: string;
  }>;
  transcript?: string;
  agreements?: string[];
  differences?: string[];
};

type RoomMap = {
  agreements: string[];
  differences: string[];
};

type ReasoningProvider = 'smallest' | 'openai';

type GatewayConfig = {
  smallestApiKey?: string;
  openAiApiKey?: string;
  reasoningProvider: ReasoningProvider;
};

const roomMapInstructions = `You maintain a neutral live map of a group decision conversation.
Use recentConversation as chronological context and transcript as the newest utterance. The newest explicit correction, retraction, acceptance, or rejection takes priority over older statements.
Agreements must be shared ground that participants explicitly accept or clearly treat as settled. A room topic, objective, criterion, constraint, piece of evidence, or one person's unacknowledged proposal is context, not agreement.
Differences must be active, decision-relevant disagreements, competing positions, or unresolved choices. Missing implementation detail is not a difference unless participants say it blocks the decision.
When participants explicitly resolve a difference, remove it. When the newest utterance is unrelated small talk, preserve the relevant prior map.
Merge duplicates, use plain language, never invent consensus, and keep at most four concise points on each side.`;

const roomMapSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agreements: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' },
    },
    differences: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' },
    },
  },
  required: ['agreements', 'differences'],
} as const;

function parseRoomMap(value: unknown): RoomMap {
  if (!value || typeof value !== 'object') {
    throw new Error('The reasoning provider returned an invalid room map');
  }
  const candidate = value as { agreements?: unknown; differences?: unknown };
  const readList = (items: unknown): string[] => {
    if (!Array.isArray(items)) return [];
    return items
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  };
  return {
    agreements: readList(candidate.agreements),
    differences: readList(candidate.differences),
  };
}

function outputText(body: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string | undefined {
  return body.output_text ?? body.output
    ?.flatMap(item => item.content ?? [])
    .find(content => content.type === 'output_text')
    ?.text;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function upstreamSignal(request: IncomingMessage, response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  request.once('aborted', () => controller.abort());
  response.once('close', () => {
    if (!response.writableEnded) controller.abort();
  });
  return controller.signal;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function smallestGateway(config: GatewayConfig): Plugin {
  const { smallestApiKey, openAiApiKey, reasoningProvider } = config;
  const installHttp = (middlewares: Connect.Server) => {
    middlewares.use('/api/smallest/status', (request, response) => {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      sendJson(response, 200, { configured: Boolean(smallestApiKey) });
    });

    middlewares.use('/api/reasoning/status', (request, response) => {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      sendJson(response, 200, {
        provider: reasoningProvider,
        model: reasoningProvider === 'openai' ? 'gpt-5.6-luna' : 'electron',
        effort: reasoningProvider === 'openai' ? 'medium' : undefined,
        configured: reasoningProvider === 'openai'
          ? Boolean(openAiApiKey)
          : Boolean(smallestApiKey),
      });
    });

    middlewares.use('/api/reasoning/organize', async (request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      if (reasoningProvider === 'smallest' && !smallestApiKey) {
        sendJson(response, 503, { error: 'Smallest.ai is not configured' });
        return;
      }
      if (reasoningProvider === 'openai' && !openAiApiKey) {
        sendJson(response, 503, { error: 'OpenAI reasoning is not configured' });
        return;
      }
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: 'Cross-origin reasoning requests are not allowed' });
        return;
      }

      try {
        const signal = upstreamSignal(request, response);
        const input = (await readJson(request)) as RoomMapRequest;
        if (!input.transcript?.trim()) {
          sendJson(response, 400, { error: 'A transcript is required' });
          return;
        }

        if (reasoningProvider === 'openai') {
          const providerResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            signal,
            headers: {
              Authorization: `Bearer ${openAiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-5.6-luna',
              reasoning: { effort: 'medium' },
              instructions: roomMapInstructions,
              input: JSON.stringify(input),
              text: {
                format: {
                  type: 'json_schema',
                  name: 'room_map',
                  strict: true,
                  schema: roomMapSchema,
                },
              },
              store: false,
            }),
          });
          const providerBody = (await providerResponse.json()) as {
            error?: { message?: string };
            output_text?: string;
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
          };
          if (!providerResponse.ok) {
            sendJson(response, providerResponse.status, {
              error: providerBody.error?.message ?? 'OpenAI reasoning failed',
            });
            return;
          }
          const rawMap = outputText(providerBody);
          if (!rawMap) throw new Error('GPT-5.6 Luna returned no room map');
          sendJson(response, 200, parseRoomMap(JSON.parse(rawMap) as unknown));
          return;
        }

        const providerResponse = await fetch(
          'https://api.smallest.ai/waves/v1/chat/completions',
          {
            method: 'POST',
            signal,
            headers: {
              Authorization: `Bearer ${smallestApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'electron',
              temperature: 0.2,
              messages: [
                {
                  role: 'system',
                  content: `${roomMapInstructions} Always call update_room_map exactly once.`,
                },
                {
                  role: 'user',
                  content: JSON.stringify(input),
                },
              ],
              tools: [{
                type: 'function',
                function: {
                  name: 'update_room_map',
                  description: 'Replace the visible agreement and difference lists.',
                  parameters: roomMapSchema,
                },
              }],
              tool_choice: {
                type: 'function',
                function: { name: 'update_room_map' },
              },
            }),
          }
        );
        const providerBody = (await providerResponse.json()) as {
          error?: { message?: string };
          choices?: Array<{
            message?: {
              tool_calls?: Array<{ function?: { arguments?: string } }>;
            };
          }>;
        };
        if (!providerResponse.ok) {
          sendJson(response, providerResponse.status, {
            error: providerBody.error?.message ?? 'Smallest.ai reasoning failed',
          });
          return;
        }
        const rawArguments =
          providerBody.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!rawArguments) throw new Error('Electron returned no room-map tool call');
        sendJson(response, 200, parseRoomMap(JSON.parse(rawArguments) as unknown));
      } catch (error) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : 'Room map update failed',
        });
      }
    });

  };

  const installWebSocketProxy = (
    server: HttpServer | null,
    localPath: string,
    upstreamUrl: string,
    announceReady: boolean,
  ) => {
    if (!server) return;
    const localServer = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const path = new URL(request.url ?? '/', 'http://decision-room.local').pathname;
      if (path !== localPath) return;
      if (!isSameOrigin(request)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      localServer.handleUpgrade(request, socket, head, browserSocket => {
        if (!smallestApiKey) {
          browserSocket.send(JSON.stringify({ type: 'error', message: 'Smallest.ai is not configured' }));
          browserSocket.close(1011, 'Provider not configured');
          return;
        }

        const upstream = new UpstreamSocket(
          upstreamUrl,
          { headers: { Authorization: `Bearer ${smallestApiKey}` } }
        );
        const pending: Array<{ data: RawData; binary: boolean }> = [];

        browserSocket.on('message', (data, binary) => {
          if (upstream.readyState === UpstreamSocket.OPEN) {
            upstream.send(data, { binary });
          } else {
            pending.push({ data, binary });
          }
        });
        upstream.on('open', () => {
          if (announceReady && browserSocket.readyState === browserSocket.OPEN) {
            browserSocket.send(JSON.stringify({ type: 'proxy_ready' }));
          }
          for (const message of pending.splice(0)) {
            upstream.send(message.data, { binary: message.binary });
          }
        });
        upstream.on('message', (data, binary) => {
          if (browserSocket.readyState === browserSocket.OPEN) {
            browserSocket.send(data, { binary });
          }
        });
        upstream.on('error', error => {
          if (browserSocket.readyState === browserSocket.OPEN) {
            browserSocket.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        });
        upstream.on('close', (code, reason) => {
          if (browserSocket.readyState === browserSocket.OPEN) {
            const browserCloseCode =
              code === 1000 || (code >= 3000 && code <= 4999) ? code : 1011;
            browserSocket.close(browserCloseCode, reason.toString().slice(0, 123));
          }
        });
        browserSocket.on('close', () => upstream.close());
        browserSocket.on('error', () => upstream.close());
      });
    });
    server.once('close', () => localServer.close());
  };

  const installVoiceProxies = (server: HttpServer | null) => {
    installWebSocketProxy(
      server,
      '/api/smallest/pulse',
      'wss://api.smallest.ai/waves/v1/stt/live?model=pulse&language=en&encoding=linear16&sample_rate=16000&vad_events=true',
      true,
    );
    installWebSocketProxy(
      server,
      '/api/smallest/hydra',
      'wss://api.smallest.ai/waves/v1/s2s?model=hydra-v1.1',
      false,
    );
  };

  return {
    name: 'decision-room-smallest-gateway',
    configureServer(server) {
      installHttp(server.middlewares);
      installVoiceProxies(server.httpServer);
    },
    configurePreviewServer(server) {
      installHttp(server.middlewares);
      installVoiceProxies(server.httpServer);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    preview: {
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.onrender.com'],
    },
    plugins: [
      react(),
      smallestGateway({
        smallestApiKey: env.SMALLEST_API_KEY,
        openAiApiKey: env.OPENAI_API_KEY,
        reasoningProvider: env.REASONING_PROVIDER?.toLowerCase() === 'openai'
          ? 'openai'
          : 'smallest',
      }),
    ],
  };
});

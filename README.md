# Ansel MVP

Ansel gives any small group a shared place to talk through a decision. Create as many rooms as you need, optionally add an OKR, reference, or decision criteria, invite people with a link or QR code, and let Ansel keep a live map of what the room agrees on and what is still different.

The landing page includes a simulated room so the core experience is understandable before anyone creates a room.

## Run locally

Prerequisites: Node.js 18+, the SpacetimeDB CLI, and its TypeScript module toolchain.

```bash
npm install
spacetime start
npm run spacetime:publish:local
npm run generate
npm run dev
```

Open the URL printed by Vite. From the landing page:

1. Enter your name and a room name. The topic, reference/OKR, and criteria are optional.
2. Create the room and open **Invite** to copy its link or show its QR code.
3. Join from another browser or private window. The member list updates in realtime.
4. On the host screen, choose **Start Ansel** and have a conversation. Final transcript turns continually refresh the **Aligned** and **Still different** lists.

## Smallest.ai voice

The first working provider profile uses Smallest.ai Hydra v1.1 for the live, full-duplex voice conversation. Hydra handles turn detection, streamed responses, and barge-in. In parallel, Pulse provides the authoritative transcript and Electron quietly refreshes the **Aligned** and **Still different** map. Each part sits behind a provider-neutral interface.

Add your key to `.env.local` and restart Vite:

```dotenv
SMALLEST_API_KEY=your_key_here
```

To use OpenAI reasoning while keeping Smallest.ai Pulse and Hydra for
transcription and speech, add these two lines and restart Vite:

```dotenv
REASONING_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
```

This selects `gpt-5.6-luna` with medium reasoning effort for room-map updates.
If `REASONING_PROVIDER` is absent, Electron remains the fallback.

The API keys have no `VITE_` prefix and are only read by the local server gateway; they are never sent to browser code. Room audio is streamed to the active voice and transcription sessions and is not stored by this app. Any joined participant can start the room microphone.

The gateway is registered by Vite for local development and preview. A production deployment must run the same long-lived HTTP/WebSocket server; a static-only Vite host is not sufficient.

## Public judging demo

The public build points at the `ansel-judge-20260905` database on SpacetimeDB
Maincloud. To serve it from a machine that already has `SMALLEST_API_KEY` in its
server environment or `.env.local`:

```bash
npm run build:public
npm start
cloudflared tunnel --url http://127.0.0.1:4173 --no-autoupdate
```

The generated `trycloudflare.com` URL supports the HTTP and WebSocket gateway.
It remains available only while both local processes and the host machine stay
running. Use a persistent container host for a long-lived deployment.

For a free deployment that does not depend on the local machine, connect this
repository to Render and create a Blueprint from `render.yaml`. Choose the Free
service plan and enter `SMALLEST_API_KEY` and `OPENAI_API_KEY` when Render
prompts for the secrets. Render then runs the same HTTP and WebSocket gateway at
its `onrender.com` URL. Hosting can remain free, while provider API usage is
billed separately by Smallest.ai and OpenAI.

## Useful commands

```bash
npm run build
npm run build:public
npm start
npm run spacetime:generate
npm run spacetime:publish:local
spacetime logs decision-room-mvp --server local -n 100
```

`build:public` targets the deployed `ansel-judge-20260905` database on
SpacetimeDB Maincloud. `npm start` runs the production preview server, including
the Smallest.ai HTTP and WebSocket gateway. Set `SMALLEST_API_KEY` only in the
server environment; never give it a `VITE_` prefix.

Server state and authorization live in [`spacetimedb/src/index.ts`](./spacetimedb/src/index.ts). The room UI lives in [`src/App.tsx`](./src/App.tsx). Provider-neutral voice contracts and the Smallest.ai adapter live in [`src/ai`](./src/ai).

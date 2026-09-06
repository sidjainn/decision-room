import type {
  AgentEvent,
  AgentStateEvent,
  AudioFrame,
  HarnessErrorEvent,
  MeetingAudioAdapter,
  ReasoningAdapter,
  ReasoningInput,
  RealtimeVoiceAdapter,
  RealtimeVoiceEvent,
  SpeechInputAdapter,
  TranscriptEvent,
} from './contracts';

type PulseEvent = {
  type?: string;
  transcript?: string;
  is_final?: boolean;
  is_last?: boolean;
  message?: string;
};

type HydraEvent = {
  type?: string;
  delta?: string;
  message?: string;
  error?: { message?: string } | string;
  response?: { id?: string; status?: string };
  session?: {
    output_audio_format?: string;
    output_audio_sample_rate?: number;
    voice?: string;
  };
};

type RoomMapResponse = {
  agreements?: unknown;
  differences?: unknown;
  error?: string;
};

export interface SmallestRoomContext {
  readonly roomTitle: string;
  readonly topic: string;
  readonly reference?: string;
  readonly criteria?: ReadonlyArray<string>;
}

/**
 * One provider profile assembled from replaceable, provider-neutral adapters.
 * Pulse owns the authoritative transcript, a selectable silent reasoner owns
 * the room map, and Hydra owns conversational timing, barge-in, and speech.
 */
export class SmallestRealtimeProfile {
  readonly meetingAudio: MeetingAudioAdapter;
  readonly speechInput: SpeechInputAdapter;
  readonly reasoning: ReasoningAdapter;
  readonly realtimeVoice: RealtimeVoiceAdapter;

  constructor(context: SmallestRoomContext) {
    this.meetingAudio = new BrowserMeetingAudioAdapter();
    this.speechInput = new SmallestPulseAdapter();
    this.reasoning = new RoomMapReasoningAdapter();
    this.realtimeVoice = new SmallestHydraAdapter(context);
  }
}

class BrowserMeetingAudioAdapter implements MeetingAudioAdapter {
  private microphone?: MediaStream;
  private captureContext?: AudioContext;
  private captureSource?: MediaStreamAudioSourceNode;
  private captureProcessor?: ScriptProcessorNode;
  private mutedOutput?: GainNode;
  private audioHandler: (frame: AudioFrame) => void = () => undefined;

  async connect(_roomId: string): Promise<void> {
    if (this.microphone) return;
    const statusResponse = await fetch('/api/smallest/status');
    const status = (await statusResponse.json()) as { configured?: boolean };
    if (!statusResponse.ok || !status.configured) {
      throw new Error('Add SMALLEST_API_KEY to enable the live room voice.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot access a room microphone.');
    }

    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = new AudioContext({ sampleRate: 16_000 });
    const source = context.createMediaStreamSource(microphone);
    // At 16 kHz this produces 32 ms frames, within Hydra's 20-40 ms range.
    const processor = context.createScriptProcessor(512, 1, 1);
    const mutedOutput = context.createGain();
    mutedOutput.gain.value = 0;
    processor.onaudioprocess = event => {
      const data = floatToPcm16(event.inputBuffer.getChannelData(0), context.sampleRate, 16_000);
      this.audioHandler({ data, encoding: 'pcm16', sampleRateHz: 16_000, channels: 1 });
    };
    source.connect(processor);
    processor.connect(mutedOutput);
    mutedOutput.connect(context.destination);

    this.microphone = microphone;
    this.captureContext = context;
    this.captureSource = source;
    this.captureProcessor = processor;
    this.mutedOutput = mutedOutput;
  }

  async disconnect(): Promise<void> {
    this.audioHandler = () => undefined;
    this.captureProcessor?.disconnect();
    this.captureSource?.disconnect();
    this.mutedOutput?.disconnect();
    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    await this.captureContext?.close();
    this.microphone = undefined;
    this.captureContext = undefined;
    this.captureSource = undefined;
    this.captureProcessor = undefined;
    this.mutedOutput = undefined;
  }

  onAudioInput(handler: (frame: AudioFrame) => void): void {
    this.audioHandler = handler;
  }

  // Complete-file playback remains available for non-realtime provider profiles.
  playAgentAudio(_chunk: ArrayBuffer): void {}

  stopAgentAudio(): void {}
}

class SmallestPulseAdapter implements SpeechInputAdapter {
  private socket?: WebSocket;

  async start(onEvent: (event: TranscriptEvent) => void): Promise<void> {
    const socket = new WebSocket(providerSocketUrl('/api/smallest/pulse'));
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let providerEvent: PulseEvent;
      try {
        providerEvent = JSON.parse(event.data) as PulseEvent;
      } catch {
        return;
      }
      if (providerEvent.type === 'proxy_ready') {
        resolveReady?.();
        resolveReady = undefined;
        rejectReady = undefined;
        return;
      }
      const metadata = providerMetadata();
      if (providerEvent.type === 'speech_started') {
        onEvent({ ...metadata, type: 'speech_activity', activity: 'started' });
      } else if (providerEvent.type === 'speech_ended') {
        onEvent({ ...metadata, type: 'speech_activity', activity: 'stopped' });
      } else if (providerEvent.type === 'error') {
        rejectReady?.(new Error(providerEvent.message || 'Smallest.ai transcription failed.'));
        resolveReady = undefined;
        rejectReady = undefined;
        socket.close(1011, 'Provider error');
      } else if (providerEvent.type === 'transcription' && providerEvent.transcript?.trim()) {
        onEvent({
          ...metadata,
          type: 'transcript',
          phase: providerEvent.is_final ? 'final' : 'partial',
          text: providerEvent.transcript,
          speakerLabel: 'Room',
        });
      }
    });
    socket.addEventListener('error', () => {
      rejectReady?.(new Error('Smallest.ai transcription could not connect.'));
      resolveReady = undefined;
      rejectReady = undefined;
    });
    socket.addEventListener('close', () => {
      rejectReady?.(new Error('Smallest.ai transcription closed before it was ready.'));
      resolveReady = undefined;
      rejectReady = undefined;
    });

    await ready;
  }

  pushAudio(frame: AudioFrame): void {
    if (frame.encoding !== 'pcm16' || frame.sampleRateHz !== 16_000 || frame.channels !== 1) {
      throw new Error('Pulse requires mono 16 kHz PCM16 microphone audio.');
    }
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame.data);
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    if (socket?.readyState === WebSocket.OPEN) {
      await finalizePulse(socket);
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Room audio stopped');
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }
}

class RoomMapReasoningAdapter implements ReasoningAdapter {
  private abort?: AbortController;
  private agreements?: string[];
  private differences?: string[];

  async *run(input: ReasoningInput): AsyncIterable<AgentEvent> {
    const abort = new AbortController();
    this.abort = abort;
    const response = await fetch('/api/reasoning/organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        roomTitle: input.room.contract.decisionQuestion,
        topic: input.room.contract.decisionQuestion,
        reference: input.room.contract.objective,
        criteria: input.room.contract.criteria.map(criterion => criterion.label),
        transcript: input.prompt,
        agreements: this.agreements ?? input.room.items
          .filter(item => item.kind === 'agreement')
          .map(item => item.title),
        differences: this.differences ?? input.room.items
          .filter(item => item.kind === 'difference')
          .map(item => item.title),
      }),
    });
    const body = (await response.json()) as RoomMapResponse;
    if (!response.ok) throw new Error(body.error || 'The reasoner could not update the room map.');

    this.agreements = stringArray(body.agreements);
    this.differences = stringArray(body.differences);
    yield {
      type: 'tool_call',
      name: 'sync_discussion_points',
      callId: crypto.randomUUID(),
      arguments: {
        agreements: this.agreements,
        differences: this.differences,
      },
      ...providerMetadata(),
    };
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = undefined;
  }
}

class SmallestHydraAdapter implements RealtimeVoiceAdapter {
  private socket?: WebSocket;
  private handler: (event: RealtimeVoiceEvent) => void = () => undefined;
  private playbackContext?: AudioContext;
  private playbackCursor = 0;
  private playbackGeneration = 0;
  private playbackSources = new Set<AudioBufferSourceNode>();
  private pendingPlaybackChunks = 0;
  private responseComplete = false;
  private pendingInput = new Uint8Array(0);
  private outputSampleRateHz = 24_000;

  constructor(private readonly room: SmallestRoomContext) {}

  async start(onEvent: (event: RealtimeVoiceEvent) => void): Promise<void> {
    this.handler = onEvent;
    const socket = new WebSocket(providerSocketUrl('/api/smallest/hydra'));
    this.socket = socket;

    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let providerEvent: HydraEvent;
      try {
        providerEvent = JSON.parse(event.data) as HydraEvent;
      } catch {
        return;
      }

      switch (providerEvent.type) {
        case 'session.created':
          socket.send(JSON.stringify({
            type: 'session.configure',
            session: {
              instructions: hydraInstructions(this.room),
              voice: 'aria',
              tools: [],
              generate_initial_response: true,
            },
          }));
          break;
        case 'session.configured':
          if (providerEvent.session?.output_audio_format !== 'pcm16') {
            rejectReady?.(new Error('Hydra negotiated an unsupported audio format.'));
            socket.close(1003, 'Unsupported audio format');
            break;
          }
          if (
            typeof providerEvent.session.output_audio_sample_rate === 'number' &&
            Number.isFinite(providerEvent.session.output_audio_sample_rate) &&
            providerEvent.session.output_audio_sample_rate > 0
          ) {
            this.outputSampleRateHz = providerEvent.session.output_audio_sample_rate;
          }
          resolveReady?.();
          resolveReady = undefined;
          rejectReady = undefined;
          this.emitState('listening', 'Hydra is listening');
          break;
        case 'input_audio_buffer.speech_started':
          this.stopPlayback();
          this.emitState('listening', 'Ansel is listening');
          break;
        case 'input_audio_buffer.speech_stopped':
          this.emitState('organising', 'Preparing a response');
          break;
        case 'response.created':
          this.stopPlayback();
          this.responseComplete = false;
          break;
        case 'response.output_audio.delta':
          if (providerEvent.delta) {
            this.responseComplete = false;
            this.emitState('speaking', 'Hydra is speaking');
            const generation = this.playbackGeneration;
            this.pendingPlaybackChunks += 1;
            void this.queueAudio(providerEvent.delta)
              .catch(error => this.emitError(error))
              .finally(() => {
                if (generation !== this.playbackGeneration) return;
                this.pendingPlaybackChunks -= 1;
                this.finishResponseIfDrained();
              });
          }
          break;
        case 'response.output_audio.done':
          this.responseComplete = true;
          this.finishResponseIfDrained();
          break;
        case 'response.done':
          if (providerEvent.response?.status === 'cancelled') {
            this.stopPlayback();
            this.emitState('listening', 'Ansel is listening');
            break;
          }
          this.responseComplete = true;
          this.finishResponseIfDrained();
          break;
        case 'error': {
          const message = hydraErrorMessage(providerEvent);
          rejectReady?.(new Error(message));
          resolveReady = undefined;
          rejectReady = undefined;
          this.emitError(new Error(message));
          break;
        }
      }
    });
    socket.addEventListener('error', () => {
      const error = new Error('Smallest.ai Hydra could not connect.');
      rejectReady?.(error);
      resolveReady = undefined;
      rejectReady = undefined;
      this.emitError(error);
    });
    socket.addEventListener('close', event => {
      if (event.code === 1000 || !this.socket) return;
      const error = new Error('Smallest.ai Hydra closed unexpectedly.');
      rejectReady?.(error);
      resolveReady = undefined;
      rejectReady = undefined;
      this.emitError(error);
    });

    await ready;
  }

  pushAudio(frame: AudioFrame): void {
    if (frame.encoding !== 'pcm16' || frame.sampleRateHz !== 16_000 || frame.channels !== 1) {
      throw new Error('Hydra requires mono 16 kHz PCM16 microphone audio.');
    }
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pendingInput = appendBytes(this.pendingInput, new Uint8Array(frame.data));
    // 512 PCM16 samples = 32 ms at 16 kHz.
    const frameBytes = 1_024;
    while (this.pendingInput.byteLength >= frameBytes) {
      const next = this.pendingInput.slice(0, frameBytes);
      this.pendingInput = this.pendingInput.slice(frameBytes);
      this.socket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: bytesToBase64(next),
      }));
    }
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    this.pendingInput = new Uint8Array(0);
    this.stopPlayback();
    if (socket?.readyState === WebSocket.OPEN) socket.close(1000, 'Room audio stopped');
    else if (socket?.readyState === WebSocket.CONNECTING) socket.close();
    await this.playbackContext?.close();
    this.playbackContext = undefined;
    this.handler = () => undefined;
  }

  private async queueAudio(base64Audio: string): Promise<void> {
    const generation = this.playbackGeneration;
    const bytes = base64ToBytes(base64Audio);
    const usableLength = bytes.byteLength - (bytes.byteLength % 2);
    if (usableLength === 0) return;
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, usableLength / 2);
    const context = this.playbackContext ?? new AudioContext({ sampleRate: this.outputSampleRateHz });
    this.playbackContext = context;
    if (context.state === 'suspended') await context.resume();
    if (generation !== this.playbackGeneration) return;

    const buffer = context.createBuffer(1, samples.length, this.outputSampleRateHz);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = (samples[index] ?? 0) / 32_768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.012, this.playbackCursor);
    this.playbackCursor = startAt + buffer.duration;
    this.playbackSources.add(source);
    source.onended = () => {
      this.playbackSources.delete(source);
      this.finishResponseIfDrained();
    };
    if (generation !== this.playbackGeneration) return;
    source.start(startAt);
  }

  private stopPlayback(): void {
    this.playbackGeneration += 1;
    for (const source of this.playbackSources) {
      try {
        source.stop();
      } catch {
        // A source may already have reached its natural end.
      }
    }
    this.playbackSources.clear();
    this.pendingPlaybackChunks = 0;
    this.playbackCursor = this.playbackContext?.currentTime ?? 0;
    this.responseComplete = false;
  }

  private finishResponseIfDrained(): void {
    if (
      !this.responseComplete ||
      this.pendingPlaybackChunks > 0 ||
      this.playbackSources.size > 0
    ) return;
    this.responseComplete = false;
    this.emitState('listening', 'Ansel is listening');
  }

  private emitState(state: AgentStateEvent['state'], detail: string): void {
    this.handler({ ...providerMetadata(), type: 'agent_state', state, detail });
  }

  private emitError(error: unknown): void {
    const event: HarnessErrorEvent = {
      ...providerMetadata(),
      type: 'harness_error',
      source: 'voice',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    };
    this.handler(event);
  }
}

function hydraInstructions(room: SmallestRoomContext): string {
  const context = [
    `Room: ${room.roomTitle}`,
    `Topic: ${room.topic}`,
    room.reference?.trim() ? `Optional reference or OKR: ${room.reference.trim()}` : '',
    room.criteria?.length ? `Optional criteria: ${room.criteria.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  return `Your name is Ansel. You are the live voice facilitator inside a small group decision room.
At the very start of the session, before anyone speaks, welcome the group to "${room.roomTitle}" and introduce yourself as Ansel. Say that you are here to help with the decision as their thought partner. Keep this opening warm and concise, then listen.
Respond promptly and naturally when someone asks you a direct question or clearly addresses the facilitator. If asked whether you can hear the room, confirm plainly.
Use English unless a participant clearly addresses you in another language.
When people are talking to each other, listen instead of replying to every turn. Intervene only to clarify a real disagreement, surface common ground, or ask one useful question when the group stalls.
Keep spoken turns concise, usually one or two sentences. Never invent consensus, never make the decision for the group, and do not narrate the live board. Stop immediately when a person begins speaking.
${context}`;
}

function hydraErrorMessage(event: HydraEvent): string {
  if (typeof event.error === 'string') return event.error;
  return event.error?.message || event.message || 'Smallest.ai Hydra voice failed.';
}

function providerSocketUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

function providerMetadata() {
  return { eventId: crypto.randomUUID(), occurredAtMs: Date.now() };
}

async function finalizePulse(socket: WebSocket): Promise<void> {
  await new Promise<void>(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', finish);
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        if ((JSON.parse(event.data) as PulseEvent).is_last) finish();
      } catch {
        // Ignore non-JSON provider frames while finalizing.
      }
    };
    const timeout = window.setTimeout(finish, 5_000);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', finish);
    socket.send(JSON.stringify({ type: 'close_stream' }));
  });
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.byteLength === 0) return right.slice();
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left);
  combined.set(right, left.byteLength);
  return combined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function floatToPcm16(input: Float32Array, inputRate: number, outputRate: number): ArrayBuffer {
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(index * ratio));
    const sample = Math.max(-1, Math.min(1, input[sourceIndex] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

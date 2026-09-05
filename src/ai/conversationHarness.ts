import type {
  AgentEvent,
  AgentMessageEvent,
  AgentState,
  AgentStateEvent,
  ConversationEvent,
  HarnessErrorEvent,
  InterruptionReason,
  MeetingAudioAdapter,
  NormalizedEventMetadata,
  RealtimeVoiceAdapter,
  ReasoningAdapter,
  ReasoningInput,
  ReasoningInputFactory,
  SpeechInputAdapter,
  ToolCallEvent,
  ToolCallExecutor,
  TranscriptEvent,
  TranscriptTextEvent,
  VoiceOutputAdapter,
} from "./contracts";

export interface ConversationHarnessDependencies {
  readonly meetingAudio: MeetingAudioAdapter;
  readonly speechInput: SpeechInputAdapter;
  readonly reasoning: ReasoningAdapter;
  readonly realtimeVoice?: RealtimeVoiceAdapter;
  readonly voiceOutput?: VoiceOutputAdapter;
  readonly executeToolCall?: ToolCallExecutor;
  readonly createReasoningInput?: ReasoningInputFactory;
  readonly now?: () => number;
  readonly createEventId?: () => string;
}

export type ConversationEventHandler = (event: ConversationEvent) => void;

type HarnessPhase = "idle" | "starting" | "running" | "stopping";

/**
 * Orchestrates audio transport, transcription, reasoning, tools, and voice.
 *
 * The generation token is deliberately independent from provider cancellation:
 * output from a slow provider is discarded after an interruption even when its
 * iterator does not settle immediately.
 */
export class ConversationHarness {
  private readonly listeners = new Set<ConversationEventHandler>();
  private readonly now: () => number;
  private readonly createEventId: () => string;
  private phase: HarnessPhase = "idle";
  private roomId?: string;
  private generation = 0;
  private activeReasoning = false;
  private activeVoice = false;
  private eventCounter = 0;
  private reasoningQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: ConversationHarnessDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.createEventId =
      dependencies.createEventId ?? (() => `harness-${++this.eventCounter}`);

    dependencies.meetingAudio.onAudioInput((frame) => {
      if (this.phase !== "running") return;

      try {
        dependencies.speechInput.pushAudio(frame);
      } catch (error) {
        this.emitError("speech_input", error, true);
      }
      try {
        dependencies.realtimeVoice?.pushAudio(frame);
      } catch (error) {
        this.emitError("voice", error, true);
      }
    });
  }

  get isRunning(): boolean {
    return this.phase === "running";
  }

  onEvent(handler: ConversationEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async start(roomId: string): Promise<void> {
    if (this.phase !== "idle") {
      throw new Error(`Conversation harness cannot start while ${this.phase}.`);
    }

    this.phase = "starting";
    this.roomId = roomId;
    this.emitState("ready");

    try {
      await this.dependencies.meetingAudio.connect(roomId);
      await Promise.all([
        this.dependencies.speechInput.start((event) => {
          void this.handleTranscriptEvent(event);
        }),
        this.dependencies.realtimeVoice?.start((event) => this.emit(event)),
      ]);
      this.phase = "running";
      this.emitState("listening");
    } catch (error) {
      this.phase = "idle";
      this.roomId = undefined;
      this.emitError("audio", error, true);
      this.emitState("offline");
      await this.bestEffortStartupCleanup();
      throw error;
    }
  }

  /** Runs an explicit Ask AI, Resolve this, or opportunistic request. */
  async request(input: ReasoningInput): Promise<void> {
    if (this.phase !== "running") {
      throw new Error("Conversation harness must be running before reasoning.");
    }
    if (input.room.roomId !== this.roomId) {
      throw new Error("Reasoning input belongs to a different room.");
    }

    const queuedRun = this.reasoningQueue.then(() => this.runReasoning(input));
    this.reasoningQueue = queuedRun.catch(() => undefined);
    await queuedRun;
  }

  private async runReasoning(input: ReasoningInput): Promise<void> {
    if (this.phase !== "running") return;
    const runGeneration = this.generation;
    this.activeReasoning = true;
    if (!this.dependencies.realtimeVoice) this.emitState("organising");

    try {
      for await (const event of this.dependencies.reasoning.run(input)) {
        if (!this.isCurrent(runGeneration)) return;

        this.emit(event);
        if (event.type === "tool_call") {
          await this.executeTool(event, runGeneration);
        } else if (
          event.type === "agent_message" &&
          event.phase === "final" &&
          event.delivery === "spoken"
        ) {
          await this.speak(event, runGeneration);
        }
      }

      if (this.isCurrent(runGeneration) && !this.dependencies.realtimeVoice) {
        this.emitState("listening");
      }
    } catch (error) {
      if (!this.isCurrent(runGeneration)) return;
      this.emitError("reasoning", error, true);
      this.emitState("needs_attention");
      throw error;
    } finally {
      if (this.generation === runGeneration) this.activeReasoning = false;
    }
  }

  /** Stops active reasoning and playback without disconnecting the room audio. */
  interrupt(reason: Exclude<InterruptionReason, "shutdown"> = "manual"): void {
    this.cancelActive(reason);
    if (this.phase === "running") this.emitState("listening");
  }

  async stop(): Promise<void> {
    if (this.phase === "idle") return;
    if (this.phase === "stopping") return;

    this.phase = "stopping";
    this.cancelActive("shutdown");

    const results = await Promise.allSettled([
      this.dependencies.speechInput.stop(),
      this.dependencies.realtimeVoice?.stop(),
      this.dependencies.meetingAudio.disconnect(),
    ]);

    this.phase = "idle";
    this.roomId = undefined;
    this.emitState("offline");

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) {
      this.emitError("audio", failure.reason, true);
      throw failure.reason;
    }
  }

  private async handleTranscriptEvent(event: TranscriptEvent): Promise<void> {
    if (this.phase !== "running" && this.phase !== "stopping") return;

    this.emit(event);

    // Preserve Pulse's final utterance during shutdown, but do not start a new
    // reasoning turn after the user has stopped the room microphone.
    if (this.phase === "stopping") return;

    if (
      event.type !== "transcript" ||
      event.phase !== "final" ||
      !this.dependencies.createReasoningInput ||
      !this.roomId
    ) {
      return;
    }

    let input: ReasoningInput;
    try {
      input = await this.dependencies.createReasoningInput({
        roomId: this.roomId,
        transcript: event as TranscriptTextEvent & { readonly phase: "final" },
      });
    } catch (error) {
      this.emitError("reasoning", error, true);
      this.emitState("needs_attention");
      return;
    }

    // request() has already emitted a normalized error if the provider fails.
    await this.request(input).catch(() => undefined);
  }

  private cancelActive(reason: InterruptionReason): void {
    if (!this.activeReasoning && !this.activeVoice) return;

    ++this.generation;
    this.dependencies.reasoning.cancel();
    this.dependencies.voiceOutput?.stop();
    this.dependencies.meetingAudio.stopAgentAudio();
    this.activeReasoning = false;
    this.activeVoice = false;
    this.emit({
      ...this.metadata(),
      type: "interruption",
      reason,
    });
  }

  private async executeTool(
    event: ToolCallEvent,
    runGeneration: number,
  ): Promise<void> {
    if (!this.dependencies.executeToolCall) return;

    try {
      await this.dependencies.executeToolCall(event);
      if (!this.isCurrent(runGeneration)) return;
      this.emit({
        ...this.metadata(),
        type: "tool_call_result",
        callId: event.callId,
        name: event.name,
        status: "succeeded",
      });
      if (event.name.startsWith("suggest_")) this.emitState("suggestion_added");
    } catch (error) {
      if (!this.isCurrent(runGeneration)) return;
      const message = errorMessage(error);
      this.emit({
        ...this.metadata(),
        type: "tool_call_result",
        callId: event.callId,
        name: event.name,
        status: "failed",
        message,
      });
      this.emitError("tool", error, true);
    }
  }

  private async speak(
    event: AgentMessageEvent,
    runGeneration: number,
  ): Promise<void> {
    this.activeVoice = true;
    this.emitState("speaking");

    try {
      if (!this.dependencies.voiceOutput) return;
      for await (const chunk of this.dependencies.voiceOutput.speak(event.text)) {
        if (!this.isCurrent(runGeneration)) return;
        this.dependencies.meetingAudio.playAgentAudio(chunk);
      }
    } catch (error) {
      if (!this.isCurrent(runGeneration)) return;
      this.emitError("voice", error, true);
      this.emitState("needs_attention");
    } finally {
      if (this.generation === runGeneration) this.activeVoice = false;
    }
  }

  private isCurrent(runGeneration: number): boolean {
    return this.phase === "running" && this.generation === runGeneration;
  }

  private emitState(state: AgentState, detail?: string): void {
    const event: AgentStateEvent = {
      ...this.metadata(),
      type: "agent_state",
      state,
      ...(detail === undefined ? {} : { detail }),
    };
    this.emit(event);
  }

  private emitError(
    source: HarnessErrorEvent["source"],
    error: unknown,
    recoverable: boolean,
  ): void {
    this.emit({
      ...this.metadata(),
      type: "harness_error",
      source,
      message: errorMessage(error),
      recoverable,
    });
  }

  private metadata(): NormalizedEventMetadata {
    return {
      eventId: this.createEventId(),
      occurredAtMs: this.now(),
    };
  }

  private emit(event: ConversationEvent | AgentEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async bestEffortStartupCleanup(): Promise<void> {
    await Promise.allSettled([
      this.dependencies.speechInput.stop(),
      this.dependencies.realtimeVoice?.stop(),
      this.dependencies.meetingAudio.disconnect(),
    ]);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

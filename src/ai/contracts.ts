/**
 * Provider-neutral contracts for Decision Room's conversation layer.
 *
 * Provider SDK values must be translated into these plain TypeScript values at
 * the adapter boundary. Database/generated-binding values should be mapped in
 * the same way before they are supplied as reasoning context.
 */

export type Identifier = string;

export interface AudioFrame {
  readonly data: ArrayBuffer;
  readonly encoding: "pcm16" | "wav";
  readonly sampleRateHz: number;
  readonly channels: 1;
}

export interface NormalizedEventMetadata {
  readonly eventId: Identifier;
  readonly occurredAtMs: number;
}

export interface TranscriptTextEvent extends NormalizedEventMetadata {
  readonly type: "transcript";
  readonly phase: "partial" | "final";
  readonly text: string;
  /** Omitted when the room microphone cannot attribute a speaker reliably. */
  readonly speakerLabel?: string;
  readonly confidence?: number;
}

export interface SpeechActivityEvent extends NormalizedEventMetadata {
  readonly type: "speech_activity";
  readonly activity: "started" | "stopped";
}

export type TranscriptEvent = TranscriptTextEvent | SpeechActivityEvent;

export type AgentJob =
  | "clarify"
  | "challenge"
  | "connect"
  | "reframe"
  | "propose"
  | "close";

export interface AgentMessageEvent extends NormalizedEventMetadata {
  readonly type: "agent_message";
  readonly responseId: Identifier;
  readonly phase: "delta" | "final";
  readonly text: string;
  /** Silent messages update the board; spoken messages are also sent to voice. */
  readonly delivery: "silent" | "spoken";
  readonly job?: AgentJob;
}

export type AgentState =
  | "ready"
  | "listening"
  | "organising"
  | "suggestion_added"
  | "speaking"
  | "needs_attention"
  | "offline";

export interface AgentStateEvent extends NormalizedEventMetadata {
  readonly type: "agent_state";
  readonly state: AgentState;
  readonly detail?: string;
}

export interface DecisionToolArguments {
  readonly suggest_evidence: {
    readonly itemId?: Identifier;
    readonly criterionId?: Identifier;
    readonly evidenceType:
      | "data"
      | "customer"
      | "assumption"
      | "dependency"
      | "risk";
    readonly text: string;
    readonly sourceEventId?: Identifier;
  };
  readonly suggest_item: {
    readonly title: string;
    readonly description: string;
    readonly effort: number;
    readonly sourceEventId?: Identifier;
  };
  readonly suggest_relation: {
    readonly fromItemId: Identifier;
    readonly toItemId: Identifier;
    readonly relationType:
      | "depends_on"
      | "duplicates"
      | "alternative_to"
      | "enables"
      | "blocks";
    readonly sourceEventId?: Identifier;
  };
  readonly flag_conflict: {
    readonly itemIds: ReadonlyArray<Identifier>;
    readonly explanation: string;
  };
  readonly publish_candidate_proposal: {
    readonly items: ReadonlyArray<{
      readonly itemId: Identifier;
      readonly disposition: "include" | "defer" | "test";
      readonly orderIndex: number;
      readonly effortCommitted: number;
    }>;
    readonly explanation: string;
  };
  readonly set_ai_state: {
    readonly state: AgentState;
    readonly detail?: string;
  };
  readonly sync_discussion_points: {
    readonly agreements: ReadonlyArray<string>;
    readonly differences: ReadonlyArray<string>;
  };
}

export type DecisionToolName = keyof DecisionToolArguments;

type ToolCallFor<Name extends DecisionToolName> =
  NormalizedEventMetadata & {
    readonly type: "tool_call";
    readonly callId: Identifier;
    readonly name: Name;
    readonly arguments: DecisionToolArguments[Name];
  };

export type ToolCallEvent = {
  [Name in DecisionToolName]: ToolCallFor<Name>;
}[DecisionToolName];

export interface ToolCallResultEvent extends NormalizedEventMetadata {
  readonly type: "tool_call_result";
  readonly callId: Identifier;
  readonly name: DecisionToolName;
  readonly status: "succeeded" | "failed";
  readonly message?: string;
}

export type InterruptionReason =
  | "human_speech"
  | "new_request"
  | "manual"
  | "shutdown";

export interface InterruptionEvent extends NormalizedEventMetadata {
  readonly type: "interruption";
  readonly reason: InterruptionReason;
}

export interface HarnessErrorEvent extends NormalizedEventMetadata {
  readonly type: "harness_error";
  readonly source: "audio" | "speech_input" | "reasoning" | "tool" | "voice";
  readonly message: string;
  readonly recoverable: boolean;
}

/** Events a reasoning provider may yield while producing one response. */
export type AgentEvent = AgentMessageEvent | ToolCallEvent | AgentStateEvent;

/** The only event union application code needs to consume from the harness. */
export type ConversationEvent =
  | TranscriptEvent
  | AgentEvent
  | ToolCallResultEvent
  | InterruptionEvent
  | HarnessErrorEvent;

export interface DecisionContractContext {
  readonly version: number;
  readonly decisionQuestion: string;
  readonly objective: string;
  readonly capacityTotal: number;
  readonly criteria: ReadonlyArray<{
    readonly id: Identifier;
    readonly label: string;
    readonly type: "objective" | "constraint" | "evaluation";
  }>;
  readonly decisionRule: string;
}

export interface ReasoningParticipant {
  readonly id: Identifier;
  readonly displayName: string;
  readonly roleLabel?: string;
  readonly connected: boolean;
  readonly contractAcceptedVersion?: number;
}

export interface ReasoningItem {
  readonly id: Identifier;
  readonly title: string;
  readonly description: string;
  readonly effort: number;
  readonly status:
    | "suggested"
    | "active"
    | "included"
    | "deferred"
    | "rejected";
  readonly createdBy: "facilitator" | "participant" | "ai";
  readonly kind?: "agreement" | "difference" | "topic";
}

export interface ReasoningPosition {
  readonly participantId: Identifier;
  readonly itemId: Identifier;
  readonly stance: "support" | "concern" | "neutral";
  readonly note?: string;
}

export interface ReasoningEvidence {
  readonly id: Identifier;
  readonly itemId?: Identifier;
  readonly criterionId?: Identifier;
  readonly text: string;
  readonly type: "data" | "customer" | "assumption" | "dependency" | "risk";
  readonly status: "suggested" | "confirmed" | "rejected";
}

export interface ReasoningRelation {
  readonly id: Identifier;
  readonly fromItemId: Identifier;
  readonly toItemId: Identifier;
  readonly type:
    | "depends_on"
    | "duplicates"
    | "alternative_to"
    | "enables"
    | "blocks";
  readonly status: "suggested" | "confirmed" | "rejected";
}

export interface ReasoningProposal {
  readonly version: number;
  readonly items: ReadonlyArray<{
    readonly itemId: Identifier;
    readonly disposition: "include" | "defer" | "test";
    readonly orderIndex: number;
    readonly effortCommitted: number;
  }>;
  readonly approvals: ReadonlyArray<{
    readonly participantId: Identifier;
    readonly state: "approved" | "change_requested";
  }>;
}

export interface RecentConversationEvent {
  readonly id: Identifier;
  readonly sequence: number;
  readonly text: string;
  readonly isFinal: boolean;
  readonly speakerLabel?: string;
}

export interface ReasoningRoomSnapshot {
  readonly roomId: Identifier;
  readonly contract: DecisionContractContext;
  readonly participants: ReadonlyArray<ReasoningParticipant>;
  readonly items: ReadonlyArray<ReasoningItem>;
  readonly positions: ReadonlyArray<ReasoningPosition>;
  readonly evidence: ReadonlyArray<ReasoningEvidence>;
  readonly relations: ReadonlyArray<ReasoningRelation>;
  readonly proposal?: ReasoningProposal;
  readonly recentConversation: ReadonlyArray<RecentConversationEvent>;
}

export type ReasoningTrigger =
  | "final_transcript"
  | "ask_ai"
  | "resolve_this"
  | "opportunistic";

export interface ReasoningInput {
  readonly requestId: Identifier;
  readonly trigger: ReasoningTrigger;
  readonly room: ReasoningRoomSnapshot;
  /** The final utterance or explicit command that caused this run. */
  readonly prompt?: string;
  /** Optional item/disagreement selected by Resolve this. */
  readonly focus?: {
    readonly itemIds: ReadonlyArray<Identifier>;
    readonly explanation?: string;
  };
}

export interface MeetingAudioAdapter {
  connect(roomId: Identifier): Promise<void>;
  disconnect(): Promise<void>;
  onAudioInput(handler: (frame: AudioFrame) => void): void;
  playAgentAudio(chunk: ArrayBuffer): void;
  stopAgentAudio(): void;
}

export interface SpeechInputAdapter {
  start(onEvent: (event: TranscriptEvent) => void): Promise<void>;
  pushAudio(frame: AudioFrame): void;
  stop(): Promise<void>;
}

export type RealtimeVoiceEvent = AgentStateEvent | HarnessErrorEvent;

/**
 * A provider-neutral full-duplex voice session. Unlike text-to-speech, this
 * adapter owns turn detection, response timing, interruption, and streaming
 * playback for one live conversation.
 */
export interface RealtimeVoiceAdapter {
  start(onEvent: (event: RealtimeVoiceEvent) => void): Promise<void>;
  pushAudio(frame: AudioFrame): void;
  stop(): Promise<void>;
}

export interface ReasoningAdapter {
  run(input: ReasoningInput): AsyncIterable<AgentEvent>;
  /** Must promptly settle the iterator returned by the active run. */
  cancel(): void;
}

export interface VoiceOutputAdapter {
  speak(text: string): AsyncIterable<ArrayBuffer>;
  /** Must promptly settle the iterator returned by the active speak call. */
  stop(): void;
}

export type ToolCallExecutor = (event: ToolCallEvent) => Promise<void>;

export interface AutomaticReasoningRequest {
  readonly roomId: Identifier;
  readonly transcript: TranscriptTextEvent & { readonly phase: "final" };
}

/**
 * Supplies fresh subscribed room state when a final transcript should trigger
 * an automatic reasoning run. Omit it when reasoning is explicit-only.
 */
export type ReasoningInputFactory = (
  request: AutomaticReasoningRequest,
) => ReasoningInput | Promise<ReasoningInput>;

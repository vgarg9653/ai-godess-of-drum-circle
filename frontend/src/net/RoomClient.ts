/**
 * The one interface the app uses to reach a room.
 *
 * Everything above this line is transport-agnostic, so the mock server and the
 * real Socket.IO server are interchangeable. That matters right now: the
 * backend does not exist yet, and the frontend must not be blocked on it.
 */

import type {
  Ack,
  ClockPongPayload,
  CreateRoomPayload,
  JoinResult,
  JoinRoomPayload,
  Phrase,
  SelectInstrumentPayload,
  ServerToClientEvents,
  UpdateTransportPayload,
} from "@godc/shared";

export type Unsubscribe = () => void;

export interface RoomClient {
  connect(): Promise<void>;
  disconnect(): void;

  createRoom(p: CreateRoomPayload): Promise<Ack<JoinResult>>;
  joinRoom(p: JoinRoomPayload): Promise<Ack<JoinResult>>;

  ping(t0: number): Promise<ClockPongPayload>;

  selectInstrument(p: SelectInstrumentPayload): Promise<Ack<{ instrumentId: string }>>;

  updatePhrase(phrase: Phrase): void;
  clearPhrase(): void;

  updateTransport(p: UpdateTransportPayload): void;
  /** Host only. Moves the room out of the lobby. */
  beginSession(): void;
  endSession(): void;

  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): Unsubscribe;
}

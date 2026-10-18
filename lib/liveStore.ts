/**
 * In-memory store for the high-frequency live media (camera frames + audio
 * clips). These are ephemeral by nature, so keeping them in server memory
 * avoids a database round-trip on every frame — which is the main source of
 * live-view latency (especially with a remote DB region).
 *
 * Trade-off: state lives only in this server process (fine for a single
 * dev/prod server; not shared across serverless instances). Durable data
 * (devices, pairing, PINs) still lives in Postgres.
 */
export type AudioChunk = {
  seq: number;
  data: Buffer;
  mime: string;
  at: number;
};

type Media = { data: Buffer; mime: string; at: number };

const globalForLive = globalThis as unknown as {
  __liveFrames?: Map<string, Media>;
  __liveScreenFrames?: Map<string, Media>;
  __liveAudio?: Map<string, Media>;
  __liveAudioQueues?: Map<string, AudioChunk[]>;
  __liveAudioSeq?: Map<string, number>;
  __liveSeen?: Map<string, number>;
  __liveOwners?: Map<string, string>;
};

export const frames = globalForLive.__liveFrames ?? new Map<string, Media>();
export const screenFrames = globalForLive.__liveScreenFrames ?? new Map<string, Media>();
export const audio = globalForLive.__liveAudio ?? new Map<string, Media>();
export const audioQueues =
  globalForLive.__liveAudioQueues ?? new Map<string, AudioChunk[]>();
export const audioSeq =
  globalForLive.__liveAudioSeq ?? new Map<string, number>();
export const lastSeen = globalForLive.__liveSeen ?? new Map<string, number>();
export const owners = globalForLive.__liveOwners ?? new Map<string, string>();

globalForLive.__liveFrames = frames;
globalForLive.__liveScreenFrames = screenFrames;
globalForLive.__liveAudio = audio;
globalForLive.__liveAudioQueues = audioQueues;
globalForLive.__liveAudioSeq = audioSeq;
globalForLive.__liveSeen = lastSeen;
globalForLive.__liveOwners = owners;

export function touch(deviceId: string): void {
  lastSeen.set(deviceId, Date.now());
}

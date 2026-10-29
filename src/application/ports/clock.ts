import type { EpochMs } from "../../domain/model";

/** "Now" comes in through this port; the domain never reads the clock (AD-7). */
export interface Clock {
  now(): EpochMs;
}

/** New ids come in through this port. */
export interface IdGenerator {
  next(): string;
}

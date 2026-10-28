import type {
  AppointmentStore,
  CustomerStore,
  IdempotencyStore,
  OutboxStore,
  SchedulingReader,
  SeedTarget,
  SettingsStore,
} from "./stores";

export interface Stores {
  scheduling: SchedulingReader;
  appointments: AppointmentStore;
  customers: CustomerStore;
  settings: SettingsStore;
  idempotency: IdempotencyStore;
  outbox: OutboxStore;
}

export interface ReadStores {
  scheduling: SchedulingReader;
  appointments: Pick<
    AppointmentStore,
    "get" | "listByDealershipDay" | "listByCustomer"
  >;
  customers: Pick<CustomerStore, "search" | "get" | "findDuplicates">;
  idempotency: Pick<IdempotencyStore, "get">;
  outbox: Pick<OutboxStore, "list">;
}

/** What a write unit returns. A failure keeps nothing the unit wrote (AD-4). */
export type Outcome<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface UnitOfWork {
  read<T>(work: (stores: ReadStores) => Promise<T>): Promise<T>;
  /**
   * Runs `work` as one all-or-nothing unit. If it throws or returns `{ ok: false }`,
   * nothing it wrote is kept. `work` must await only store calls (AD-7, section 7.2).
   */
  write<T, E>(
    work: (stores: Stores) => Promise<Outcome<T, E>>,
  ): Promise<Outcome<T, E>>;
}

/** A store the app can use: units of work, plus what the seed loader needs. */
export interface Repository extends UnitOfWork, SeedTarget {}

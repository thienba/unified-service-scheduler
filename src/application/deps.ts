import type { Clock, IdGenerator, Logger, Metrics, UnitOfWork } from "./ports";

/** What every command needs from the outside. */
export interface CommandDeps {
  uow: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  metrics: Metrics;
}

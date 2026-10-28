// The Actor comes only from the seeded user named in `X-Demo-User` (AD-3, SEC-2). Nothing else in the
// request is read for a role, a customer id or a dealership list.
import type { Actor } from "../../application/actor";
import type { DemoUser } from "../../domain/model";

export function actorOf(user: DemoUser): Actor {
  return {
    userId: user.id,
    role: user.role,
    ...(user.customerId === null ? {} : { customerId: user.customerId }),
    dealershipIds: user.dealershipIds,
  };
}

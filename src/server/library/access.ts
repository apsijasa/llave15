import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";

export function canUseLibrary(user: SessionUser): boolean {
  return can(user.role, "library.view");
}

export function canCurate(user: SessionUser): boolean {
  return can(user.role, "library.curate") && user.libraryCurator === true;
}

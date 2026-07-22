import "server-only";

// Admin secret guard for action routes (AGENTS.md §15). Action routes must
// require the shared secret in the `x-biasly-admin-secret` header, matched
// against BIASLY_ADMIN_SECRET. Never accept it via query string; never expose
// the secret to browser code.

const ADMIN_SECRET_HEADER = "x-biasly-admin-secret";

/** True when the request carries a valid admin secret header. */
export function hasValidAdminSecret(request: Request): boolean {
  const expected = process.env.BIASLY_ADMIN_SECRET;
  if (!expected) return false; // misconfigured server → deny
  const provided = request.headers.get(ADMIN_SECRET_HEADER);
  return provided === expected;
}

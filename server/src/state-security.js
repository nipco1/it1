/**
 * The application document is persisted as JSON, while identities and credentials
 * are maintained in the relational control.Users table. Never persist or return
 * the legacy `users` property (which could contain client-supplied passwords).
 */
export function stripUsersFromState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const safe = { ...state };
  delete safe.users;
  return safe;
}

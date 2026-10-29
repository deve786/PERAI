const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Can this row's id exist in the cloud backup? Every synced table keys on a
 * uuid column, so an id like "rec-netflix" (the fixed ids sample data was
 * given) is refused by the server — "invalid input syntax for type uuid".
 * Such rows only ever live on this phone.
 */
export function isCloudId(id: unknown): boolean {
  return typeof id === 'string' && UUID.test(id);
}

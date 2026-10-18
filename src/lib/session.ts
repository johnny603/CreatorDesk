// Single-user v1 session stub. Returns the seeded demo artist's id. When real
// auth lands, this becomes the only file that changes — every route and action
// already reads `currentArtistId()` and nothing else.
export function currentArtistId(): string {
  return "artist-1";
}

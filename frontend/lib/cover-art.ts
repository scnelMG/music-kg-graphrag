const releaseGroupMbidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMusicBrainzReleaseGroupMbid(value: string): boolean {
  return releaseGroupMbidPattern.test(value);
}

export function sameOriginCoverUrl(coverUrl: string, releaseGroupMbid: string, requestUrl: string): string {
  const coverArtArchiveUrl = `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`;
  if (!isMusicBrainzReleaseGroupMbid(releaseGroupMbid) || coverUrl !== coverArtArchiveUrl) return coverUrl;
  return new URL(`/api/music/covers/${releaseGroupMbid}`, requestUrl).toString();
}

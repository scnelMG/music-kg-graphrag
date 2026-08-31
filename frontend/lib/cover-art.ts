const releaseGroupMbidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMusicBrainzReleaseGroupMbid(value: string): boolean {
  return releaseGroupMbidPattern.test(value);
}

export function directCoverArtArchiveUrl(coverUrl: string, releaseGroupMbid: string): string {
  const coverArtArchiveUrl = `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`;
  if (!isMusicBrainzReleaseGroupMbid(releaseGroupMbid)) return coverUrl;
  try {
    const source = new URL(coverUrl);
    if (source.href === coverArtArchiveUrl || source.pathname === `/api/music/covers/${releaseGroupMbid}`) return coverArtArchiveUrl;
  } catch {
    return coverUrl;
  }
  return coverUrl;
}

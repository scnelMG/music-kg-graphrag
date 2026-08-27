import type { Album } from "./connected-music-contract";

export function catalogTypeLabel(primaryType: Album["primaryType"]): string {
  return primaryType === "EP" ? "EP" : "앨범";
}

export function isKoreanConsonantOnly(query: string): boolean {
  return /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(query);
}

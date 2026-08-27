"use client";

import dynamic from "next/dynamic";

import { PublicMusicDeskFallback } from "./public-music-desk-fallback";

const PublicMusicDesk = dynamic(
  () => import("./public-music-desk").then((module) => module.PublicMusicDesk),
  { loading: PublicMusicDeskFallback, ssr: false }
);

export function PublicMusicDeskLoader(): React.JSX.Element {
  return <PublicMusicDesk />;
}

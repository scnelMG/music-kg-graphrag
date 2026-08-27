"use client";

import { useEffect } from "react";

export function FontLoader(): null {
  useEffect(() => {
    void import("@fontsource-variable/noto-serif-kr");
  }, []);
  return null;
}

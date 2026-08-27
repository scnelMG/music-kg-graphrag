"use client";

import { useEffect, useState } from "react";

import { publicInsightsSchema, type PublicGraphTaste } from "../lib/public-discovery-contract";
import { publicBffGet, requestBff } from "../lib/review-bff-contract";

export type PublicInsightState = "error" | "loading" | "ready";

export function usePublicInsights(): Readonly<{
  graphTaste: PublicGraphTaste | null;
  insightMessage: string;
  insightState: PublicInsightState;
}> {
  const [graphTaste, setGraphTaste] = useState<PublicGraphTaste | null>(null);
  const [insightMessage, setInsightMessage] = useState("오늘의 음악을 고르는 중입니다.");
  const [insightState, setInsightState] = useState<PublicInsightState>("loading");

  useEffect(() => {
    let active = true;
    void requestBff(publicBffGet("/api/music/insights"), publicInsightsSchema).then((outcome) => {
      if (!active) return;
      if (outcome.kind === "failure") {
        setGraphTaste(null);
        setInsightMessage("오늘의 음악을 불러오지 못했습니다. 장르나 앨범 검색으로 계속 탐색할 수 있습니다.");
        setInsightState("error");
        return;
      }
      setGraphTaste(outcome.value.graphTaste);
      setInsightMessage("");
      setInsightState("ready");
    });
    return () => { active = false; };
  }, []);

  return { graphTaste, insightMessage, insightState };
}

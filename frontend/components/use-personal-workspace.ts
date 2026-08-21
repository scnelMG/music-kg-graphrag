"use client";

import ky from "ky";
import { useEffect, useRef, useState } from "react";

import {
  failureText,
  formOptionsSchema,
  graphTasteSchema,
  groundedExplanationSchema,
  normalizeExistingRecord,
  ownerSessionSchema,
  personalInsightsSchema,
  recordsSchema,
  syncStateSchema,
  type Availability,
  type ExistingRecord,
  type ExplanationState,
  type GraphTaste,
  type GroundedExplanation,
  type InsightState,
  type OwnerAccess,
  type RecordState,
  type SyncState
} from "../lib/connected-music-contract";
import { requestBff } from "../lib/review-bff-contract";

const personalReadTimeoutMilliseconds = 15_000;
const personalSyncTimeoutMilliseconds = 45_000;

export function usePersonalWorkspace() {
  const [availability, setAvailability] = useState<Availability>("loading");
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccess>("checking");
  const [writeAccess, setWriteAccess] = useState(false);
  const [records, setRecords] = useState<readonly ExistingRecord[]>([]);
  const [nextRecordCursor, setNextRecordCursor] = useState<string | null>(null);
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const [recordState, setRecordState] = useState<RecordState>("loading");
  const [sentiments, setSentiments] = useState<readonly string[]>([]);
  const [graphTaste, setGraphTaste] = useState<GraphTaste | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [insightMessage, setInsightMessage] = useState("개인 기록을 불러오는 중입니다.");
  const [insightState, setInsightState] = useState<InsightState>("loading");
  const [groundedExplanation, setGroundedExplanation] = useState<GroundedExplanation | null>(null);
  const [explanationState, setExplanationState] = useState<ExplanationState>("idle");
  const insightGeneration = useRef(0);
  const explanationGeneration = useRef(0);
  const recordGeneration = useRef(0);
  const workspaceGeneration = useRef(0);

  function beginPersonalWorkspaceLoad(): number {
    const generation = workspaceGeneration.current + 1;
    workspaceGeneration.current = generation;
    insightGeneration.current += 1;
    explanationGeneration.current += 1;
    recordGeneration.current += 1;
    setGroundedExplanation(null);
    setExplanationState("idle");
    setGraphTaste(null);
    setSyncState(null);
    setInsightState("loading");
    setInsightMessage("개인 기록과 추천을 불러오는 중입니다.");
    setRecords([]);
    setNextRecordCursor(null);
    setRecordState("loading");
    setRecordMessage("");
    setLoadingMoreRecords(false);
    return generation;
  }

  async function loadInsights(): Promise<void> {
    const generation = insightGeneration.current + 1;
    insightGeneration.current = generation;
    explanationGeneration.current += 1;
    setGroundedExplanation(null);
    setExplanationState("idle");
    setInsightState("loading");
    setInsightMessage("개인 기록과 추천을 불러오는 중입니다.");
    const outcome = await requestBff(ky.get(ownerAccess === "owner" ? "/api/music/insights?scope=owner" : "/api/music/insights", {
      throwHttpErrors: false,
      timeout: personalReadTimeoutMilliseconds
    }), personalInsightsSchema);
    if (generation !== insightGeneration.current) return;
    if (outcome.kind === "failure") {
      setInsightState("error");
      setInsightMessage(failureText(outcome));
      return;
    }
    setSyncState(ownerAccess === "owner" ? outcome.value.syncState ?? null : null);
    setGraphTaste(graphTasteSchema.parse({
      ...outcome.value.graphTaste,
      generatedByLlm: false,
      relisten: outcome.value.graphTaste.relisten ?? []
    }));
    setInsightState("ready");
    setInsightMessage("");
  }

  async function loadRecords(cursor: string | null = null, append = false): Promise<void> {
    const generation = recordGeneration.current + 1;
    recordGeneration.current = generation;
    if (append) setLoadingMoreRecords(true);
    else {
      setRecordState("loading");
      setRecordMessage("");
    }
    const outcome = await requestBff(ky.get("/api/music/records", {
      searchParams: cursor === null ? undefined : { cursor }, throwHttpErrors: false, timeout: personalReadTimeoutMilliseconds
    }), recordsSchema);
    if (generation !== recordGeneration.current) return;
    setLoadingMoreRecords(false);
    if (outcome.kind === "failure") {
      if (!append) {
        setRecordState("error");
        setRecordMessage(failureText(outcome));
      }
      return;
    }
    const nextRecords = outcome.value.records.map(normalizeExistingRecord);
    setRecords((current) => append ? [...current, ...nextRecords] : nextRecords);
    setNextRecordCursor(outcome.value.nextCursor ?? null);
    setRecordState("ready");
  }

  async function reloadPersonalWorkspace(): Promise<void> {
    await Promise.all([loadRecords(), loadInsights()]);
  }

  async function loadPersonalWorkspace(): Promise<void> {
    const generation = beginPersonalWorkspaceLoad();
    setAvailability("loading");
    const outcome = await requestBff(ky.get("/api/music/form-options", {
      throwHttpErrors: false,
      timeout: personalReadTimeoutMilliseconds
    }), formOptionsSchema);
    if (generation !== workspaceGeneration.current) return;
    if (outcome.kind === "failure") {
      const message = failureText(outcome);
      setAvailability("error");
      setInsightState("error");
      setInsightMessage(message);
      setRecordState("error");
      setRecordMessage(message);
      return;
    }
    setSentiments(outcome.value.sentiments);
    setAvailability("ready");
    await reloadPersonalWorkspace();
  }

  async function refreshPersonalWorkspace(): Promise<void> {
    if (!writeAccess) return;
    const generation = workspaceGeneration.current + 1;
    workspaceGeneration.current = generation;
    insightGeneration.current += 1;
    explanationGeneration.current += 1;
    setGroundedExplanation(null);
    setExplanationState("idle");
    setInsightState("loading");
    setInsightMessage("새 추천을 확인하고 있습니다.");
    const outcome = await requestBff(ky.post("/api/music/sync", {
      throwHttpErrors: false,
      timeout: personalSyncTimeoutMilliseconds
    }), syncStateSchema);
    if (generation !== workspaceGeneration.current) return;
    if (outcome.kind === "failure") {
      setInsightState("error");
      setInsightMessage(failureText(outcome));
      return;
    }
    setSyncState(outcome.value);
    await reloadPersonalWorkspace();
  }

  async function generateGroundedExplanation(): Promise<void> {
    if (!writeAccess || graphTaste === null || insightState !== "ready") return;
    const generation = explanationGeneration.current + 1;
    explanationGeneration.current = generation;
    setGroundedExplanation(null);
    setExplanationState("loading");
    const outcome = await requestBff(ky.post("/api/music/insights/explanation", { throwHttpErrors: false }), groundedExplanationSchema);
    if (generation !== explanationGeneration.current) return;
    if (outcome.kind === "failure") {
      setExplanationState("unavailable");
      return;
    }
    setGroundedExplanation(outcome.value);
    switch (outcome.value.status) {
      case "GENERATED": setExplanationState("generated"); return;
      case "DISABLED": setExplanationState("disabled"); return;
      case "NO_EVIDENCE": setExplanationState("no-evidence"); return;
      case "UNAVAILABLE": setExplanationState("unavailable"); return;
    }
  }

  useEffect(() => {
    void requestBff(ky.get("/api/owner/session", { throwHttpErrors: false }), ownerSessionSchema).then((outcome) => {
      if (outcome.kind === "failure" || !outcome.value.owner) {
        setOwnerAccess("visitor");
        setWriteAccess(false);
        return;
      }
      setOwnerAccess("owner");
      setWriteAccess(outcome.value.writeOwner ?? false);
    });
  }, []);

  useEffect(() => {
    if (ownerAccess === "checking") return;
    if (ownerAccess === "owner") void loadPersonalWorkspace();
    else void loadInsights();
  }, [ownerAccess]);

  async function loadMoreRecords(): Promise<void> {
    if (nextRecordCursor === null || loadingMoreRecords) return;
    await loadRecords(nextRecordCursor, true);
  }

  return { availability, explanationState, generateGroundedExplanation, graphTaste, groundedExplanation,
    insightMessage, insightState, loadMoreRecords, loadPersonalWorkspace, loadingMoreRecords, nextRecordCursor,
    ownerAccess, recordMessage, records, recordState, refreshPersonalWorkspace, reloadPersonalWorkspace,
    sentiments, syncState, writeAccess };
}

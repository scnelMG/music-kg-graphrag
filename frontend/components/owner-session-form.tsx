"use client";

import ky from "ky";
import { useState } from "react";
import { z } from "zod";

import { requestBff } from "../lib/review-bff-contract";

const sessionSchema = z.object({ status: z.literal("ok") });

export function OwnerSessionForm(): React.JSX.Element {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    if (token.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setMessage("");
    const outcome = await requestBff(
      ky.post("/api/owner/session", { json: { token: token.trim() }, throwHttpErrors: false }),
      sessionSchema
    );
    if (outcome.kind === "failure") {
      setMessage("소유자 확인에 실패했습니다. 설정한 토큰을 다시 확인해 주세요.");
      setSubmitting(false);
      return;
    }
    window.location.assign("/");
  }

  return <form className="access-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <label htmlFor="owner-session-token">소유자 설정 토큰</label>
    <input id="owner-session-token" name="token" type="password" autoComplete="one-time-code" value={token}
      onChange={(event) => setToken(event.target.value)} />
    <button type="submit" disabled={submitting}>{submitting ? "확인 중" : "개인 기록 열기"}</button>
    {message.length > 0 && <p className="notice error" role="status">{message}</p>}
  </form>;
}

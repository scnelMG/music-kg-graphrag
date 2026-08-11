"use client";

import ky from "ky";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

function safeNextPath(value: string | null): string {
  return value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function PrivateAccessGate(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    if (token.length === 0 || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await ky.post("/api/access", {
        json: { token },
        throwHttpErrors: false
      });
      if (response.status !== 204) {
        setMessage("접근 토큰을 확인한 뒤 다시 시도해 주세요.");
        return;
      }
      window.location.assign(safeNextPath(searchParams.get("next")));
    } catch (error) {
      if (error instanceof TypeError) {
        setMessage("접근 확인을 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="music-journal access-page">
    <section className="access-sheet" aria-labelledby="access-heading">
      <p className="section-kicker">개인 기록 보호</p>
      <h1 id="access-heading">나의 음악 기록</h1>
      <p className="journal-intro">이 공간에는 개인 Notion 감상 기록이 연결됩니다. 서비스 접근 토큰을 입력해 계속해 주세요.</p>
      <form className="access-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label htmlFor="app-access-token">서비스 접근 토큰</label>
        <input id="app-access-token" autoComplete="current-password" onChange={(event) => setToken(event.target.value)} type="password" value={token} />
        <button type="submit" disabled={submitting || token.length === 0}>{submitting ? "확인 중" : "기록장 열기"}</button>
      </form>
      {message.length > 0 && <p className="notice error" role="status">{message}</p>}
    </section>
  </main>;
}

import ky, { TimeoutError } from "ky";
import { NextResponse } from "next/server";
import { z } from "zod";

const backendConfigSchema = z.object({
  baseUrl: z.string().url(),
  sharedSecret: z.string().min(1)
});

const apiErrorSchema = z.object({
  code: z.string().min(1),
  requestId: z.string().min(1)
});

const retryableDependencyCodes = new Set([
  "GRAPHDB_UNAVAILABLE",
  "ITUNES_RATE_LIMITED",
  "MUSICBRAINZ_RATE_LIMITED",
  "NOTION_RATE_LIMITED"
]);
const transientBackendStatuses = new Set([502, 503, 504]);
const idempotentBackendWritePaths = new Set(["api/v1/listening-records"]);

export const backendRequestTimeoutMilliseconds = 60_000;
const backendRetryDelaysMilliseconds = [250, 1_000] as const;

function clientErrorMessage(code: string): string {
  if (code === "INVALID_RATING") return "평점은 1에서 5 사이의 정수여야 합니다.";
  return "요청을 처리하지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요.";
}

type BackendCall =
  | { readonly kind: "received"; readonly response: Response }
  | { readonly kind: "handled"; readonly response: NextResponse };

type BackendPath =
  | "api/v1/candidates"
  | `api/v1/candidates/${string}/select`
  | `api/v1/evidence/${string}`
  | "api/v1/graphrag"
  | "api/v1/health"
  | "api/v1/recommendations"
  | "api/v1/reviews";

type ConnectedBackendPath =
  | "api/v1/catalog/albums"
  | "api/v1/catalog/explore"
  | `api/v1/catalog/albums/${string}/editions`
  | `api/v1/catalog/albums/${string}/tracks`
  | `api/v1/catalog/itunes/albums/${string}/tracks`
  | "api/v1/health"
  | "api/v1/ready"
  | "api/v1/listening-records"
  | "api/v1/listening-records/page"
  | "api/v1/listening-records/by-catalog-identity"
  | `api/v1/listening-records/by-release-group/${string}`
  | `api/v1/listening-records/${string}`
  | "api/v1/listening-records/form-options"
  | "api/v1/personal-insights"
  | "api/v1/personal-insights/explanation"
  | "api/v1/personal-sync"
  | "api/v1/personal-sync/reconcile"
  | "api/v1/taste-profile"
  | "api/v1/recommendations/discover"
  | "api/v1/graphrag/taste";

const unavailableResponse = (): NextResponse => NextResponse.json({
  code: "BACKEND_UNAVAILABLE",
  message: "The music backend is temporarily unavailable.",
  retryable: true
}, { status: 503 });

export async function callBackend(
  path: BackendPath | ConnectedBackendPath,
  options: { readonly body?: string; readonly method?: "DELETE" | "GET" | "POST"; readonly searchParams?: URLSearchParams } = {}
): Promise<BackendCall> {
  const config = backendConfigSchema.safeParse({
    baseUrl: process.env.BACKEND_BASE_URL,
    sharedSecret: process.env.BACKEND_BFF_SHARED_SECRET
  });
  if (!config.success) {
    return {
      kind: "handled",
      response: NextResponse.json({
        code: "BACKEND_CONFIGURATION_ERROR",
        message: "The music backend is not configured.",
        retryable: false
      }, { status: 503 })
    };
  }

  try {
    const method = options.method ?? "GET";
    const requestBackend = () => ky(path, {
      body: options.body,
      headers: {
        "content-type": "application/json",
        "x-music-kg-bff-secret": config.data.sharedSecret
      },
      method,
      prefixUrl: config.data.baseUrl.replace(/\/$/, ""),
      redirect: "manual",
      retry: 0,
      searchParams: options.searchParams,
      throwHttpErrors: false,
      timeout: backendRequestTimeoutMilliseconds
    });
    const retryableRequest = method === "GET" || (method === "POST" && idempotentBackendWritePaths.has(path));
    let retryIndex = 0;
    let response: Response;
    while (true) {
      try {
        response = await requestBackend();
        if (!retryableRequest || !transientBackendStatuses.has(response.status)
          || retryIndex === backendRetryDelaysMilliseconds.length) break;
        await response.body?.cancel();
      } catch (error) {
        if (!retryableRequest || !(error instanceof TypeError || error instanceof TimeoutError)
          || retryIndex === backendRetryDelaysMilliseconds.length) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backendRetryDelaysMilliseconds[retryIndex]));
      retryIndex += 1;
    }
    if (response.ok) return { kind: "received", response };
    if (response.status >= 300 && response.status < 400) {
      return { kind: "handled", response: backendContractError() };
    }
    let errorPayload: unknown;
    try {
      errorPayload = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) return { kind: "handled", response: backendContractError() };
      throw error;
    }
    const parsedError = apiErrorSchema.safeParse(errorPayload);
    if (!parsedError.success) {
      if (response.status >= 500) return { kind: "handled", response: unavailableResponse() };
      return {
        kind: "handled",
        response: NextResponse.json({ code: "BACKEND_CONTRACT_ERROR", retryable: false }, { status: 502 })
      };
    }
    if (response.status >= 500) {
      return {
        kind: "handled",
        response: retryableDependencyCodes.has(parsedError.data.code)
          ? NextResponse.json({
            code: parsedError.data.code,
            message: "The music backend is temporarily unavailable.",
            retryable: true
          }, { status: 503 })
          : unavailableResponse()
      };
    }
    return {
      kind: "handled",
      response: NextResponse.json({
        ...parsedError.data,
        message: clientErrorMessage(parsedError.data.code)
      }, { status: response.status })
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof TimeoutError) {
      return { kind: "handled", response: unavailableResponse() };
    }
    throw error;
  }
}

export const callFixtureBackend = callBackend;

export function backendContractError(): NextResponse {
  return NextResponse.json({ code: "BACKEND_CONTRACT_ERROR", retryable: false }, { status: 502 });
}

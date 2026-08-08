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

function clientErrorMessage(code: string): string {
  if (code === "INVALID_RATING") return "평점은 1에서 5 사이의 정수여야 합니다.";
  return "요청을 처리하지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요.";
}

type BackendCall =
  | { readonly kind: "received"; readonly response: Response }
  | { readonly kind: "handled"; readonly response: NextResponse };

type FixtureBackendPath = "api/v1/candidates" | "api/v1/health" | "api/v1/reviews";

const unavailableResponse = (): NextResponse => NextResponse.json({
  code: "BACKEND_UNAVAILABLE",
  message: "The fixture backend is temporarily unavailable.",
  retryable: true
}, { status: 503 });

export async function callFixtureBackend(
  path: FixtureBackendPath,
  options: { readonly body?: string; readonly method?: "GET" | "POST"; readonly searchParams?: URLSearchParams } = {}
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
        message: "The fixture backend is not configured.",
        retryable: false
      }, { status: 503 })
    };
  }

  try {
    const response = await ky(path, {
      body: options.body,
      headers: {
        "content-type": "application/json",
        "x-music-kg-bff-secret": config.data.sharedSecret
      },
      method: options.method ?? "GET",
      prefixUrl: config.data.baseUrl.replace(/\/$/, ""),
      redirect: "manual",
      retry: 0,
      searchParams: options.searchParams,
      throwHttpErrors: false,
      timeout: 2_000
    });
    if (response.ok) return { kind: "received", response };
    if (response.status >= 300 && response.status < 400) {
      return { kind: "handled", response: backendContractError() };
    }
    if (response.status >= 500) return { kind: "handled", response: unavailableResponse() };
    let errorPayload: unknown;
    try {
      errorPayload = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) return { kind: "handled", response: backendContractError() };
      throw error;
    }
    const parsedError = apiErrorSchema.safeParse(errorPayload);
    if (!parsedError.success) {
      return {
        kind: "handled",
        response: NextResponse.json({ code: "BACKEND_CONTRACT_ERROR", retryable: false }, { status: 502 })
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

export function backendContractError(): NextResponse {
  return NextResponse.json({ code: "BACKEND_CONTRACT_ERROR", retryable: false }, { status: 502 });
}

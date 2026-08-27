import ky, { TimeoutError, type Options } from "ky";
import { z } from "zod";

export const publicBffRequestTimeoutMilliseconds = 65_000;

export function publicBffGet(path: string, options: Options = {}): Promise<Response> {
  return ky.get(path, {
    ...options,
    throwHttpErrors: false,
    timeout: publicBffRequestTimeoutMilliseconds
  });
}

const bffFailureSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  retryable: z.boolean().optional()
});

type BffResult<T> =
  | { readonly code?: string; readonly kind: "failure"; readonly message: string }
  | { readonly kind: "success"; readonly value: T };

const fallbackMessages = {
  BACKEND_CONFIGURATION_ERROR: "The music service is not configured.",
  BACKEND_CONTRACT_ERROR: "The music service returned an invalid response. Please retry.",
  BACKEND_UNAVAILABLE: "The music service is temporarily unavailable. Please retry.",
  BFF_AUTH_REQUIRED: "The music service authentication failed."
} as const;
const knownFailureCodeSchema = z.enum([
  "BACKEND_CONFIGURATION_ERROR",
  "BACKEND_CONTRACT_ERROR",
  "BACKEND_UNAVAILABLE",
  "BFF_AUTH_REQUIRED"
]);

function displayFailure(code: string, message?: string): string {
  if (message !== undefined) return message;
  const knownCode = knownFailureCodeSchema.safeParse(code);
  const knownMessage = knownCode.success ? fallbackMessages[knownCode.data] : undefined;
  return knownMessage === undefined ? `${code}: The music request could not be completed.` : `${code}: ${knownMessage}`;
}

export function parseBffPayload<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: unknown): BffResult<T> {
  const success = schema.safeParse(payload);
  if (success.success) return { kind: "success", value: success.data };
  const failure = bffFailureSchema.safeParse(payload);
  if (failure.success) {
    return { code: failure.data.code, kind: "failure", message: displayFailure(failure.data.code, failure.data.message) };
  }
  return { kind: "failure", message: fallbackMessages.BACKEND_CONTRACT_ERROR };
}

export async function requestBff<T>(request: Promise<Response>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<BffResult<T>> {
  try {
    const response = await request;
    const payload: unknown = await response.json();
    return parseBffPayload(schema, payload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "failure", message: fallbackMessages.BACKEND_CONTRACT_ERROR };
    }
    if (error instanceof TimeoutError || error instanceof TypeError) {
      return { kind: "failure", message: fallbackMessages.BACKEND_UNAVAILABLE };
    }
    if (error instanceof Error) {
      return { kind: "failure", message: "The music request failed safely. Please retry." };
    }
    throw error;
  }
}

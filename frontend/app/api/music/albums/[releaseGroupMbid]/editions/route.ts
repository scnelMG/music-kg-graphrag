import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../../lib/backend-bff";
import { catalogEditionPageSchema } from "../../../../../../lib/music-catalog-contract";

const paramsSchema = z.object({ releaseGroupMbid: z.string().trim().min(1) });
const cursorSchema = z.string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= 2_147_483_647);
const publicCatalogCacheControl = "public, s-maxage=600, stale-while-revalidate=86400";

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly releaseGroupMbid: string }> }
): Promise<NextResponse> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const releaseGroupMbid = params.data.releaseGroupMbid;
  const queryKeys = [...request.nextUrl.searchParams.keys()];
  if (queryKeys.some((key) => key !== "cursor" && key !== "selected")) {
    return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  }
  const cursors = request.nextUrl.searchParams.getAll("cursor");
  const selectedValues = request.nextUrl.searchParams.getAll("selected");
  const cursor = cursors[0]?.trim();
  const selected = selectedValues[0]?.trim();
  const parsedCursor = cursor === undefined ? null : cursorSchema.safeParse(cursor);
  if (cursors.length > 1 || selectedValues.length > 1
      || (parsedCursor !== null && !parsedCursor.success)
      || (selected !== undefined && selected.length === 0)) {
    return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  }
  const searchParams = new URLSearchParams();
  if (parsedCursor?.success) searchParams.set("cursor", String(parsedCursor.data));
  if (selected !== undefined) searchParams.set("selected", selected);
  const result = await callBackend(
    `api/v1/catalog/albums/${encodeURIComponent(releaseGroupMbid)}/editions`,
    { searchParams }
  );
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const page = catalogEditionPageSchema.safeParse(payload);
  if (!page.success || page.data.editions.some((edition) => edition.releaseGroupMbid !== releaseGroupMbid)) {
    return backendContractError();
  }
  return NextResponse.json(page.data, { headers: { "cache-control": publicCatalogCacheControl } });
}

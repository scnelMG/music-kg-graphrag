import { z } from "zod";

export type FixtureCandidate = {
  readonly artist: string;
  readonly id: string;
  readonly source: "PUBLIC_FIXTURE";
  readonly title: string;
};

export type ReviewValidationFailure = {
  readonly code: "INVALID_RATING" | "REVIEW_REQUIRED" | "CANDIDATE_REQUIRED";
  readonly field: "candidateId" | "rating" | "review";
  readonly message: string;
};

export type SavedFixtureReview = {
  readonly id: "fixture-review-001";
  readonly status: "SAVED_IN_FIXTURE_MODE";
};

export type FixtureAdapterAvailable = {
  readonly status: "available";
};

export type FixtureAdapterUnavailable = {
  readonly code: "EXTERNAL_BACKEND_UNAVAILABLE";
  readonly message: string;
  readonly recovery: string;
  readonly status: "unavailable";
};

export type FixtureAdapterState = FixtureAdapterAvailable | FixtureAdapterUnavailable;

const fixtureCandidates: readonly FixtureCandidate[] = [
  { artist: "Fixture Artist", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "Fixture Album" }
] as const;

const fixtureAdapterUnavailable: FixtureAdapterUnavailable = {
  code: "EXTERNAL_BACKEND_UNAVAILABLE",
  message: "외부 백엔드를 사용할 수 없습니다. fixture 어댑터를 다시 활성화한 뒤 시도해 주세요.",
  recovery: "FIXTURE_ADAPTER_MODE를 enabled로 설정한 뒤 다시 시도해 주세요.",
  status: "unavailable"
};

const reviewSchema = z.object({
  candidateId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().min(1)
});

export function searchFixtureCandidates(query: string): readonly FixtureCandidate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) return fixtureCandidates;
  return fixtureCandidates.filter((candidate) => [candidate.artist, candidate.title].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
}

export function getFixtureAdapterState(mode: string | undefined): FixtureAdapterState {
  if (mode === "disabled") return fixtureAdapterUnavailable;
  return { status: "available" };
}

export function validateFixtureReview(input: { readonly candidateId: string; readonly rating: number; readonly review: string }): ReviewValidationFailure | null {
  const parsed = reviewSchema.safeParse(input);
  if (parsed.success) return null;
  const field = parsed.error.issues[0]?.path[0];
  if (field === "rating") return { code: "INVALID_RATING", field, message: "평점은 1에서 5 사이의 정수여야 합니다." };
  if (field === "review") return { code: "REVIEW_REQUIRED", field, message: "리뷰 내용을 입력해 주세요." };
  return { code: "CANDIDATE_REQUIRED", field: "candidateId", message: "검토할 후보를 먼저 선택해 주세요." };
}

export function saveFixtureReview(input: { readonly candidateId: string; readonly rating: number; readonly review: string }): ReviewValidationFailure | SavedFixtureReview {
  const validationFailure = validateFixtureReview(input);
  if (validationFailure !== null) return validationFailure;
  return { id: "fixture-review-001", status: "SAVED_IN_FIXTURE_MODE" };
}

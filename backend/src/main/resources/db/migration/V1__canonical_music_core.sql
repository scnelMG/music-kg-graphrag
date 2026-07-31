CREATE TABLE users (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE artists (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    sort_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE release_groups (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    primary_type TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE releases (
    id UUID PRIMARY KEY,
    release_group_id UUID NOT NULL REFERENCES release_groups(id),
    title TEXT NOT NULL,
    release_date DATE,
    country_code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE tracks (
    id UUID PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES releases(id),
    title TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    duration_ms INTEGER CHECK (duration_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (release_id, position)
);

CREATE TABLE credits (
    id UUID PRIMARY KEY,
    artist_id UUID NOT NULL REFERENCES artists(id),
    release_group_id UUID REFERENCES release_groups(id),
    release_id UUID REFERENCES releases(id),
    track_id UUID REFERENCES tracks(id),
    credit_role TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 1 CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (num_nonnulls(release_group_id, release_id, track_id) = 1)
);

CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    release_id UUID NOT NULL REFERENCES releases(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE review_revisions (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (review_id, revision)
);

CREATE TABLE review_contexts (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id),
    context_type TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (review_id, context_type, value)
);

CREATE TABLE sources (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL,
    source_type TEXT NOT NULL,
    canonical_url TEXT,
    license_classification TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (provider, source_type, canonical_url)
);

CREATE TABLE external_identifiers (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL,
    entity_kind TEXT NOT NULL,
    external_id TEXT NOT NULL,
    artist_id UUID REFERENCES artists(id),
    release_group_id UUID REFERENCES release_groups(id),
    release_id UUID REFERENCES releases(id),
    track_id UUID REFERENCES tracks(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(artist_id, release_group_id, release_id, track_id) = 1),
    UNIQUE (provider, entity_kind, external_id)
);

CREATE TABLE provider_snapshots (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES sources(id),
    entity_kind TEXT NOT NULL,
    entity_id UUID NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    content_hash TEXT NOT NULL,
    confidence NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
    payload_redacted JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (source_id, entity_kind, entity_id, content_hash)
);

CREATE TABLE sync_jobs (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    last_error_code TEXT,
    UNIQUE (provider, job_type, idempotency_key)
);

CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    operation TEXT NOT NULL,
    canonical_entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYABLE_FAILED', 'TERMINAL_FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ,
    last_redacted_error_code TEXT CHECK (last_redacted_error_code IS NULL OR last_redacted_error_code ~ '^[A-Z0-9_]{1,64}$'),
    replayed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ
);

CREATE TABLE projection_generations (
    id UUID PRIMARY KEY,
    generation BIGINT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'STALE', 'RETIRED')),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE TABLE embedding_metadata (
    id UUID PRIMARY KEY,
    entity_kind TEXT NOT NULL,
    entity_id UUID NOT NULL,
    canonical_text_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    model_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'STALE', 'DELETED')),
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (entity_kind, entity_id, canonical_text_hash, provider, model, model_version)
);

CREATE TABLE deletion_state (
    id UUID PRIMARY KEY,
    entity_kind TEXT NOT NULL,
    entity_id UUID NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PENDING', 'DELETED', 'PURGED')),
    requested_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (entity_kind, entity_id)
);

CREATE INDEX outbox_events_due_idx ON outbox_events (state, next_attempt_at, created_at);
CREATE INDEX embedding_metadata_entity_idx ON embedding_metadata (entity_kind, entity_id);

CREATE OR REPLACE FUNCTION reject_created_at_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'created_at is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_created_at_immutable BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER artists_created_at_immutable BEFORE UPDATE ON artists FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER release_groups_created_at_immutable BEFORE UPDATE ON release_groups FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER releases_created_at_immutable BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER tracks_created_at_immutable BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER credits_created_at_immutable BEFORE UPDATE ON credits FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER reviews_created_at_immutable BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER review_revisions_created_at_immutable BEFORE UPDATE ON review_revisions FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER review_contexts_created_at_immutable BEFORE UPDATE ON review_contexts FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER sources_created_at_immutable BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER provider_snapshots_created_at_immutable BEFORE UPDATE ON provider_snapshots FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER idempotency_keys_created_at_immutable BEFORE UPDATE ON idempotency_keys FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER outbox_events_created_at_immutable BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER projection_generations_created_at_immutable BEFORE UPDATE ON projection_generations FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER embedding_metadata_created_at_immutable BEFORE UPDATE ON embedding_metadata FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();

CREATE OR REPLACE FUNCTION replay_terminal_outbox_event(p_event_id UUID, p_replay_at TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE outbox_events
    SET state = 'PENDING', next_attempt_at = p_replay_at, replayed_at = p_replay_at, last_redacted_error_code = NULL
    WHERE id = p_event_id AND state = 'TERMINAL_FAILED';
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$ LANGUAGE plpgsql;

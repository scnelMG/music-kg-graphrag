CREATE TABLE listening_records (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    release_id UUID NOT NULL REFERENCES releases(id),
    notion_page_id TEXT UNIQUE,
    notion_last_edited_at TIMESTAMPTZ,
    sentiment TEXT,
    favourite_track TEXT,
    owned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, release_id)
);

CREATE TABLE album_covers (
    id UUID PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES releases(id),
    provider TEXT NOT NULL,
    source_url TEXT NOT NULL,
    thumbnail_url TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (release_id, provider)
);

CREATE TABLE notion_sync_state (
    id UUID PRIMARY KEY,
    listening_record_id UUID NOT NULL REFERENCES listening_records(id),
    data_source_id TEXT NOT NULL,
    remote_page_id TEXT,
    remote_last_edited_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    state TEXT NOT NULL CHECK (state IN ('PENDING', 'SYNCED', 'RETRYABLE_FAILED', 'TERMINAL_FAILED')),
    idempotency_key TEXT NOT NULL UNIQUE,
    last_redacted_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (listening_record_id, data_source_id)
);

CREATE INDEX listening_records_user_idx ON listening_records (user_id, updated_at DESC);
CREATE INDEX notion_sync_state_due_idx ON notion_sync_state (state, updated_at);

CREATE TRIGGER listening_records_created_at_immutable BEFORE UPDATE ON listening_records FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER album_covers_created_at_immutable BEFORE UPDATE ON album_covers FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();
CREATE TRIGGER notion_sync_state_created_at_immutable BEFORE UPDATE ON notion_sync_state FOR EACH ROW EXECUTE FUNCTION reject_created_at_change();

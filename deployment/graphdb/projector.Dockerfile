FROM ghcr.io/astral-sh/uv@sha256:727eea7895e8bda0c5f582a5fa2795bdeecabbcb2e9371de066b95da06c31ad5

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY pipeline/pyproject.toml pipeline/uv.lock /app/pipeline/
RUN uv sync --directory /app/pipeline --frozen --no-dev --no-install-project

COPY pipeline/pipeline /app/pipeline/pipeline
COPY data /app/data
COPY ontology /app/ontology
COPY shapes /app/shapes
COPY deployment/graphdb/repository-config.ttl /app/deployment/graphdb/repository-config.ttl
RUN uv sync --directory /app/pipeline --frozen --no-dev

ENTRYPOINT ["/app/pipeline/.venv/bin/python", "-m", "pipeline.project_graph"]

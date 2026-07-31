from __future__ import annotations

import typer

app = typer.Typer(
    help="Fixture-only worker boundary. No live providers, credentials, or writes are available.",
    no_args_is_help=True,
)


@app.callback()
def fixture_worker() -> None:
    pass


def main() -> None:
    app()


if __name__ == "__main__":
    main()

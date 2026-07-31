from .pipeline.validate_rdf import ExitStatus, main, validate_fixture

__all__ = ["ExitStatus", "main", "validate_fixture"]

if __name__ == "__main__":
    raise SystemExit(main())

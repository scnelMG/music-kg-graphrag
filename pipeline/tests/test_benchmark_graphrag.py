from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from pipeline.query_suite import decode_json

REPOSITORY_ROOT = Path(__file__).parents[2]
GOLDEN_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "graphrag-golden.jsonl"
EXPECTED_EXACT_RATIO = f"{1:.6f}"


def test_benchmark_cli_reports_measured_verifier_latency_without_weakening_quality_gate(
    tmp_path: Path,
) -> None:
    # Given: a deterministic evidence-bound GraphRAG golden suite
    output = tmp_path / "benchmark.json"

    # When: the performance CLI repeats every scenario enough times for a p95 sample
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.benchmark_graphrag",
            "--suite",
            str(GOLDEN_SUITE),
            "--iterations",
            "5",
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then: latency is measured separately while the evidence-quality contract stays exact
    assert completed.returncode == 0, completed.stderr
    report = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(report, dict)
    assert report["status"] == "PASSED"
    measurement = report["measurement"]
    metrics = report["metrics"]
    quality = report["quality"]
    assert isinstance(measurement, dict)
    assert isinstance(metrics, dict)
    assert isinstance(quality, dict)
    assert measurement["iterations"] == 5
    assert measurement["sample_count"] == 25
    assert measurement["scope"] == "DETERMINISTIC_VERIFIER_ONLY"
    assert isinstance(metrics["verifier_latency_p50_us"], int)
    assert isinstance(metrics["verifier_latency_p95_us"], int)
    assert metrics["verifier_latency_p95_us"] >= metrics["verifier_latency_p50_us"]
    assert quality["scenario_pass_rate"] == EXPECTED_EXACT_RATIO
    assert quality["retrieval_required_evidence_recall"] == EXPECTED_EXACT_RATIO
    assert quality["generation_claim_evidence_coverage"] == EXPECTED_EXACT_RATIO

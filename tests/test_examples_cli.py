import json
import subprocess
import sys

import pytest

from casecrop import Event, Trace
from casecrop.cli import main
from casecrop.examples import CASES, browser_run, demo, make_trace, replay


@pytest.mark.parametrize("case,count", [("cache", 6), ("counter", 5), ("permission", 4)])
@pytest.mark.parametrize("noise", [0, 1, 30, 100])
def test_real_bugs_and_golden_controls(case, count, noise):
    r = demo(case, noise=noise, max_calls=2000)
    assert r.one_minimal and r.confirmed
    assert len(r.reduced.events) == count
    assert replay(case, r.reduced.events).signature == CASES[case]["signature"]
    assert replay(case, r.reduced.events, fixed=True).verdict == "pass"
    assert replay(case, r.original.events, fixed=True).verdict == "pass"


@pytest.mark.parametrize("bad", [{}, [], False, 0, "", None])
def test_bad_browser_trace_is_not_silently_a_demo(bad):
    with pytest.raises(ValueError):
        browser_run(json.dumps({"trace": bad}))


@pytest.mark.parametrize("case", list(CASES))
def test_browser_bridge_executes_core(case):
    report = json.loads(browser_run(json.dumps({"case": case})))
    assert report["reduced"] == demo(case).reduced.to_dict()
    assert report["fixed_outcome"]["verdict"] == "pass"


def test_cli_exports_executable_regression(tmp_path, capsys):
    out = tmp_path / "case"
    assert main(["demo", "--output", str(out), "--require-minimal"]) == 0
    assert "36 → 6" in capsys.readouterr().out
    run = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", str(out / "test_regression.py")],
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stdout + run.stderr
    before = (out / "reduced.json").read_bytes()
    assert main(["demo", "--case", "counter", "--output", str(out)]) == 2
    assert (out / "reduced.json").read_bytes() == before


def test_cli_budget_exit_and_json(capsys):
    assert main(["demo", "--max-calls", "1", "--require-minimal", "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert data["status"] == "budget_exhausted" and not data["one_minimal"]
    assert main(["demo", "--noise", "-1"]) == 2


def test_cli_command_end_to_end(tmp_path):
    path = tmp_path / "trace.json"
    Trace([Event("noise"), Event("bug")]).save(path)
    oracle = tmp_path / "oracle.py"
    oracle.write_text(
        "import json,sys\nd=json.load(open(sys.argv[1]))\n"
        "f=any(e['id']=='bug' for e in d['events'])\n"
        "print(json.dumps({'verdict':'fail','signature':'x'} if f else {'verdict':'pass'}))\n"
    )
    out = tmp_path / "out"
    assert (
        main(
            [
                "reduce",
                str(path),
                "--output",
                str(out),
                "--require-minimal",
                "--oracle",
                sys.executable,
                str(oracle),
                "{trace}",
            ]
        )
        == 0
    )
    assert Trace.load(out / "reduced.json").ids == ("bug",)
    assert not (out / "test_regression.py").exists()


@pytest.mark.parametrize("case", list(CASES))
@pytest.mark.parametrize(
    "payload",
    [
        None,
        {},
        {"op": "unknown"},
        {"op": "get", "tenant": []},
        {"op": "read", "worker": []},
        {"op": "check", "user": []},
    ],
)
def test_malformed_operations_unresolved(case, payload):
    assert replay(case, (Event("x", payload),)).verdict == "unresolved"


def test_browser_limits():
    for data in [
        {"max_calls": 0},
        {"max_calls": True},
        {"max_calls": 2001},
        {"repeats": 4},
        {"repeats": False},
        {"trace": make_trace(noise=200).to_dict()},
    ]:
        with pytest.raises(ValueError):
            browser_run(json.dumps(data))


def test_raw_browser_json_preserves_types_and_duplicate_keys():
    data = make_trace("counter", noise=0).to_dict()
    data["events"][0]["payload"]["value"] = 1.0
    with pytest.raises(ValueError, match="baseline"):
        browser_run(json.dumps({"case": "counter", "trace_json": json.dumps(data)}))
    data["events"][0]["payload"]["value"] = 9_007_199_254_740_993
    with pytest.raises(ValueError, match="safe range"):
        browser_run(json.dumps({"case": "counter", "trace_json": json.dumps(data)}))
    with pytest.raises(ValueError, match="duplicate"):
        browser_run(
            json.dumps({"trace_json": '{"schema_version":1,"schema_version":1,"events":[]}'})
        )


def test_browser_export_is_compact_and_roundtrips():
    data = make_trace("cache", noise=0).to_dict()
    value = [0] * 70_000
    for _ in range(55):
        value = [value]
    data["events"][2]["payload"]["value"] = value
    raw = json.dumps(data, separators=(",", ":"))
    assert len(raw) < 256_000
    report = json.loads(browser_run(json.dumps({"trace_json": raw})))
    assert report["fixed_outcome"]["verdict"] == "pass"
    assert Trace.from_json(report["reduced_json"]).to_dict() == report["reduced"]
    assert len(report["reduced_json"]) < 256_000


def test_unresolved_golden_control_is_reported():
    trace = Trace(
        [
            *make_trace("cache", noise=0).events,
            Event("bad-tail", {"op": "not-supported"}, pinned=True),
        ]
    )
    r = json.loads(browser_run(json.dumps({"trace_json": trace.to_json()})))
    assert r["confirmed"]
    assert r["fixed_outcome"]["verdict"] == "unresolved"
    assert not r["one_minimal"]


def test_browser_unicode_export_can_be_reimported():
    data = make_trace("cache", noise=0).to_dict()
    data["events"][2]["payload"]["value"] = "😀" * 22_000
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    report = json.loads(browser_run(json.dumps({"trace_json": raw})))
    assert report["confirmed"] and report["one_minimal"]
    assert len(report["reduced_json"].encode("utf-8")) < 256_000
    again = json.loads(browser_run(json.dumps({"trace_json": report["reduced_json"]})))
    assert again["confirmed"] and again["one_minimal"]
    assert again["reduced"] == report["reduced"]


def test_browser_checks_size_after_filling_optional_defaults():
    data = make_trace("cache", noise=0).to_dict()
    for event in data["events"]:
        for key in ("pinned", "cost"):
            event.pop(key)
    data["events"][2]["payload"]["value"] = ""
    raw = json.dumps(data, separators=(",", ":"))
    data["events"][2]["payload"]["value"] = "x" * (255_990 - len(raw))
    raw = json.dumps(data, separators=(",", ":"))
    assert len(raw.encode("utf-8")) < 256_000
    with pytest.raises(ValueError, match="normalized browser trace"):
        browser_run(json.dumps({"trace_json": raw}))


def test_browser_rejects_unpaired_unicode_surrogates():
    data = make_trace("cache", noise=0).to_dict()
    data["events"][2]["payload"]["value"] = "\ud800"
    with pytest.raises(ValueError, match="valid Unicode"):
        browser_run(json.dumps({"trace_json": json.dumps(data)}))

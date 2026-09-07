import sys
import time

import pytest

from casecrop import Event, Outcome
from casecrop.command import CommandOracle


def command(code, **kwargs):
    return CommandOracle([sys.executable, "-c", code, "{trace}"], **kwargs)


def test_protocol_and_temporary_candidate_cleanup():
    c = command(
        "import json,sys; d=json.load(open(sys.argv[1])); "
        "print(json.dumps({'verdict':'fail','signature':d['events'][0]['id']}))"
    )
    assert c((Event("bug"),)) == Outcome.fail("bug")


@pytest.mark.parametrize(
    "output",
    [
        "no json",
        "[]",
        "null",
        "{}",
        '{"verdict":"pass","extra":1}',
        '{"verdict":"pass","verdict":"fail","signature":"oops"}',
        "[" * 1100 + "0" + "]" * 1100,
        '{"verdict":"fail","signature":""}',
    ],
)
def test_malformed_protocol_is_unresolved(output):
    assert command(f"print({output!r})")(()).verdict == "unresolved"


def test_nonzero_never_means_reproduced():
    assert (
        command('import sys; print(\'{"verdict":"fail","signature":"x"}\'); sys.exit(1)')(
            ()
        ).verdict
        == "unresolved"
    )


def test_timeout_and_output_limits():
    start = time.monotonic()
    r = command("import time; time.sleep(10)", timeout=0.1)(())
    assert r.reason == "command timed out"
    assert time.monotonic() - start < 3
    r = command("print('x' * 100_000)", max_output_bytes=1024)(())
    assert r.reason == "command output limit exceeded"


@pytest.mark.parametrize(
    "argv,kwargs",
    [
        ([], {}),
        ("echo", {}),
        (["echo"], {}),
        (["echo", "{trace}"], {"timeout": 0}),
        (["echo", "{trace}"], {"timeout": float("inf")}),
        (["echo", "{trace}"], {"max_output_bytes": 0}),
    ],
)
def test_command_config(argv, kwargs):
    with pytest.raises(ValueError):
        CommandOracle(argv, **kwargs)


def test_command_uses_argv_not_shell():
    c = CommandOracle(
        [
            sys.executable,
            "-c",
            "import json,sys; print(json.dumps({'verdict':'pass' "
            "if sys.argv[2]=='$(false)' else 'unresolved'}))",
            "{trace}",
            "$(false)",
        ]
    )
    assert c(()).verdict == "pass"


def test_output_limit_uses_file_size_not_seek_position():
    code = (
        "import os; os.write(1, b' ' * 100_000); os.lseek(1, 0, 0); "
        'os.write(1, b\'{"verdict":"pass"}\')'
    )
    assert command(code, max_output_bytes=1024)(()).reason == "command output limit exceeded"

"""Run: python -m pytest examples/test_cart_regression.py"""

from pathlib import Path

from cart_oracle import replay

from casecrop import Trace, minimize


def test_recorded_cart_bug_and_fix():
    original = Trace.load(Path(__file__).with_name("cart_trace.json"))
    result = minimize(original, replay)
    assert result.one_minimal
    assert replay(result.reduced.events).signature == "cart.negative_total"
    assert replay(result.reduced.events, fixed=True).verdict == "pass"

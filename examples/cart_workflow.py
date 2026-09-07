"""Record application logs, reduce the bug, and validate the reference fix."""

from pathlib import Path

from cart_oracle import replay

from casecrop import Event, Trace, minimize

# Replace this list with your parsed JSONL log. Dependencies come from application IDs.
log = [
    {"id": "item", "op": "add", "cents": 100},
    {"id": "view-1", "op": "view"},
    {"id": "coupon-a", "op": "coupon", "code": "WELCOME", "cents": 60},
    {"id": "view-2", "op": "view"},
    {"id": "coupon-b", "op": "coupon", "code": "LOYALTY", "cents": 60},
    {"id": "view-3", "op": "view"},
]
trace = Trace(
    Event(
        row["id"],
        {k: v for k, v in row.items() if k != "id"},
        requires=("item",) if row["id"] != "item" else (),
    )
    for row in log
)
result = minimize(trace, replay, oracle_id="cart.negative-total.v1")
assert result.one_minimal
assert replay(result.reduced.events).signature == "cart.negative_total"
assert replay(result.reduced.events, fixed=True).verdict == "pass"
print(f"{len(trace.events)} -> {len(result.reduced.events)} events; fixed cart passes")
# Write only when explicitly run as a script. The CLI chooses its own output directory.
if __name__ == "__main__":
    trace.save(Path(__file__).with_name("cart_trace.json"))

"""JSON command protocol adapter. Execute with a candidate path as argv[1]."""

import json
import sys

from cart_app import Cart

from casecrop import Outcome, Trace


def replay(events, *, fixed=False):
    cart = Cart(fixed=fixed)  # Fresh application for every experiment.
    for event in events:
        item = event.payload
        if not isinstance(item, dict):
            return Outcome.unresolved("invalid cart operation")
        try:
            if item["op"] == "add":
                cart.add(item["cents"])
            elif item["op"] == "coupon":
                cart.coupon(item["code"], item["cents"])
            elif item["op"] == "view":
                cart.total()
            else:
                return Outcome.unresolved("unknown operation")
        except (KeyError, ValueError, TypeError):
            return Outcome.unresolved("invalid cart operation")
        if cart.total() < 0:
            return Outcome.fail("cart.negative_total")
    return Outcome.pass_()


if __name__ == "__main__":
    print(json.dumps(replay(Trace.load(sys.argv[1]).events).to_dict()))

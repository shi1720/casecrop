"""A tiny application owned by the integrator, independent of CaseCrop."""


class Cart:
    def __init__(self, *, fixed: bool = False):
        self.subtotal = 0
        self.discounts = 0
        self.coupons = set()
        self.fixed = fixed

    def add(self, cents: int):
        if type(cents) is not int or cents <= 0:
            raise ValueError("item price must be positive cents")
        self.subtotal += cents

    def coupon(self, code: str, cents: int):
        if not isinstance(code, str) or type(cents) is not int or cents <= 0:
            raise ValueError("invalid coupon")
        if code not in self.coupons:
            self.coupons.add(code)
            self.discounts += cents

    def total(self):
        raw = self.subtotal - self.discounts
        return max(0, raw) if self.fixed else raw

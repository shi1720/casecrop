"""Reduce recorded failures into dependency-valid regression cases."""

from .model import Event, Outcome, Trace
from .reducer import BaselineError, Result, Trial, Witness, minimize

__version__ = "0.1.1"
__all__ = ["BaselineError", "Event", "Outcome", "Result", "Trace", "Trial", "Witness", "minimize"]

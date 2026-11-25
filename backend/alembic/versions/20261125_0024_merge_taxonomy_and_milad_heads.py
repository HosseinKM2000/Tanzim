"""Merge the canonical-taxonomy and Milad logging/payment migration heads.

Revision ID: 20261125_0024
Revises: 20261120_0023, 20261123_0020
Create Date: 2026-11-25
"""

from collections.abc import Sequence


revision = "20261125_0024"
down_revision: tuple[str, str] = ("20261120_0023", "20261123_0020")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join the two already-applied schema branches without changing data."""


def downgrade() -> None:
    """Return to the two independent heads without changing data."""

"""
asset/utils/asset_import.py
-----------------------------
Helpers shared by the Asset CSV import pipeline.

Provides:
  - ``TEMPLATE_HEADERS``  — ordered column header list for the template CSV.
  - ``parse_date()``      — parse YYYY-MM-DD or DD/MM/YYYY strings.
  - ``int_or_none()``     — parse optional integer fields with a clear error message.
  - ``ModelLookupCache``  — lazily caches AssetModel and AssetState DB lookups.
"""

from __future__ import annotations

import datetime
import logging

logger = logging.getLogger(__name__)

# Ordered list of column names in the import/template CSV.
TEMPLATE_HEADERS = [
    'Hostname',
    'Modello',
    'Vendor',
    'Stato',
    'Seriale',
    'SAP ID',
    'Order ID',
    'Alimentatori',
    'Assorbimento (W)',
    'Note',
    'Scad. garanzia',
    'Scad. supporto',
    'Data acquisto',
    'Data dismissione',
]

# Required column names (subset of TEMPLATE_HEADERS).
REQUIRED_COLUMNS = frozenset(
    {'Hostname', 'Modello', 'Vendor', 'Stato', 'Seriale'})


def parse_date(value: str) -> datetime.date | None:
    """Parse a date string in ``YYYY-MM-DD`` or ``DD/MM/YYYY`` format.

    Returns ``None`` for blank input.
    Raises :class:`ValueError` for non-empty strings that cannot be parsed.
    """
    s = (value or '').strip()
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(
        f"Formato data non riconosciuto: '{s}' (usa YYYY-MM-DD o DD/MM/YYYY)"
    )


def int_or_none(value: str, field_name: str) -> int | None:
    """Parse an optional integer field.

    Returns ``None`` for blank input.
    Raises :class:`ValueError` with a user-friendly message for invalid values.
    """
    s = (value or '').strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        raise ValueError(
            f"'{field_name}' deve essere un intero, valore ricevuto: '{s}'"
        )


class ModelLookupCache:
    """Per-request cache for ``AssetModel`` and ``AssetState`` DB lookups.

    Avoids redundant queries when the same vendor/model or state name
    appears on multiple rows of the same import batch.
    """

    def __init__(self) -> None:
        self._models: dict[tuple[str, str], object] = {}
        self._states: dict[str, object] = {}

    def get_model(self, vendor_name: str, model_name: str):
        """Return the matching ``AssetModel`` or ``None``."""
        from catalog.models import AssetModel

        key = (vendor_name.strip().lower(), model_name.strip().lower())
        if key not in self._models:
            try:
                self._models[key] = AssetModel.objects.select_related(
                    'vendor'
                ).get(
                    name__iexact=model_name.strip(),
                    vendor__name__iexact=vendor_name.strip(),
                )
            except AssetModel.DoesNotExist:
                self._models[key] = None
            except AssetModel.MultipleObjectsReturned:
                self._models[key] = AssetModel.objects.filter(
                    name__iexact=model_name.strip(),
                    vendor__name__iexact=vendor_name.strip(),
                ).first()
        return self._models[key]

    def get_state(self, state_name: str):
        """Return the matching ``AssetState`` or ``None``."""
        from asset.models.AssetState import AssetState

        key = state_name.strip().lower()
        if key not in self._states:
            try:
                self._states[key] = AssetState.objects.get(
                    name__iexact=state_name.strip()
                )
            except AssetState.DoesNotExist:
                self._states[key] = None
        return self._states[key]

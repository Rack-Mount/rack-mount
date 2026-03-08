"""
csv_sanitize.py

Shared utility for preventing CSV / formula injection.
Both AssetExportView (xlsx) and AssetImportCsvView use the same logic.
"""

# Characters that trigger formula execution in spreadsheet apps (CSV injection).
FORMULA_PREFIXES: tuple[str, ...] = ('=', '+', '-', '@', '\t', '\r')


def sanitize_cell(value: str) -> str:
    """Prevent formula injection by prefixing dangerous leading characters."""
    if value and value[0] in FORMULA_PREFIXES:
        return "'" + value
    return value

"""
AssetImportCsvView.py

GET  /asset/import-csv  → Download a template CSV with column headers.
POST /asset/import-csv  → Import assets from a CSV file.

CSV column headers (matching the Excel export):
  Hostname*, Modello*, Vendor*, Stato*, Seriale*,
  SAP ID, Order ID, Alimentatori, Assorbimento (W), Note,
  Scad. garanzia, Scad. supporto, Data acquisto, Data dismissione

  (* = required)

Dates format: YYYY-MM-DD or DD/MM/YYYY

For each row the serial_number (Seriale) is the unique key:
  - If it already exists → the row is skipped (reported as error "duplicate").
  - If it doesn't exist  → a new asset is created.

Response JSON (POST):
  {
    "created": <int>,
    "errors":  [ { "row": <int>, "message": <str> }, ... ]
  }
"""

from __future__ import annotations
from asset.utils.csv_sanitize import sanitize_cell as _sanitize_cell
import datetime
from asset.models.AssetState import AssetState
from catalog.models import AssetModel
from asset.models import Asset
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.http import HttpResponse
from accounts.permissions import ImportAssetsPermission
from accounts.throttles import AssetImportThrottle as _AssetImportThrottle

import csv
import io
import logging

logger = logging.getLogger(__name__)

# Max 50 MB CSV file
_MAX_CSV_BYTES = 50 * 1024 * 1024


# ─────── CSV column definitions ───────────────────────────────────────────────
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


def _parse_date(value: str) -> datetime.date | None:
    """Parse a date string in YYYY-MM-DD or DD/MM/YYYY format."""
    s = (value or '').strip()
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(
        f"Formato data non riconosciuto: '{s}' (usa YYYY-MM-DD o DD/MM/YYYY)")


def _int_or_none(value: str, field_name: str) -> int | None:
    s = (value or '').strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        raise ValueError(
            f"'{field_name}' deve essere un intero, valore ricevuto: '{s}'")


# ─────── View ─────────────────────────────────────────────────────────────────

class AssetImportCsvView(APIView):
    permission_classes = [IsAuthenticated, ImportAssetsPermission]
    parser_classes = [MultiPartParser]
    throttle_classes = [_AssetImportThrottle]

    @extend_schema(
        summary='Download template CSV for asset import',
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description='CSV template file',
            ),
        },
    )
    def get(self, request):
        """Return a blank CSV template with the correct headers and one example row."""
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(TEMPLATE_HEADERS)
        # Example row
        writer.writerow([
            'srv-prod-01',   # Hostname
            'PowerEdge R750',  # Modello
            'Dell',          # Vendor
            'Attivo',        # Stato
            'SN0001',        # Seriale
            '',              # SAP ID
            '',              # Order ID
            '2',             # Alimentatori
            '800',           # Assorbimento (W)
            '',              # Note
            '2027-12-31',    # Scad. garanzia
            '2028-12-31',    # Scad. supporto
            '2024-01-15',    # Data acquisto
            '',              # Data dismissione
        ])
        response = HttpResponse(
            buf.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="asset_import_template.csv"'
        return response

    @extend_schema(
        summary='Import assets from a CSV file',
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'file': {'type': 'string', 'format': 'binary'},
                },
                'required': ['file'],
            }
        },
        responses={
            200: OpenApiResponse(description='Import result with created count and per-row errors'),
            400: OpenApiResponse(description='No file or invalid CSV'),
        },
    )
    def post(self, request):
        """Process a CSV file and create Asset records."""
        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'detail': 'Nessun file caricato.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Size guard ─────────────────────────────────────────────────────────
        if uploaded.size > _MAX_CSV_BYTES:
            return Response(
                {'detail': f'Il file supera il limite di {_MAX_CSV_BYTES // 1024 // 1024} MB.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        # ── Decode ─────────────────────────────────────────────────────────────
        try:
            raw = uploaded.read().decode('utf-8-sig')  # strip BOM if present
        except UnicodeDecodeError:
            try:
                uploaded.seek(0)
                raw = uploaded.read().decode('latin-1')
            except Exception:
                return Response(
                    {'detail': 'Impossibile decodificare il file. Usa UTF-8.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Auto-detect delimiter (comma vs semicolon — Excel Italian locale) ──
        sample = raw[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
        except csv.Error:
            dialect = csv.excel  # fallback to comma
        reader = csv.DictReader(io.StringIO(raw), dialect=dialect)

        # ── Validate header ────────────────────────────────────────────────────
        if not reader.fieldnames:
            return Response({'detail': 'Il file CSV è vuoto.'}, status=status.HTTP_400_BAD_REQUEST)

        required_cols = {'Hostname', 'Modello', 'Vendor', 'Stato', 'Seriale'}
        actual_cols = set(reader.fieldnames)
        missing = required_cols - actual_cols
        if missing:
            return Response(
                {'detail': f'Colonne obbligatorie mancanti: {", ".join(sorted(missing))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Cache lookups ──────────────────────────────────────────────────────
        model_cache: dict[tuple[str, str], AssetModel | None] = {}
        state_cache: dict[str, AssetState | None] = {}

        def get_model(vendor_name: str, model_name: str) -> AssetModel | None:
            key = (vendor_name.strip().lower(), model_name.strip().lower())
            if key not in model_cache:
                try:
                    model_cache[key] = AssetModel.objects.select_related('vendor').get(
                        name__iexact=model_name.strip(),
                        vendor__name__iexact=vendor_name.strip(),
                    )
                except AssetModel.DoesNotExist:
                    model_cache[key] = None
                except AssetModel.MultipleObjectsReturned:
                    model_cache[key] = AssetModel.objects.filter(
                        name__iexact=model_name.strip(),
                        vendor__name__iexact=vendor_name.strip(),
                    ).first()
            return model_cache[key]

        def get_state(state_name: str) -> AssetState | None:
            key = state_name.strip().lower()
            if key not in state_cache:
                try:
                    state_cache[key] = AssetState.objects.get(
                        name__iexact=state_name.strip())
                except AssetState.DoesNotExist:
                    state_cache[key] = None
            return state_cache[key]

        # ── Process rows ───────────────────────────────────────────────────────
        created = 0
        rows: list[dict] = []
        errors: list[dict] = []

        for row_num, row in enumerate(reader, start=2):  # row 1 = header
            try:
                hostname = _sanitize_cell((row.get('Hostname') or '').strip())
                model_name = (row.get('Modello') or '').strip()
                vendor_name = (row.get('Vendor') or '').strip()
                state_name = (row.get('Stato') or '').strip()
                serial_number = _sanitize_cell(
                    (row.get('Seriale') or '').strip())

                # ── Required fields ────────────────────────────────────────────
                missing_fields = []
                if not hostname:
                    missing_fields.append('Hostname')
                if not model_name:
                    missing_fields.append('Modello')
                if not vendor_name:
                    missing_fields.append('Vendor')
                if not state_name:
                    missing_fields.append('Stato')
                if not serial_number:
                    missing_fields.append('Seriale')
                if missing_fields:
                    raise ValueError(
                        f'Campi obbligatori mancanti: {", ".join(missing_fields)}')

                # ── Duplicate serial check ─────────────────────────────────────
                if Asset.objects.filter(serial_number=serial_number).exists():
                    raise ValueError(
                        f"Numero seriale già esistente: '{serial_number}'")

                # ── Lookups ────────────────────────────────────────────────────
                model_obj = get_model(vendor_name, model_name)
                if model_obj is None:
                    raise ValueError(
                        f"Apparato non trovato: '{model_name}' (Vendor: '{vendor_name}')"
                    )

                state_obj = get_state(state_name)
                if state_obj is None:
                    raise ValueError(f"Stato non trovato: '{state_name}'")

                # ── Optional fields ────────────────────────────────────────────
                sap_id = _sanitize_cell((row.get('SAP ID') or '').strip())
                order_id = _sanitize_cell((row.get('Order ID') or '').strip())
                note = _sanitize_cell((row.get('Note') or '').strip())
                power_supplies = _int_or_none(
                    row.get('Alimentatori', ''), 'Alimentatori')
                power_watt = _int_or_none(
                    row.get('Assorbimento (W)', ''), 'Assorbimento (W)')
                warranty_exp = _parse_date(row.get('Scad. garanzia', ''))
                support_exp = _parse_date(row.get('Scad. supporto', ''))
                purchase_date = _parse_date(row.get('Data acquisto', ''))
                decommission_date = _parse_date(
                    row.get('Data dismissione', ''))

                # ── Create ─────────────────────────────────────────────────────
                Asset.objects.create(
                    hostname=hostname,
                    model=model_obj,
                    state=state_obj,
                    serial_number=serial_number,
                    sap_id=sap_id,
                    order_id=order_id,
                    note=note,
                    power_supplies=power_supplies if power_supplies is not None else 2,
                    power_consumption_watt=power_watt if power_watt is not None else 0,
                    warranty_expiration=warranty_exp,
                    support_expiration=support_exp,
                    purchase_date=purchase_date,
                    decommissioned_date=decommission_date,
                )
                created += 1
                rows.append({'row': row_num, 'hostname': hostname,
                            'serial_number': serial_number})

            except ValueError as exc:
                logger.warning(
                    "Errore di validazione durante l'import CSV alla riga %s: %s",
                    row_num,
                    exc,
                )
                errors.append(
                    {
                        'row': row_num,
                        'message': 'Valore non valido nei dati della riga.',
                    }
                )
            except Exception as exc:
                logger.exception(
                    "Errore imprevisto durante l'import CSV alla riga %s",
                    row_num,
                )
                errors.append(
                    {
                        'row': row_num,
                        'message': 'Errore imprevisto durante l\'importazione della riga.',
                    }
                )

        return Response({'created': created, 'rows': rows, 'errors': errors}, status=status.HTTP_200_OK)

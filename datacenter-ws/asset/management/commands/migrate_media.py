"""
Management command to migrate existing media files to public/private directories.

Moves training-related images to private/ and other images to public/.
"""
import os
import shutil
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings


class Command(BaseCommand):
    help = 'Migrate media files to public/private subdirectories'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without actually moving files'
        )

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        public_subdir = getattr(settings, 'PUBLIC_MEDIA_SUBDIR', 'public')
        private_subdir = getattr(settings, 'PRIVATE_MEDIA_SUBDIR', 'private')
        dry_run = options.get('dry_run', False)

        public_dir = media_root / public_subdir
        private_dir = media_root / private_subdir

        mode_str = "[DRY RUN] " if dry_run else ""

        self.stdout.write(self.style.SUCCESS(
            f'{mode_str}Starting media file migration...\n'
        ))

        # Training-related patterns that should go to private/
        training_patterns = [
            'training',
            'yolo',
            'model',
            'annotation',
            'correction',
        ]

        migrated_public = 0
        migrated_private = 0
        skipped = 0

        # Walk through all files in MEDIA_ROOT
        for root, dirs, files in os.walk(str(media_root)):
            # Skip if already in public/ or private/ subdirectory
            rel_root = os.path.relpath(root, str(media_root))
            if rel_root.startswith(public_subdir) or rel_root.startswith(private_subdir):
                continue

            for filename in files:
                source_path = Path(root) / filename
                rel_path = source_path.relative_to(media_root)

                # Determine if this is a training file
                is_training = any(
                    pattern in str(rel_path).lower()
                    for pattern in training_patterns
                )

                if is_training:
                    dest_subdir = private_dir
                    dest_rel = Path(private_subdir) / rel_path
                    action_str = "→ private"
                    migrated_private += 1
                else:
                    dest_subdir = public_dir
                    dest_rel = Path(public_subdir) / rel_path
                    action_str = "→ public"
                    migrated_public += 1

                dest_path = media_root / dest_rel

                self.stdout.write(f'{mode_str}{rel_path} {action_str}')

                if not dry_run:
                    # Create destination directory
                    dest_path.parent.mkdir(parents=True, exist_ok=True)

                    # Move file
                    try:
                        shutil.move(str(source_path), str(dest_path))
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'  ERROR: {e}')
                        )
                        skipped += 1
                        migrated_private -= 1 if is_training else migrated_public -= 1

        # Summary
        summary = (
            f'\n{mode_str}Migration complete:\n'
            f'  • Public dir: {migrated_public} files\n'
            f'  • Private dir: {migrated_private} files\n'
            f'  • Skipped: {skipped} files'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))

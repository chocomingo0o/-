#!/usr/bin/env python3
"""Remove the password from an encrypted PDF and write an unlocked copy.

Usage:
    python scripts/remove_pdf_password.py protected.pdf
    python scripts/remove_pdf_password.py protected.pdf -o unlocked.pdf -p secret

If --password is omitted the password is read from the PDF_PASSWORD environment
variable, or prompted for interactively (without echoing).
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.errors import DependencyError, PdfReadError

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_WRONG_PASSWORD = 2
EXIT_NOT_ENCRYPTED = 3


class PasswordRemovalError(Exception):
    """Raised when the PDF cannot be decrypted or written."""

    def __init__(self, message: str, exit_code: int = EXIT_ERROR):
        super().__init__(message)
        self.exit_code = exit_code


def remove_pdf_password(
    input_pdf_path: str | Path,
    output_pdf_path: str | Path,
    password: str,
    overwrite: bool = False,
) -> Path:
    """Write an unencrypted copy of ``input_pdf_path`` to ``output_pdf_path``.

    Returns the path that was written. Raises ``PasswordRemovalError`` if the
    input is missing, is not encrypted, the password is wrong, or the output
    path is not safe to write.
    """
    input_path = Path(input_pdf_path)
    output_path = Path(output_pdf_path)

    if not input_path.is_file():
        raise PasswordRemovalError(f"Input file not found: {input_path}")

    # Writing over the source would destroy the only copy if anything fails.
    if output_path.resolve() == input_path.resolve():
        raise PasswordRemovalError("Output path must differ from the input path.")

    if output_path.exists() and not overwrite:
        raise PasswordRemovalError(
            f"Output file already exists: {output_path} (use --force to overwrite)"
        )

    try:
        reader = PdfReader(input_path)
    except PdfReadError as exc:
        raise PasswordRemovalError(f"Could not read {input_path}: {exc}") from exc

    if not reader.is_encrypted:
        raise PasswordRemovalError(
            f"{input_path} is not encrypted; nothing to remove.", EXIT_NOT_ENCRYPTED
        )

    try:
        # decrypt() returns PasswordType.NOT_DECRYPTED (falsy) on a bad password
        # instead of raising, so the result has to be checked explicitly.
        if not reader.decrypt(password):
            raise PasswordRemovalError(
                "Incorrect password for " + str(input_path), EXIT_WRONG_PASSWORD
            )
    except DependencyError as exc:
        raise PasswordRemovalError(
            f"Missing crypto support for this PDF's encryption: {exc}. "
            "Install it with: pip install 'pypdf[crypto]'"
        ) from exc

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    if reader.metadata:
        writer.add_metadata(reader.metadata)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(output_path, "wb") as f:
            writer.write(f)
    except OSError as exc:
        raise PasswordRemovalError(f"Could not write {output_path}: {exc}") from exc

    return output_path


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_unlocked.pdf")


def resolve_password(cli_password: str | None) -> str:
    if cli_password is not None:
        return cli_password
    env_password = os.environ.get("PDF_PASSWORD")
    if env_password is not None:
        return env_password
    return getpass.getpass("PDF password: ")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove the password from an encrypted PDF."
    )
    parser.add_argument("input", type=Path, help="path to the encrypted PDF")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="path for the unlocked PDF (default: <input>_unlocked.pdf)",
    )
    parser.add_argument(
        "-p",
        "--password",
        help="PDF password (falls back to $PDF_PASSWORD, then an interactive prompt)",
    )
    parser.add_argument(
        "-f", "--force", action="store_true", help="overwrite the output file if it exists"
    )
    args = parser.parse_args(argv)

    output = args.output or default_output_path(args.input)

    try:
        written = remove_pdf_password(
            args.input, output, resolve_password(args.password), overwrite=args.force
        )
    except PasswordRemovalError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return exc.exit_code

    print(f"Password removed: {written}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

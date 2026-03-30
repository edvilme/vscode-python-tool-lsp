# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""IO abstractions for LSP communication (stdio, pipe, socket)."""

from __future__ import annotations

import io
from typing import Optional

from vscode_python_tool_lsp.execution import CustomIO, redirect_io, substitute_attr

__all__ = [
    "CustomIO",
    "redirect_io",
    "substitute_attr",
]

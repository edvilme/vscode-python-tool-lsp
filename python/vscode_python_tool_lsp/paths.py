# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Path detection utilities: stdlib, site-packages, extensions dir."""

from __future__ import annotations

import fnmatch
import os
import pathlib
import site
import sysconfig
from typing import List, Optional

from vscode_python_tool_lsp.execution import as_list


def _get_sys_config_paths() -> List[str]:
    """Returns paths from sysconfig.get_paths()."""
    return [
        path
        for group, path in sysconfig.get_paths().items()
        if group not in ["data", "platdata", "scripts"]
    ]


def _get_extensions_dir() -> List[str]:
    """This is the extensions folder under ~/.vscode or ~/.vscode-server."""
    path = pathlib.Path(__file__).parent.parent.parent.parent
    if path.name == "extensions":
        return [os.fspath(path)]
    return []


_stdlib_paths = set(
    str(pathlib.Path(p).resolve())
    for p in (
        as_list(site.getsitepackages())
        + as_list(site.getusersitepackages())
        + _get_sys_config_paths()
        + _get_extensions_dir()
    )
)


def is_stdlib_file(file_path: str) -> bool:
    """Return True if the file belongs to the standard library."""
    normalized_path = str(pathlib.Path(file_path).resolve())
    return any(normalized_path.startswith(path) for path in _stdlib_paths)


def normalize_path(file_path: str, resolve_symlinks: bool = True) -> str:
    """Returns normalized path."""
    if resolve_symlinks:
        return str(pathlib.Path(file_path).resolve())
    return str(pathlib.Path(file_path).absolute())


def is_match(
    patterns: List[str],
    file_path: str,
    workspace_root: Optional[str] = None,
) -> bool:
    """Check if a file path matches any of the given glob patterns."""
    for pattern in patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
        if fnmatch.fnmatch(os.path.basename(file_path), pattern):
            return True
        if workspace_root:
            try:
                rel_path = os.path.relpath(file_path, workspace_root)
                if fnmatch.fnmatch(rel_path, pattern):
                    return True
            except ValueError:
                pass
    return False

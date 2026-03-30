# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Settings resolution and CWD management for LSP tool servers."""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List, Optional


def update_sys_path(path_to_add: str, strategy: str) -> None:
    """Add given path to `sys.path`."""
    if path_to_add not in sys.path and os.path.isdir(path_to_add):
        if strategy == "useBundled":
            sys.path.insert(0, path_to_add)
        else:
            sys.path.append(path_to_add)


def update_environ_path() -> None:
    """Update PATH environment variable with the 'scripts' directory."""
    import sysconfig

    scripts = sysconfig.get_path("scripts")
    paths_variants = ["Path", "PATH"]

    for var_name in paths_variants:
        if var_name in os.environ:
            paths = os.environ[var_name].split(os.pathsep)
            if scripts not in paths:
                paths.insert(0, scripts)
                os.environ[var_name] = os.pathsep.join(paths)
                break


def get_cwd(
    settings: Dict[str, Any],
    document_path: Optional[str] = None,
) -> str:
    """Resolve the current working directory from settings and document context."""
    cwd = settings.get("cwd", settings.get("workspaceFS", ""))
    workspace_fs = settings.get("workspaceFS", "")

    if document_path:
        substitutions = {
            "${file}": document_path,
            "${fileBasename}": os.path.basename(document_path),
            "${fileDirname}": os.path.dirname(document_path),
            "${fileExtname}": os.path.splitext(document_path)[1],
            "${fileBasenameNoExtension}": os.path.splitext(os.path.basename(document_path))[0],
        }
        if workspace_fs:
            rel = os.path.relpath(document_path, workspace_fs)
            substitutions["${relativeFile}"] = rel
            substitutions["${relativeFileDirname}"] = os.path.dirname(rel)

        for token, value in substitutions.items():
            cwd = cwd.replace(token, value)
    else:
        if "${file" in cwd or "${relativeFile" in cwd:
            cwd = workspace_fs

    return cwd if cwd else workspace_fs

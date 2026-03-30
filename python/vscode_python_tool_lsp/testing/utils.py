# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Test utility functions for LSP test sessions."""

from __future__ import annotations

import os
import pathlib
from typing import Dict, List, Optional


def get_server_test_defaults(server_script: str) -> Dict:
    """Returns default parameters needed to start a test LSP session."""
    return {
        "server_script": server_script,
        "cwd": str(pathlib.Path(server_script).parent.parent.parent),
    }


def get_initialization_options(
    workspace_path: str,
    settings: Optional[Dict] = None,
    global_settings: Optional[Dict] = None,
) -> Dict:
    """Creates initialization options for the LSP server."""
    workspace_uri = pathlib.Path(workspace_path).as_uri() if hasattr(pathlib.Path, "as_uri") else f"file:///{workspace_path.replace(os.sep, '/')}"

    default_settings = {
        "cwd": workspace_path,
        "workspace": str(workspace_uri),
        "path": [],
        "interpreter": [],
        "args": [],
        "importStrategy": "useBundled",
        "showNotifications": "off",
    }

    if settings:
        default_settings.update(settings)

    return {
        "settings": [default_settings],
        "globalSettings": global_settings or default_settings,
    }

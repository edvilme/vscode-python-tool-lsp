# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Default initialize parameters for LSP test sessions."""

from typing import Any, Dict


def vscode_initialize_defaults() -> Dict[str, Any]:
    """Returns the default VS Code initialize parameters for testing."""
    return {
        "processId": 1234,
        "rootPath": None,
        "rootUri": None,
        "capabilities": {
            "workspace": {
                "applyEdit": True,
                "workspaceEdit": {
                    "documentChanges": True,
                    "resourceOperations": ["create", "rename", "delete"],
                    "failureHandling": "textOnlyTransactional",
                },
                "didChangeConfiguration": {"dynamicRegistration": True},
                "didChangeWatchedFiles": {"dynamicRegistration": True},
                "symbol": {
                    "dynamicRegistration": True,
                    "symbolKind": {
                        "valueSet": list(range(1, 27)),
                    },
                },
                "executeCommand": {"dynamicRegistration": True},
                "configuration": True,
                "workspaceFolders": True,
            },
            "textDocument": {
                "publishDiagnostics": {
                    "relatedInformation": True,
                    "versionSupport": False,
                    "tagSupport": {"valueSet": [1, 2]},
                },
                "synchronization": {
                    "dynamicRegistration": True,
                    "willSave": True,
                    "willSaveWaitUntil": True,
                    "didSave": True,
                },
                "completion": {
                    "dynamicRegistration": True,
                    "contextSupport": True,
                    "completionItem": {
                        "snippetSupport": True,
                        "commitCharactersSupport": True,
                        "documentationFormat": ["markdown", "plaintext"],
                        "deprecatedSupport": True,
                        "preselectSupport": True,
                    },
                    "completionItemKind": {
                        "valueSet": list(range(1, 26)),
                    },
                },
                "hover": {
                    "dynamicRegistration": True,
                    "contentFormat": ["markdown", "plaintext"],
                },
                "signatureHelp": {
                    "dynamicRegistration": True,
                    "signatureInformation": {
                        "documentationFormat": ["markdown", "plaintext"],
                    },
                },
                "definition": {"dynamicRegistration": True},
                "references": {"dynamicRegistration": True},
                "documentHighlight": {"dynamicRegistration": True},
                "documentSymbol": {
                    "dynamicRegistration": True,
                    "symbolKind": {
                        "valueSet": list(range(1, 27)),
                    },
                },
                "codeAction": {
                    "dynamicRegistration": True,
                    "codeActionLiteralSupport": {
                        "codeActionKind": {
                            "valueSet": [
                                "",
                                "quickfix",
                                "refactor",
                                "refactor.extract",
                                "refactor.inline",
                                "refactor.rewrite",
                                "source",
                                "source.organizeImports",
                            ],
                        },
                    },
                },
                "codeLens": {"dynamicRegistration": True},
                "formatting": {"dynamicRegistration": True},
                "rangeFormatting": {"dynamicRegistration": True},
                "onTypeFormatting": {"dynamicRegistration": True},
                "rename": {"dynamicRegistration": True},
                "documentLink": {"dynamicRegistration": True},
                "typeDefinition": {"dynamicRegistration": True},
                "implementation": {"dynamicRegistration": True},
                "colorProvider": {"dynamicRegistration": True},
                "foldingRange": {
                    "dynamicRegistration": True,
                    "rangeLimit": 5000,
                    "lineFoldingOnly": True,
                },
            },
        },
        "trace": "off",
        "workspaceFolders": None,
    }

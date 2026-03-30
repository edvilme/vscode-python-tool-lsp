# vscode-python-tool-lsp

Shared packages for building VS Code Python tool extensions (linters, formatters, type checkers).

Provides both a **TypeScript npm package** for the VS Code extension client and a **Python pip package** for the LSP server, enabling ~75-85% code reduction when building Python tool extensions.

## Packages

| Package | Language | Install | Purpose |
|---------|----------|---------|---------|
| `vscode-python-tool-lsp` | TypeScript | `npm install vscode-python-tool-lsp` | VS Code extension client: activation, settings, server lifecycle, Python env detection |
| `vscode-python-tool-lsp` | Python | `pip install vscode-python-tool-lsp` | LSP server framework: parameterized server, execution engine, test utilities |

## Used By

- [vscode-black-formatter](https://github.com/microsoft/vscode-black-formatter)
- [vscode-flake8](https://github.com/microsoft/vscode-flake8)
- [vscode-isort](https://github.com/microsoft/vscode-isort)
- [vscode-mypy](https://github.com/microsoft/vscode-mypy)
- [vscode-pylint](https://github.com/microsoft/vscode-pylint)

## Quick Start

### TypeScript (Extension Client)

```typescript
// extension.ts
import { activateToolExtension, deactivateToolExtension } from 'vscode-python-tool-lsp';
import { toolConfig } from './toolConfig';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await activateToolExtension(context, toolConfig);
}

export async function deactivate(): Promise<void> {
    await deactivateToolExtension();
}
```

### Python (LSP Server)

```python
# lsp_server.py
from vscode_python_tool_lsp import LSPToolServer, ToolServerConfig

config = ToolServerConfig(
    tool_module="my_tool",
    tool_display="My Tool",
    is_formatter=False,
    supports_notebook=True,
    parse_output=my_parse_function,
    # ... see docs for full config
)

server = LSPToolServer(config)
server.start()
```

## Development

```bash
# TypeScript package
cd typescript
npm install
npm run build
npm test

# Python package
cd python
pip install -e ".[dev]"
pytest
```

## License

MIT License - See [LICENSE](LICENSE) for details.

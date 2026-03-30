// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable, workspace } from 'vscode';
import { traceLog } from './logging';

/**
 * Creates file system watchers for tool-specific configuration files.
 * When any watched file changes, the callback is invoked to trigger a server restart.
 */
export function createConfigFileWatchers(
    configFiles: string[],
    toolDisplayName: string,
    onConfigChanged: () => Promise<void>,
): Disposable[] {
    return configFiles.map((pattern) => {
        const watcher = workspace.createFileSystemWatcher(`**/${pattern}`);
        const changeDisposable = watcher.onDidChange(async () => {
            traceLog(`${toolDisplayName} config file changed: ${pattern}`);
            await onConfigChanged();
        });
        const createDisposable = watcher.onDidCreate(async () => {
            traceLog(`${toolDisplayName} config file created: ${pattern}`);
            await onConfigChanged();
        });
        const deleteDisposable = watcher.onDidDelete(async () => {
            traceLog(`${toolDisplayName} config file deleted: ${pattern}`);
            await onConfigChanged();
        });
        return Disposable.from(watcher, changeDisposable, createDisposable, deleteDisposable);
    });
}

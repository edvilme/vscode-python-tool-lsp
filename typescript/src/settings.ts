// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ConfigurationChangeEvent, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { getInterpreterDetails } from './python';
import { getConfiguration, getWorkspaceFolders } from './vscodeapi';
import { traceError, traceInfo, traceLog, traceWarn } from './logging';
import { getInterpreterFromSetting } from './utilities';

export interface ISettings {
    cwd: string;
    workspace: string;
    args: string[];
    path: string[];
    interpreter: string[];
    importStrategy: string;
    showNotifications: string;
    [key: string]: unknown;
}

export function getExtensionSettings(
    namespace: string,
    includeInterpreter?: boolean,
): Promise<ISettings[]> {
    return Promise.all(
        getWorkspaceFolders().map((w) => getWorkspaceSettings(namespace, w, includeInterpreter)),
    );
}

export function resolveVariables(
    value: string[],
    key: string,
    namespace: string,
    workspace?: WorkspaceFolder,
    interpreter?: string[],
    env?: NodeJS.ProcessEnv,
): string[] {
    for (const v of value) {
        if (typeof v !== 'string') {
            traceError(`Value [${v}] must be "string" for \`${namespace}.${key}\`: ${value}`);
            throw new Error(`Value [${v}] must be "string" for \`${namespace}.${key}\`: ${value}`);
        }
        if (v.startsWith('--') && v.includes(' ')) {
            traceError(
                `Settings should be in the form ["--option=value"] or ["--option", "value"] but not ["--option value"]`,
            );
        }
    }

    const substitutions = new Map<string, string>();
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home) {
        substitutions.set('${userHome}', home);
    }
    if (workspace) {
        substitutions.set('${workspaceFolder}', workspace.uri.fsPath);
    }
    substitutions.set('${cwd}', process.cwd());
    getWorkspaceFolders().forEach((w) => {
        substitutions.set('${workspaceFolder:' + w.name + '}', w.uri.fsPath);
    });

    env = env || process.env;
    if (env) {
        for (const [envKey, envValue] of Object.entries(env)) {
            if (envValue) {
                substitutions.set('${env:' + envKey + '}', envValue);
            }
        }
    }

    const modifiedValue = [];
    for (const v of value) {
        if (interpreter && v === '${interpreter}') {
            modifiedValue.push(...interpreter);
        } else {
            modifiedValue.push(v);
        }
    }

    return modifiedValue.map((s) => {
        for (const [subKey, subValue] of substitutions) {
            s = s.replace(subKey, subValue);
        }
        return s;
    });
}

function getCwd(
    config: WorkspaceConfiguration,
    workspace: WorkspaceFolder,
    namespace: string,
): string {
    const cwd = config.get<string>('cwd', workspace.uri.fsPath);
    return resolveVariables([cwd], 'cwd', namespace, workspace)[0];
}

export async function getWorkspaceSettings(
    namespace: string,
    workspace: WorkspaceFolder,
    includeInterpreter?: boolean,
): Promise<ISettings> {
    const config = getConfiguration(namespace, workspace.uri);

    let interpreter: string[] = [];
    if (includeInterpreter) {
        interpreter = getInterpreterFromSetting(namespace, workspace) ?? [];
        if (interpreter.length === 0) {
            traceLog(`No interpreter found from setting ${namespace}.interpreter`);
            traceLog(
                `Getting interpreter from ms-python.python extension for workspace ${workspace.uri.fsPath}`,
            );
            interpreter = (await getInterpreterDetails(workspace.uri)).path ?? [];
            if (interpreter.length > 0) {
                traceLog(
                    `Interpreter from ms-python.python extension for ${workspace.uri.fsPath}:`,
                    `${interpreter.join(' ')}`,
                );
            }
        } else {
            traceLog(`Interpreter from setting ${namespace}.interpreter: ${interpreter.join(' ')}`);
        }

        if (interpreter.length === 0) {
            traceLog(
                `No interpreter found for ${workspace.uri.fsPath} in settings or from ms-python.python extension`,
            );
        }
    }

    const workspaceSetting: ISettings = {
        cwd: getCwd(config, workspace, namespace),
        workspace: workspace.uri.toString(),
        args: resolveVariables(config.get<string[]>('args', []), 'args', namespace, workspace),
        path: resolveVariables(
            config.get<string[]>('path', []),
            'path',
            namespace,
            workspace,
            interpreter,
        ),
        interpreter: resolveVariables(interpreter, 'interpreter', namespace, workspace),
        importStrategy: config.get<string>('importStrategy', 'useBundled'),
        showNotifications: config.get<string>('showNotifications', 'off'),
    };
    traceInfo(
        `Workspace settings for ${workspace.uri.fsPath} (client side): ${JSON.stringify(workspaceSetting, null, 4)}`,
    );
    return workspaceSetting;
}

function getGlobalValue<T>(config: WorkspaceConfiguration, key: string): T | undefined {
    const inspect = config.inspect<T>(key);
    return inspect?.globalValue ?? inspect?.defaultValue;
}

export async function getGlobalSettings(
    namespace: string,
    includeInterpreter?: boolean,
): Promise<ISettings> {
    const config = getConfiguration(namespace);

    let interpreter: string[] = [];
    if (includeInterpreter) {
        interpreter = getGlobalValue<string[]>(config, 'interpreter') ?? [];
        if (interpreter === undefined || interpreter.length === 0) {
            interpreter = (await getInterpreterDetails()).path ?? [];
        }
    }

    const setting: ISettings = {
        cwd: process.cwd(),
        workspace: process.cwd(),
        args: getGlobalValue<string[]>(config, 'args') ?? [],
        path: getGlobalValue<string[]>(config, 'path') ?? [],
        interpreter: interpreter ?? [],
        importStrategy: getGlobalValue<string>(config, 'importStrategy') ?? 'useBundled',
        showNotifications: getGlobalValue<string>(config, 'showNotifications') ?? 'off',
    };
    traceInfo(`Global settings (client side): ${JSON.stringify(setting, null, 4)}`);
    return setting;
}

export function checkIfConfigurationChanged(
    e: ConfigurationChangeEvent,
    namespace: string,
    additionalKeys?: string[],
): boolean {
    const settings = [
        `${namespace}.args`,
        `${namespace}.cwd`,
        `${namespace}.path`,
        `${namespace}.interpreter`,
        `${namespace}.importStrategy`,
        `${namespace}.showNotifications`,
        ...(additionalKeys ?? []).map((k) => `${namespace}.${k}`),
    ];
    const changed = settings.map((s) => e.affectsConfiguration(s));
    return changed.includes(true);
}

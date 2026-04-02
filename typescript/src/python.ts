// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PythonEnvironment, PythonEnvironmentApi, PythonEnvironments } from '@vscode/python-environments';
import { commands, Disposable, Event, EventEmitter, Uri } from 'vscode';
import { traceError, traceLog } from './logging';
import { PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import * as semver from 'semver';
import { IInterpreterDetails } from './types';
import { getProjectRoot } from './utilities';

let _pythonMajor = 3;
let _pythonMinor = 10;

/**
 * Configure the minimum Python version requirement.
 * Must be called before initializePython().
 */
export function setPythonVersionRequirement(major: number, minor: number): void {
    _pythonMajor = major;
    _pythonMinor = minor;
}

function getPythonVersion(): string {
    return `${_pythonMajor}.${_pythonMinor}`;
}

function convertToResolvedEnvironment(environment: PythonEnvironment): ResolvedEnvironment | undefined {
    const runConfig = environment.execInfo?.activatedRun ?? environment.execInfo?.run;
    const executable = runConfig?.executable;
    if (!executable) {
        return undefined;
    }
    const coerced = semver.coerce(environment.version);
    return {
        id: environment.envId?.id ?? '',
        path: executable,
        executable: {
            uri: Uri.file(executable),
            bitness: 'Unknown',
            sysPrefix: environment.sysPrefix ?? '',
        },
        version: coerced
            ? {
                  major: coerced.major,
                  minor: coerced.minor,
                  micro: coerced.patch,
                  release: { level: 'final', serial: 0 },
                  sysVersion: environment.version ?? '',
              }
            : undefined,
        environment: undefined,
        tools: [],
    } as ResolvedEnvironment;
}

// ── Adapter pattern ─────────────────────────────────────────────────────

interface IPythonEnvProvider {
    /** Event fired when the active environment changes */
    onDidChangeEnvironment: Event<void>;
    /** Resolve a specific interpreter path */
    resolveEnvironment(interpreter: string[]): Promise<ResolvedEnvironment | undefined>;
    /** Get interpreter path (including args) for a resource, with version check */
    getInterpreterPath(resource?: Uri): Promise<string[] | undefined>;
    /** Get the debugger package path (may not be available) */
    getDebuggerPath(): Promise<string | undefined>;
}

/** Adapter for the new @vscode/python-environments API */
class PythonEnvironmentsProvider implements IPythonEnvProvider {
    private readonly _onDidChange = new EventEmitter<void>();
    readonly onDidChangeEnvironment: Event<void> = this._onDidChange.event;

    constructor(private readonly api: PythonEnvironmentApi) {
        api.onDidChangeEnvironment(() => this._onDidChange.fire());
    }

    async resolveEnvironment(interpreter: string[]): Promise<ResolvedEnvironment | undefined> {
        const environment = await this.api.resolveEnvironment(Uri.file(interpreter[0]));
        if (!environment) {
            return undefined;
        }
        return convertToResolvedEnvironment(environment);
    }

    async getInterpreterPath(resource?: Uri): Promise<string[] | undefined> {
        const environment = await this.api.getEnvironment(resource);
        if (!environment) {
            return undefined;
        }

        const coerced = semver.coerce(environment.version);
        const runConfig = environment.execInfo?.activatedRun ?? environment.execInfo?.run;
        const executable = runConfig?.executable;
        const args = runConfig?.args ?? [];

        if (coerced && coerced.major === _pythonMajor && coerced.minor >= _pythonMinor) {
            if (executable) {
                return [executable, ...args];
            }
            traceError('No executable found for selected Python environment.');
            return undefined;
        }

        traceError(`Python version ${environment.version} is not supported.`);
        traceError(`Selected python path: ${runConfig?.executable}`);
        traceError(`Supported versions are ${getPythonVersion()} and above.`);
        return undefined;
    }

    async getDebuggerPath(): Promise<string | undefined> {
        // New API doesn't expose the debugger path; fall back to legacy API.
        const legacyApi = await PythonExtension.api();
        return legacyApi?.debug.getDebuggerPackagePath();
    }
}

/** Adapter for the legacy @vscode/python-extension API */
class LegacyPythonProvider implements IPythonEnvProvider {
    private readonly _onDidChange = new EventEmitter<void>();
    readonly onDidChangeEnvironment: Event<void> = this._onDidChange.event;

    constructor(private readonly api: PythonExtension) {
        api.environments.onDidChangeActiveEnvironmentPath(() => this._onDidChange.fire());
    }

    async resolveEnvironment(interpreter: string[]): Promise<ResolvedEnvironment | undefined> {
        return this.api.environments.resolveEnvironment(interpreter[0]);
    }

    async getInterpreterPath(resource?: Uri): Promise<string[] | undefined> {
        const environment = await this.api.environments.resolveEnvironment(
            this.api.environments.getActiveEnvironmentPath(resource),
        );
        if (environment?.executable.uri && checkVersion(environment)) {
            return [environment.executable.uri.fsPath];
        }
        return undefined;
    }

    async getDebuggerPath(): Promise<string | undefined> {
        return this.api.debug.getDebuggerPackagePath();
    }
}

// ── Provider singleton ──────────────────────────────────────────────────

let _provider: IPythonEnvProvider | undefined;

async function getProvider(): Promise<IPythonEnvProvider | undefined> {
    if (_provider) {
        return _provider;
    }

    try {
        const envsApi = await PythonEnvironments.api();
        if (envsApi) {
            _provider = new PythonEnvironmentsProvider(envsApi);
            return _provider;
        }
    } catch {
        // New API not available, fall through to legacy.
    }

    const legacyApi = await PythonExtension.api();
    if (legacyApi) {
        _provider = new LegacyPythonProvider(legacyApi);
        return _provider;
    }

    return undefined;
}

// ── Internal helpers (unchanged) ────────────────────────────────────────

const onDidChangePythonInterpreterEvent = new EventEmitter<void>();
export const onDidChangePythonInterpreter: Event<void> = onDidChangePythonInterpreterEvent.event;

function sameInterpreter(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

let serverPython: string[] | undefined;
function checkAndFireEvent(interpreter: string[] | undefined): void {
    if (interpreter === undefined) {
        if (serverPython) {
            serverPython = undefined;
            onDidChangePythonInterpreterEvent.fire();
            return;
        } else {
            return;
        }
    }

    if (!serverPython || !sameInterpreter(serverPython, interpreter)) {
        serverPython = interpreter;
        onDidChangePythonInterpreterEvent.fire();
    }
}

async function refreshServerPython(): Promise<void> {
    const projectRoot = await getProjectRoot();
    const interpreter = await getInterpreterDetails(projectRoot?.uri);
    checkAndFireEvent(interpreter.path);
}

// ── Public API (signatures unchanged) ───────────────────────────────────

export async function initializePython(disposables: Disposable[]): Promise<void> {
    try {
        const provider = await getProvider();
        if (!provider) {
            return;
        }

        disposables.push(
            provider.onDidChangeEnvironment(async () => {
                await refreshServerPython();
            }),
        );

        traceLog('Waiting for interpreter from Python extension.');
        await refreshServerPython();
    } catch (error) {
        traceError('Error initializing Python: ', error);
    }
}

export async function resolveInterpreter(
    interpreter: string[],
): Promise<ResolvedEnvironment | undefined> {
    const provider = await getProvider();
    return provider?.resolveEnvironment(interpreter);
}

export async function getInterpreterDetails(resource?: Uri): Promise<IInterpreterDetails> {
    const provider = await getProvider();
    if (!provider) {
        return { path: undefined, resource };
    }

    const path = await provider.getInterpreterPath(resource);
    return { path, resource };
}

export async function getDebuggerPath(): Promise<string | undefined> {
    const provider = await getProvider();
    return provider?.getDebuggerPath();
}

export async function runPythonExtensionCommand(
    command: string,
    ...rest: unknown[]
): Promise<unknown> {
    await getProvider(); // Ensure an API is initialized
    return await commands.executeCommand(command, ...rest);
}

export function checkVersion(resolved: ResolvedEnvironment | undefined): boolean {
    const version = resolved?.version;
    if (version?.major === _pythonMajor && version?.minor >= _pythonMinor) {
        return true;
    }
    traceError(`Python version ${version?.major}.${version?.minor} is not supported.`);
    traceError(`Selected python path: ${resolved?.executable.uri?.fsPath}`);
    traceError(`Supported versions are ${getPythonVersion()} and above.`);
    return false;
}

export function resetCachedApis(): void {
    _provider = undefined;
}

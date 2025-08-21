import { exec } from "node:child_process";
import { z } from "zod/v4";
import EventEmitter from "events";
import * as fs from "node:fs";
import { type AddressInfo, type Server, WebSocket, WebSocketServer } from "ws";
import { clearInterval } from "node:timers";
import * as http from "node:http";
import { parseArgs, type ParseArgsConfig, type ParseArgsOptionsConfig } from "node:util";
import { Helpers as H } from "./helpers.ts";
import { Elements } from "./elements.ts";

export { Helpers } from "./helpers.ts";
export { Elements };

export interface ConfigData {
    /** Optional title for the panel. */
    title?: string,
    /** Custom CSS to inject into the panel. */
    style?: string,
    /** Extra custom HTML to inject into the panel before the categories (e.g. for custom header). */
    htmlHeader?: string,
    /** Extra custom HTML to inject into the panel after the categories (e.g. for custom footer). */
    htmlFooter?: string,
    /** Port to run local server on. Defaults to 0 (random available port). */
    port: number,
    /** Host to run local server on. Defaults to 'localhost'. */
    host?: string,
    /**
     * How to display the panel.
     * + `webview` (default) uses an embedded webview window,
     * + `browser` opens the default system browser,
     * + `none` does not open any window. The server URL must be opened manually.
     */
    displayMethod?: 'browser'|'none',
    /**
     * Whether to keep the listening server open after the window/browser is closed.
     * Defaults to false.
     */
    stayOpen?: boolean,
}

async function openUrl(url: string) {
    const commands = ['start', 'open', 'xdg-open'];
    for (const cmd of commands) {
        try {
            await new Promise((res, rej) => {
                exec(`${cmd} ${url}`, (error) => {
                    if (error) rej(error);
                    res(!!error);
                }).unref();
            });
            return true;
        } catch (_ignored) {}
    }
    return false;
}

/** Valid input types. */
export const InputType = {
    ...z.coerce,
    enum: z.enum,
};

export interface CategoryConfig {
    displayName?: string;
    description?: string;
    displayHtml?: string;
}

// TODO: Attempt to close tab when the panel is closed?
// TODO: Kiosk mode for supported browsers?
// TODO: Maybe swap from setEnabled to setEleProperty() and make it more broadly useful.

/**
 * Every Config value can be heavily customized in terms of validation behavior and browser rendering.
 *
 * Everything is optional, except for the `type`, which is used to validate inputs from all sources.
 *
 * These config options expose in-depth customization for each Config entry.
 * If such a thing is desired, entirely new HTML elements can be modeled using this configuration.
 */
export interface ConfigDefinition {
    /** The Zod type definition for this config element. */
    type: z.ZodType;
    /** The default value for this config element, if not provided from other sources. */
    default?: any;
    /** A short description of this config element, shown as a tooltip in hte UI. */
    description?: string;
    /** If defined, uses this display name instead of the key. */
    displayName?: string;
    /** If defined, uses this environment variable name instead of the default PREFIX_CATEGORY_CONFIG. */
    envName?: string;
    /** If defined, uses this command-line argument name instead of the default `--category-config`. */
    argName?: string;
    /** If defined, uses this single-character command-line argument name instead of none. */
    argShort?: string;
    /** If defined, appends these classes to the auto-generated HTML element for this config element. */
    customClasses?: string[];
    /** If defined, applies custom HTML rendering for this config element. If undefined, tries to auto-generate based on zod type. */
    toHtml?: (conf: ConfigDefinition, currentValue: any) => string;
    /** Inline CSS styles to apply to the auto-generated HTML element for this config element. */
    css?: string|string[];
    /** If true, will disable this config element in the UI. This value can be toggled with `toggleElement`. */
    elementDisabled?: boolean;
    /** If true, will not generate a label for this config element. Useful when implementing custom `toHtml`. */
    skipLabel?: boolean;
    /**
     * If defined, uses this Zod type name instead of trying to unwrap the type.
     *
     * This can be more convenient than redefining the HTML with `toHtml`, if the input type is simple.
     * For instance, when using zod pipes that should accept simple string inputs.
     */
    useZodTypeName?: 'string' | 'number' | 'boolean' | 'enum';
    /**
     * If true, will not show this config element in the UI,
     * but will still load from env or other sources and be available in `values`.
     */
    hideFromUI?: boolean;
    /**
     * If defined, this function will be called when the user interacts with the config element in the UI.
     */
    onInteract?: (path: string[], value: any) => any;
}


type TypeOfConfigDef<T extends ConfigDefinition> = T['type'] extends z.ZodUndefined ? 'test-val' : z.infer<T['type']>;
type StringKeys<T> = Extract<keyof T, string>;
/**
 * Representation of a change event key. Generate these using `ConfigPanel.getChangeKey`.
 */
type ChangeEventKey<T> = string & { _branded: never }
/** Flag all values within an object as read-only, recursively. */
type DeepReadonly<TInput> = {
    readonly [Key in keyof TInput]: TInput[Key] extends object ? DeepReadonly<TInput[Key]>: TInput[Key];
}

/**
 * A configuration panel that can be launched in a browser window, or simply used to load values in a type-safe way.
 *
 * Example usage:
 * ```typescript
 * new ConfigPanel({
 *     my_category: { displayName: 'My First Category', description: 'This is a test category' },
 * }, {
 *     my_category: {
 *         text_string: {
 *             type: InputType.string().max(20).default('test-default'),
 *             displayName: 'Text String',
 *             description: 'A simple text string input',
 *         },
 *     }
 * });
 * ```
 */
export interface ConfigPanel<
    CATS extends Record<string, CategoryConfig>,
    DEFS extends Record<keyof CATS, Record<string, ConfigDefinition>>,
    VALS extends { [cat in keyof CATS]: { [key in keyof DEFS[cat]]: TypeOfConfigDef<DEFS[cat][key]> } },
> {
    /** Emitted when any config value changes, with the specific config that changed. */
    on(event: 'change', callback: { (data: { path: string[], value: any }): void }): this;
    /** Emitted when any config value changes, within the given category. */
    on<Cat extends StringKeys<CATS>>(
        event: `change.${Cat}`,
        callback: { (data: { path: string[], value: z.infer<DEFS[Cat][string]['type']> }): void }
    ): this;
    /** Emitted when a specific config value changes. */
    on<Cat extends StringKeys<CATS>, T>(event: ChangeEventKey<T>, callback: { (data: { path: string[], value: T }): void }): this;
    /** Emitted when any config value changes, with a map of all current values. */
    on(event: 'values', callback: { (data: VALS): void }): this;
    /** Emitted when an asynchronous error occurs. */
    on(event: 'error', callback: { (err: Error): void }): this;
    /** Emitted when a change fails validation. */
    on(event: 'invalid_change', callback: { (data: { path: string[], rawValue: any, error: Error }): void }): this;
    /** Emitted when the panel is closed, with the exit reason. */
    on(event: 'exit', callback: { (reason: string): void }): this;
    /** Emitted when the internal HTTP/WebSocket server starts, with the port number. */
    on(event: 'port', callback: { (port: number): void }): this;
}

export class ConfigPanel <
    CATS extends Record<string, CategoryConfig>,
    DEFS extends Record<keyof CATS, Record<string, ConfigDefinition>>,
    VALS extends { [cat in keyof CATS]: { [key in keyof DEFS[cat]]: TypeOfConfigDef<DEFS[cat][key]> } }
> extends EventEmitter {
    private readonly abortCtrl = new AbortController();
    private readonly categories: CATS;
    private readonly configMap: DEFS;
    private readonly rawInputMap: Record<any, any> = {};
    private readonly displayMap: Record<string, string> = {};
    private isValueMapDirty = true;
    private valueMap: VALS = {} as any;
    private zodSchema: z.ZodObject;
    private wss: Server|null = null;
    private serverPort: number = 0;
    private wssPing: any = null;
    private server: http.Server|null = null;
    /** The raw positional arguments passed to the program. */
    public positionals: string[] = [];

    constructor(cats: CATS, defs: DEFS) {
        super();
        this.categories = cats;
        this.configMap = defs;

        // Build full Zod schema and set default values.
        const validatorSchema: any = {};
        for (const catKey in defs) {
            if (!cats[catKey].displayName) cats[catKey].displayName = catKey;
            if (cats[catKey].displayHtml) this.displayMap[catKey] = cats[catKey].displayHtml;
            const configs = defs[catKey];
            const validatorCat: any = {};
            for (const confKey in configs) {
                const confDef = configs[confKey];
                if (!confDef.displayName) confDef.displayName = confKey;
                validatorCat[confKey] = confDef.type;
                this.setRawValue([catKey, confKey], confDef.default ?? (confDef.type.def as any).defaultValue);
            }
            if (Object.keys(validatorCat).length) validatorSchema[catKey] = z.object(validatorCat);
        }
        this.zodSchema = z.object(validatorSchema);
        // Register listener for abort cleanup.
        this.abortCtrl.signal.addEventListener('abort', (reason) => {
            this.wss?.clients.forEach((ws: any) => ws.terminate());
            this.server?.close();
            this.wss?.close();
            clearInterval(this.wssPing);
            this.emit('exit', reason);
        })
    }

    /**
     * Load configuration values from environment variables.
     * Default format is "[PREFIX]CATEGORY_CONFIG", or the envName defined in each ConfigDefinition.
     *
     * @param envFile The .env file to load before parsing the current environment. Defaults to ".env".
     * @param prefix The prefix to use for environment variables. Defaults to "".
     * @param ignoreMissing If true, will not throw an error if the .env file does not exist. Defaults to true.
     */
    fromEnvironment({
        envFile = '.env',
        prefix='',
        ignoreMissing = true
    }: { envFile?: string, prefix?: string, ignoreMissing?: boolean } = {}) {
        try {
            (process as any).loadEnvFile(envFile);
        } catch (err) {
            if (!ignoreMissing) throw err;
        }
        const lcEnv = Object.entries(process.env).reduce(
            (acc, [k,v]) => { acc[k.toLowerCase()] = `${v}`; return acc }
        ,{} as Record<string,string>);

        for (const confCat in this.configMap) {
            for (const confKey in this.configMap[confCat]) {
                const conf = this.configMap[confCat][confKey];
                const envKey = (conf.envName || `${prefix}${confCat}_${confKey}`).toLowerCase();
                if (envKey in lcEnv) {
                    this.setRawValue([confCat, confKey], lcEnv[envKey]);
                }
            }
        }
        return this;
    }
    fromEnv = this.fromEnvironment;

    /**
     * Load configuration values from a JSON file.
     * @param filePath The file to load. Defaults to ".env.json".
     * @param ignoreMissing If true, will not throw an error if the file does not exist. Defaults to true.
     */
    fromJSON({ filePath = '.env.json', ignoreMissing = true }: {filePath?: string, ignoreMissing?: boolean} = {}) {
        if (!fs.existsSync(filePath)) {
            if (ignoreMissing) return this;
            throw Error(`JSON Config file not found: ${filePath}`);
        }
        const text = fs.readFileSync(filePath, 'utf-8');
        const obj = JSON.parse(text);
        Object.assign(this.rawInputMap, obj);
        this.isValueMapDirty = true;
        return this;
    }

    toJSON(filePath: string = '.env.json') {
        fs.writeFileSync(filePath, JSON.stringify(this.rawInputMap, null, 2), 'utf-8');
        return this;
    }

    /**
     * Load configuration values from command-line arguments.
     * After this is called, any remaining positional arguments can be found in the `positionals` property.
     */
    fromArgs(opts: ParseArgsConfig = {}) {
        const setters: Record<string, (val: any) => void> = {};
        const descriptors: ParseArgsOptionsConfig = {};
        for (const confCat in this.configMap) {
            for (const confKey in this.configMap[confCat]) {
                const conf: ConfigDefinition = this.configMap[confCat][confKey];
                if (!conf.argName) continue;
                descriptors[conf.argName] = {
                    type: 'string',
                    default: conf.default,
                    short: conf.argShort,
                }
                if (!conf.argShort) delete descriptors[conf.argName].short;
                setters[conf.argName] = (val: any) => this.setRawValue([confCat, confKey], val, conf);
            }
        }
        const { values, positionals } = parseArgs({
            allowPositionals: true,
            allowNegative: true,
            strict: false,
            ...opts,
            args: process.argv,
            options: descriptors,
        });
        for (const argName in setters) {
            if (argName in values) {
                setters[argName](values[argName]);
            }
        }
        this.positionals.push(...positionals);
        return this;
    }

    /**
     * Load configuration values from all standard sources, in order:
     * 1. Environment variables
     * 2. JSON file
     * 3. Command-line arguments
     *
     * For more control, call the individual methods instead.
     */
    load() {
        return this
            .fromEnvironment()
            .fromJSON()
            .fromArgs()
    }
    //TODO: fromYaml(filePath: string, ignoreMissing = false)

    /**
     * Set a raw input value.
     * If defConfig is provided, will parse and validate the value immediately before setting.
     * Otherwise, will mark the value map as dirty to be re-validated on next access.
     * @param path
     * @param rawValue
     * @param defConfig
     * @returns The parsed value if defConfig is provided, otherwise null.
     */
    private setRawValue<T extends ConfigDefinition>(path: string[], rawValue: any, defConfig?: T): z.infer<T['type']> {
        let rawNode: any = this.rawInputMap;
        let valueNode: any = this.valueMap;
        for (let i = 0; i < path.length - 1; ++i) {
            const part = path[i];
            rawNode = rawNode[part] = rawNode[part] || {};
            valueNode = valueNode[part] = valueNode[part] || {};
        }

        let parsed = null;
        if (defConfig) {
            try {
                parsed = valueNode[path[path.length - 1]] = defConfig.type.parse(rawValue);
            } catch (err) {
                if (err instanceof z.ZodError) {
                    err = new Error(
                        `Invalid value for ${path.join('.')}: `
                        + err.issues.map(i => i.message).join('; ')
                        + ` (${rawValue})`
                    );
                }
                throw err;
            }
        } else {
            this.isValueMapDirty = true;
        }
        rawNode[path[path.length - 1]] = rawValue;

        return parsed as any;
    }

    /**
     * Get the ConfigDefinition for a given path.
     */
    private getConfigDefinition(path: string[]) {
        let node: any = this.configMap;
        for (let i = 0; i < path.length; ++i) {
            const part = path[i];
            if (!(part in node)) throw Error('Invalid config path: ' + path.join('.'));
            node = node[part];
        }
        return node as ConfigDefinition;
    }

    private *allCatsAndVals() {
        for (const catKey in this.configMap) {
            for (const confKey in this.configMap[catKey]) {
                const confDef = this.configMap[catKey][confKey];
                const currentRawValue = this.rawInputMap[catKey]?.[confKey];
                yield {
                    path: [catKey, confKey],
                    catKey,
                    confKey,
                    confDef,
                    currentRawValue
                };
            }
        }
    }

    private async startWss(config: Partial<ConfigData>|undefined) {
        if (this.server) return;
        this.server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
                makePageHTML(
                    config?.title || 'Config Panel',
                    (config?.htmlHeader || '') + this.buildHtml() + (config?.htmlFooter || ''),
                    config?.style || '',
                    this.categories,
                )
            );
        });
        this.wss = new WebSocketServer({ server: this.server });
        this.wss.on('connection',  (ws: WebSocket & { isAlive: boolean }) => {
            const sendParseError = (err: any, id: string, path: string[], rawValue: any) => {
                const error = err.issues?.map((e: any) => e.message).join('; ') || err.message || err;
                this.sendWss({ id, error });
                this.emit('invalid_change', { path, rawValue, error: err });
            }
            ws.isAlive = true;
            ws.on('error', console.error);
            ws.on('pong', () => ws.isAlive = true);
            ws.on('error', err => {
                this.emit('error', err);
                ws.terminate();
            });
            ws.on('close', () => {
                if (!(config?.stayOpen ?? false)) this.closePanel('panel closed by user');
            })
            ws.on('message', (message: string) => {
                if (!message.length) return;
                const msg = JSON.parse(message);
                if (msg['path']) {
                    try {
                        this.onValueChange(msg.path, msg.value);
                        this.sendWss({ ok: msg.id });
                    } catch (err: any) {
                        sendParseError(err, msg.id, msg.path, msg.value);
                    }
                }
            });
            for (const data of this.allCatsAndVals()) {
                // Validate all existing values individually and send any errors to the client.
                try { data.confDef.type.parse(data.currentRawValue) } catch (err: any) {
                    sendParseError(err, pathToElementId(data.path), data.path, data.currentRawValue);
                }
            }
        });
        this.server.listen(config?.port || 0, config?.host || 'localhost');
        this.serverPort = await new Promise<number>(resolve => {
            this.wss?.once('listening', () => {
                resolve((this.wss?.address() as AddressInfo)?.port);
            });
        });
        this.wssPing = setInterval(() => {
            if (!this.isRunning) {
                this.wss?.close();
                return clearInterval(this.wssPing);
            }
            this.wss?.clients.forEach((ws: any) => {
                if (!ws.isAlive) return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            });
        }, 30_000).unref();
        this.emit('port', this.serverPort);
    }

    /**
     * Send data to all connected websocket clients.
     * @private
     */
    private sendWss(data: any) {
        this.wss?.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    /**
     * Send HTML to a specific category in the panel, where it will be rendered.
     *
     * Be careful with the HTML you send, as it will be rendered directly in the panel.
     * See {@link sendText} for a safer alternative that escapes HTML special characters.
     *
     * @param cat The category to target.
     * @param html The HTML to display in the panel.
     */
    public sendHTML<C extends string & keyof DEFS>(cat: C, ...html: string[]) {
        const content = html.join('\n');
        if (content) {
            this.displayMap[cat] = content;
        } else {
            delete this.displayMap[cat];
        }
        this.sendWss({ html: content ?? '', cat})
    }

    /**
     * Send a text message to a specific category in the panel, escaping all HTML special characters.
     *
     * This is a safer alternative to {@link sendHTML}, as it prevents XSS attacks and other issues.
     * @param cat
     * @param text
     */
    public sendText<C extends string & keyof DEFS>(cat: C, ...text: string[]) {
        return this.sendHTML(cat, ...text.map(t => H.escapeHtml(t)));
    }

    /**
     * Enable or disable a specific configuration element in the panel.
     */
    public toggleElement<
        C extends string & keyof DEFS,
        P extends string & keyof DEFS[C],
    >(cat: C, prop: P, enabled: boolean) {
        console.log(`Toggling element ${cat}.${prop} to ${enabled}`);
        return this.sendWss({
            enable: enabled,
            id: pathToElementId([cat, prop]),
        })
    }

    /**
     * Helper function to generate a Change Event key for a given category and optional config key name.
     *
     * Example usage:
     * ```typescript
     * panel.on(panel.getChangeKey('category', 'property'), data => console.log(data));
     * ```
     */
    getChangeKey<
        C extends string & keyof DEFS,
        P extends string & keyof DEFS[C],
        V = P extends undefined ? z.infer<DEFS[C][string]['type']> : TypeOfConfigDef<DEFS[C][P]>
    >(cat: C, def?: P): ChangeEventKey<V> {
        return (`change.${cat}` + def ? `.${def}` : '') as any;
    }
    cKey = this.getChangeKey;

    /**
     * Launch the configuration panel in a system browser window.
     */
    async startInterface(config?: Partial<ConfigData>, callback?: (port: number) => void) {
        const displayMethod: ConfigData["displayMethod"] = config?.displayMethod ?? 'browser';
        await this.startWss(config);

        if (displayMethod === 'browser') {
            if (!await openUrl(`http://localhost:${this.serverPort}`)) {
                this.emit(
                    'error',
                    Error('Failed to open URL in a browser: http://localhost:'+this.serverPort)
                );
            }
        }
        if (callback) callback(this.serverPort);
        return this;
    }
    open = this.startInterface;

    /**
     * Returns true if the configuration panel is currently open and running.
     */
    get isRunning() {
        return !this.abortCtrl.signal.aborted;
    }

    /**
     * The port the internal websocket server is running on, for advanced use cases.
     */
    get httpPort() {
        return this.serverPort;
    }

    /**
     * Current configuration values, updated in real-time as the user makes changes.
     *
     * These values are read-only. To change a value, use {@link set} or {@link setRaw}.
     */
    get values(): DeepReadonly<VALS> {
        if (this.isValueMapDirty) {
            Object.assign(this.valueMap, this.zodSchema.parse(this.rawInputMap));
            this.isValueMapDirty = false;
        }
        return this.valueMap;
    }

    /**
     * Set the value of a configuration property, expecting a string-encoded value formatted as would normally be input.
     * The given value is parsed and validated immediately before assignment.
     *
     * For simpler, type-safe values, it may be preferable to use {@link set} instead.
     */
    setRaw<
        C extends string & keyof DEFS,
        P extends string & keyof DEFS[C],
    >(cat: C, prop: P, value: string): z.infer<DEFS[C][P]['type']> {
        const def = this.getConfigDefinition([cat, prop]);
        return this.setRawValue([cat, prop], value, def) as any;
    }

    /**
     * Set the value of a configuration property. This is a type-safe version of {@link setRaw},
     * and expects that the value can be converted directly into a string.
     *
     * For more complex types with advanced encoding, use {@link setRaw}.
     */
    set<
        C extends string & keyof DEFS,
        P extends string & keyof DEFS[C],
        T extends z.infer<DEFS[C][P]['type']>
    >(cat: C, prop: P, value: T): z.infer<DEFS[C][P]['type']> {
        return this.setRaw(cat, prop, `${value}`);
    }

    /**
     * Close the configuration panel, and shut down any associated resources.
     * If waiting for the panel to close is desired, follow this call with `await waitForClose()`.
     *
     * @param reason
     */
    closePanel(reason: string = 'closed manually') {
        this.abortCtrl.abort(reason);
        return this;
    }

    /**
     * Wait for the configuration panel to close, then return all Config values.
     *
     * This does not trigger the panel to close, call `closePanel()` first if needed -
     * otherwise this will wait for the user to close the panel.
     *
     * If `stayOpen` was set to true, this will wait indefinitely until the panel is closed programmatically.
     */
    async waitForClose() {
        if (this.isRunning) {
            await new Promise<void>(resolve => this.once('exit', () => resolve()));
        }
        return this.values;
    }


    private buildHtml() {
        const cats = Object.entries(this.categories).map(([catName, def]) => {
            return `<div class="category wrapper_${catName}" id="cat_${catName}">
                <h2 class="category_title ${catName}">${def.displayName}</h2>
                ${ def.description ? `<p class="description ${catName}">${def.description}</p>` : '' }
                <iframe class="html_display ${catName}" id="display-${catName}" sandbox="allow-same-origin"></iframe>
                <div class="configs">
                ${Object.entries(this.configMap[catName] ?? {}).map(([confName, confDef]) => {
                    if (confDef.hideFromUI) return;
                    const currentValue = this.rawInputMap[catName]?.[confName];
                    return formatElementHtml([catName, confName], confDef, currentValue);
                }).filter(e=>e).join('\n')}
                </div>
            </div>`
        });
        return cats.join('\n');
    }

    private onValueChange(path: string[], value: any) {
        const config = this.getConfigDefinition(path);
        const parsedVal = this.setRawValue(path, value, config);

        if (config.onInteract) config.onInteract(path, parsedVal);
        this.emit('change', { path, value: parsedVal });
        this.emit(this.getChangeKey(path[0]), { path, value: parsedVal });
        this.emit(this.getChangeKey(path[0], path[1]), parsedVal);
        try {
            this.emit('values', this.values);
        } catch (err) {
            this.emit('error', err);
        }
    }
}


function pathToElementId(path: string[]) {
    return Buffer.from(JSON.stringify(path)).toString('base64');
}

function formatElementHtml(path: string[], confDef: ConfigDefinition, currentValue: any): string {
    let html = makeElementHtml(confDef, currentValue);
    let quoteVal = JSON.stringify(currentValue || '');
    if (quoteVal[0] !== '"') quoteVal = `"${quoteVal}"`; // Ensure it's a string in quotes for HTML attributes

    const customClassStr = confDef.customClasses?.map(c => c.replaceAll('"', '')).join(' ') || '';
    const customCss = [confDef.css ?? []].flat().map(c => c.replaceAll('"', '')).join('; ');
    const eleId = pathToElementId(path);
    html = html
        .replaceAll('data-all', `data-id data-classes data-css`)
        .replaceAll('data-id', `id="${eleId}"`)
        .replaceAll('data-classes', `class="${customClassStr}"`)
        .replaceAll('data-css', `style="${customCss}"`)
        .replaceAll('data-checked', currentValue ? 'checked' : '')
        .replaceAll('VAL', quoteVal);

    if (!confDef.skipLabel) {
        html = `<label for="${eleId}">${confDef.displayName}</label>${html}`;
    }

    return `<div class="option ${confDef.type.def.type} ${path.map(p=>`p_${p}`).join(' ')}" title="${confDef.description || ''}">
        ${html}
        <div id="error-${eleId}" class="error_msg error_msg_${confDef.type.def.type}"></div>
        ${confDef.elementDisabled ? `<script>document.getElementById('${eleId}').disabled = true;</script>` : ''}
    </div>`;
}

/**
 * Strip away wrappers like optional, nullable, etc. to get to the core type.
 * @param zo
 */
function unwrapZod(zo: z.ZodType) {
    let unwrapped: any = zo;
    let typeName = zo.def.type;
    try {
        while (unwrapped.unwrap) {
            unwrapped = unwrapped.unwrap();
            typeName = unwrapped.def.type
        }
    } catch (_ignored) {}
    return typeName;
}

function findZodOptions(zo: z.ZodType): string[] {
    let unwrapped: any = zo;
    try {
        while (!unwrapped?.def?.entries) {
            unwrapped = unwrapped.unwrap();
        }
        return Object.keys(unwrapped?.def?.entries);
    } catch (_ignored) {}
    throw Error('Not an enum type!');
}


function makeElementHtml(conf: ConfigDefinition, currentValue: any): string {
    if (conf.toHtml) return conf.toHtml(conf, currentValue);

    const type = conf.useZodTypeName || unwrapZod(conf.type);

    switch (type) {
        case 'string':
            return `<input type="text" data-id data-classes data-css value=VAL/>`;
        case 'number':
            return `<input type="number" data-id data-classes data-css value=VAL />`;
        case 'boolean':
            return `<input type="checkbox" data-id data-classes data-css data-checked />`;
        case 'enum':
            const opts = findZodOptions(conf.type);
            const options = opts.map((v: string) => {
                const qv = JSON.stringify(v);
                return `<option value=${qv} ${v === currentValue ? 'selected' : ''}>${v}</option>`;
            }).join('\n');
            return `<select data-id data-classes data-css>${options}</select>`;
        default:
            return `<div>Not implemented type: ${type}. Provide custom element HTML with "toHtml".</div>`;
    }
}

function makePageHTML(title: string, body: string, style: string, cats: Record<string, CategoryConfig> = {}): string {
    return `<!DOCTYPE html>
<html lang="en-us">
    <head>
        <title>${title}</title>
        <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #f6f8fa;
            color: #222;
            margin: 10px;
            padding: 0;
        }
        
        body .category {
            max-width: 800px;
            margin: 1rem auto;
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            padding: 1rem;
        }
        label {
            font-weight: bold;
            margin-bottom: 0.5rem;
            margin-right: 0.5rem;
            display: inline-block;
        }
        .error_msg {
            color: red;
            font-size: small;
        }
        .description {
            font-size: small;
            font-style: italic;
            color: #555;
            margin-bottom: 0.5rem;
            margin-top: 0;
        }
        .html_display {
            display: none;
            width: 100%;
        }
        h2 {
            font-size: 1.5rem;
            margin: 0;
            padding: 0;
        }
        input[type="button"] {
            cursor: pointer;
        }
        iframe {
            background-color: transparent;
            border: 0px none transparent;
            padding: 0px;
            overflow: hidden;
        }
        ${style || ''}
        </style>
    </head>
    <body>
        ${body}
        <script>
            const inputs = document.querySelectorAll('input, textarea, select');
            const values = {};
            
            function setDisplayHtml(cat, html) {
                const margin = 10;
                const content = "<html><head>" +
                 "<style>body {font-family: 'Segoe UI', Arial, sans-serif;color: #222;margin: "+
                 margin + "px;padding: 0;}</style>" +
                 "</head><body>" + html + '</body></html>';
                const ele = document.getElementById('display-'+cat);
                ele.addEventListener("load", () => {
                  ele.style.height = (ele.contentWindow.document.documentElement.scrollHeight)+'px';
                }, { once: true });
                ele.srcdoc = content;
                ele.style.display = html ? 'block' : 'none';
            }
            
            const socket = new WebSocket("ws://"+document.location.host);
            
            socket.addEventListener("close", (event) => document.body.innerHTML = '<h2>Connection lost. Please close or reload this window.</h2>' );
            socket.addEventListener("error", (event) => document.body.innerHTML = '<h2>Connection lost. Please close or reload this window.</h2>' );
            socket.addEventListener("message", (event) => {
                const data = JSON.parse(event.data);
                if (data.html !== undefined) {
                    setDisplayHtml(data.cat, data.html);
                }
                if (data.error !== undefined) {
                    document.getElementById('error-'+data.id).textContent = data.error;
                }
                if (data.ok !== undefined) {
                    document.getElementById('error-'+data.ok).textContent = '';
                }
                if (data.enable !== undefined) {
                    console.log('Toggling element:', data);
                    document.getElementById(data.id).disabled = !data.enable;
                }
            });
            setInterval(() => socket.send(''), 5_000);
            
            const sendValue = (path, value, id) => socket.send(JSON.stringify({ path, value, id }));
            window.sendButtonPress = (eventId) => socket.send(JSON.stringify({ event: eventId }));
            
            inputs.forEach(input => {
                const name = input.id;
                const path = JSON.parse(atob(name));
                if (!name || !path) return;
                
                switch (input.type) { 
                    case 'checkbox':
                    case 'radio':
                        input.addEventListener('change', () => sendValue(path, input.checked, name));
                        break;
                    case 'button':
                        input.addEventListener('click', () => sendValue(path, undefined, name));
                    default:
                        input.addEventListener('input', () => sendValue(path, input.value, name));
                }
            });
            ${
                // Encode the initial values and set them for each display.
                Object.entries(cats).map(([catKey, catDef]) => {
                    if (catDef.displayHtml) {
                        return `setDisplayHtml(atob("${H.b64(catKey)}"), atob("${H.b64(catDef.displayHtml)}"));`;
                    }
                }).join('\n')
            }
            ${
                // Encode the initial values and set them for each display.
                Object.entries(cats).map(([catKey, catDef]) => {
                    
                    if (catDef.displayHtml) {
                        return `setDisplayHtml(atob("${H.b64(catKey)}"), atob("${H.b64(catDef.displayHtml)}"));`;
                    }
                }).join('\n')
            }
        </script>
    </body>
</html>
`;
}

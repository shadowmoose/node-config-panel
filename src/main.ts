import { fork } from "node:child_process";
import { fileURLToPath } from 'url';
import path from 'path';
import { type ConfigData, startPanel } from "./browser.worker.ts";
import { z } from "zod";
import EventEmitter from "events";
import * as fs from "node:fs";


function launch(opts: ConfigData, controller: AbortController) {
    if (process.send !== undefined) throw Error('Not running as a worker process');

    const __filename = fileURLToPath(import.meta.url);
    const fileExt = path.extname(__filename);
    const __dirname = path.dirname(__filename);
    const { signal } = controller;
    const child = fork(path.join(__dirname, `browser.worker${fileExt}`), process.argv.slice(2), { signal });

    child.send(JSON.stringify(opts));

    return child;
}

/** Valid input types. */
export const InputType = {
    ...z.coerce,
    enum: z.enum,
};

export interface CategoryConfig {
    displayName?: string;
    description?: string;
}

export interface ConfigDefinition {
    type: z.ZodType;
    description?: string;
    displayName?: string;
    envName?: string;
    /** If defined, applies custom HTML rendering for this config element. If undefined, tries to auto-generate based on zod type. */
    toHtml?: (conf: ConfigDefinition, currentValue: any) => string;
    skipLabel?: boolean;
    /** If true, will not trigger validation on every change, only when `validate()` is called. Useful for text inputs where user may be mid-edit. */
    skipRealtimeValidate?: boolean;
}


type TypeOfConfigDef<T extends ConfigDefinition> = z.infer<T['type']>;

/**
 * A configuration panel that can be launched in a browser window.
 *
 * Changes are emitted in real-time as the user makes them, using the following events:
 * - `change` - Emitted on any change, with `{ path: string[], value: any }`.
 * - `change.CATEGORY` - Emitted on specific config changes within the given category, with `{ path: string[], value: any }`.
 * - `change.CATEGORY.KEY` - Emitted on specific config changes, with the new value.
 * - `values` - Emitted on any change, with the full current values object.
 *
 * Also emits:
 * - `error` - Emitted if an asynchronous error occurs.
 * - `invalid_change` - Emitted if a change fails validation, with `{ path: string[], value: any, error: Error }`.
 * - `exit` - Emitted when the panel is closed, with the exit code (or null).
 *
 */
export class ConfigPanel <
    CATS extends Record<string, CategoryConfig>,
    DEFS extends Record<keyof CATS, Record<string, ConfigDefinition>>,
    VALS extends { [cat in keyof CATS]: { [key in keyof DEFS[cat]]: TypeOfConfigDef<DEFS[cat][key]> } }
> extends EventEmitter {
    private child?: ReturnType<typeof fork>;
    private readonly abortCtrl = new AbortController();
    private categories: CATS;
    private readonly configMap: DEFS;
    private valueMap: VALS = {} as any;
    private running = false;
    private zodSchema: z.ZodObject;

    constructor(cats: CATS, defs: DEFS) {
        super();
        this.categories = cats;
        this.configMap = defs;

        // Build full Zod schema and set default values.
        const validatorSchema: any = {};
        for (const catKey in defs) {
            if (!cats[catKey].displayName) cats[catKey].displayName = catKey;
            const configs = defs[catKey];
            const map = this.valueMap[catKey] = this.valueMap[catKey] || {} as any;
            const validatorCat: any = {};
            for (const confKey in configs) {
                const confDef = configs[confKey];
                if (!confDef.displayName) confDef.displayName = confKey;
                map[confKey] = (confDef.type.def as any).defaultValue;
                validatorCat[confKey] = confDef.type;
            }
            validatorSchema[catKey] = z.object(validatorCat);
        }
        this.zodSchema = z.object(validatorSchema);
    }

    /**
     * Load configuration values from environment variables.
     * Default format is "PREFIX_CATEGORY_CONFIG", or the envName defined in each ConfigDefinition.
     *
     * @param prefix
     */
    fromEnvironment(prefix: string = '') {
        // TODO: Maybe call a dotenv load first?
        const lcEnv = Object.entries(process.env).reduce(
            (acc, [k,v]) => { acc[k.toLowerCase().replaceAll('_', '')] = `${v}`; return acc }
        ,{} as Record<string,string>);

        for (const confCat in this.configMap) {
            for (const confKey in this.configMap[confCat]) {
                const conf = this.configMap[confCat][confKey];
                const envKey = (conf.envName || `${prefix}${confCat}_${confKey}`).toLowerCase();
                if (envKey in lcEnv) {

                }
            }
        }
        return this;
    }

    fromJson(filePath: string, ignoreMissing = false) {
        if (!fs.existsSync(filePath)) {
            if (ignoreMissing) return this;
            throw Error(`JSON Config file not found: ${filePath}`);
        }
        const text = fs.readFileSync(filePath, 'utf-8');
        const obj = JSON.parse(text);
        this.valueMap = this.zodSchema.parse(obj) as any;
        return this;
    }

    toJSON(filePath: string) {
        fs.writeFileSync(filePath, JSON.stringify(this.values, null, 2), 'utf-8');
        return this;
    }

    fromYaml(filePath: string, ignoreMissing = false) {
        // TODO: Implement loading from YAML file.
        return this;
    }

    /**
     * Launch the configuration panel in a system browser window.
     */
    startInterface(config?: Partial<ConfigData>) {
        this.running = true;
        this.child = launch({
            ...config,
            body: this.buildHtml(),
        }, this.abortCtrl);
        this.child.on('error', (err) =>{
            if (!this.abortCtrl.signal.aborted) {
                this.emit('error', err);
            }
        });
        this.child.once('exit', (code) => {
            this.running = false;
            this.emit('exit', code);
        });
        this.child.on('message', (message: string) => {
            const msg = JSON.parse(message);
            if (msg['path']) {
                try {
                    this.onValueChange(msg.path, msg.value);
                } catch (err) {
                    this.emit('error', err);
                    this.emit('invalid_change', { path: msg.path, value: msg.value, error: err });
                }
            }
        });
        return this;
    }

    /**
     * Launch the configuration panel in a system browser window, blocking the current thread until the panel is closed.
     *
     * This call currently doesn't work, as the library has an internal error, but may work in the future.
     */
    startInterfaceSync(config?: Partial<ConfigData>) {
        const result = startPanel({
            ...config,
            body: this.buildHtml(),
        });
        this.valueMap = this.zodSchema.parse(result) as any;
        return this;
    }

    /**
     * Returns true if the configuration panel is currently open and running.
     */
    get isRunning() {
        return this.running && this.child && !this.child.killed;
    }

    /**
     * The child process running the configuration panel, exposed for advanced use cases.
     */
    get childProcess() {
        return this.child;
    }

    /**
     * Current configuration values, updated in real-time as the user makes changes.
     *
     * Note that these values are not always validated until `validate()` is called.
     * If realtime, validated values are needed, call `validate()` and use the result.
     */
    get values(): VALS {
        return this.valueMap as any;
    }

    /**
     * Close the configuration panel.
     * If waiting for the panel to close is desired, follow this call with `await waitForClose()`.
     *
     * @param reason
     */
    closePanel(reason?: string) {
        this.abortCtrl.abort(reason);
        return this;
    }

    /**
     * Wait for the configuration panel to close, then validate and return all Config values.
     *
     * This does not trigger the panel to close, call `close()` first if needed -
     * otherwise this will wait for the user to close the panel.
     */
    async waitForClose() {
        while (this.isRunning) {
            await new Promise(r => setTimeout(r, 100));
        }
        return this.validate();
    }

    /**
     * Validate the current configuration values and return them, or throw if invalid.
     */
    validate(): VALS {
        return this.zodSchema.parse(this.valueMap) as any;
    }

    private buildHtml() {
        const cats = Object.entries(this.categories).map(([catName, def]) => {
            return `<div class="category ${catName}" id="cat_${catName}">
                <h2 class="category_title ${catName}">${def.displayName}</h2>
                ${ def.description ? `<p class="description ${catName}">${def.description}</p>` : '' }
                <div class="configs">
                ${Object.entries(this.configMap[catName]).map(([confName, confDef]) => {
                    const currentValue = this.valueMap[catName]?.[confName];
                    return formatElementHtml([catName, confName], confDef, currentValue);
                }).join('\n')}
                </div>
            </div>`
        });
        return cats.join('\n');
    }

    private onValueChange(path: string[], value: any) {
        let node: any = this.valueMap;
        let zodType: any = this.configMap;
        const propName = path[path.length - 1];
        for (let i = 0; i < path.length - 1; ++i) {
            const part = path[i];
            if (!(part in node)) node[part] = {};
            node = node[part];
            zodType = zodType[part];
        }
        const skipValidate = zodType[propName].skipRealtimeValidate;
        if (!skipValidate) {
            zodType = zodType[propName]['type'];
            value = zodType.parse(value);
        }
        node[propName] = value;
        this.emit('change', { path, value });
        this.emit('change.'+path[0], { path, value });
        this.emit('change.'+path.join('.'), value);
        this.emit('values', this.valueMap);
    }
}

function formatElementHtml(path: string[], confDef: ConfigDefinition, currentValue: any): string {
    let html = makeElementHtml(confDef, currentValue);
    let quoteVal = JSON.stringify(currentValue || '');
    if (quoteVal[0] !== '"') quoteVal = `"${quoteVal}"`; // Ensure it's a string in quotes for HTML attributes

    const eleName = Buffer.from(JSON.stringify(path)).toString('base64');
    html = html
        .replaceAll('data-id', `id="${eleName}"`)
        .replaceAll('data-raw-name', path[path.length - 1])
        .replaceAll('data-checked', currentValue ? 'checked' : '')
        .replaceAll('VAL', quoteVal);

    if (!confDef.skipLabel) {
        html = `<label for="${eleName}">${confDef.displayName}</label>${html}`;
    }
    return `<div class="option ${confDef.type.def.type} ${path.map(p=>`p_${p}`).join(' ')}" title="${confDef.description || ''}">${html}</div>`;
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

    const type = unwrapZod(conf.type);

    switch (type) {
        case 'string':
            return `<input type="text" data-id value=VAL/>`;
        case 'number':
            return `<input type="number" data-id value=VAL min="0" max="100"/>`;
        case 'boolean':
            return `<input type="checkbox" data-id data-checked />`;
        case 'enum':
            const opts = findZodOptions(conf.type);
            const options = opts.map((v: string) => {
                const qv = JSON.stringify(v);
                return `<option value=${qv} ${v === currentValue ? 'selected' : ''}>${v}</option>`;
            }).join('\n');
            return `<select data-id>${options}</select>`;
        default:
            return `<div>Not implemented type: ${type}</div>`;
    }
}
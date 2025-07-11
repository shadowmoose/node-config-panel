import { type ConfigData } from "./browser.worker.ts";
import { z } from "zod";
import EventEmitter from "events";
/** Valid input types. */
export declare const InputType: {
    enum: typeof z.enum;
    string<T = unknown>(params?: string | z.core.$ZodStringParams): z.ZodCoercedString<T>;
    number<T = unknown>(params?: string | z.core.$ZodNumberParams): z.ZodCoercedNumber<T>;
    boolean<T = unknown>(params?: string | z.core.$ZodBooleanParams): z.ZodCoercedBoolean<T>;
    bigint<T = unknown>(params?: string | z.core.$ZodBigIntParams): z.ZodCoercedBigInt<T>;
    date<T = unknown>(params?: string | z.core.$ZodDateParams): z.ZodCoercedDate<T>;
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
export declare class ConfigPanel<CATS extends Record<string, CategoryConfig>, DEFS extends Record<keyof CATS, Record<string, ConfigDefinition>>, VALS extends {
    [cat in keyof CATS]: {
        [key in keyof DEFS[cat]]: TypeOfConfigDef<DEFS[cat][key]>;
    };
}> extends EventEmitter {
    private child?;
    private readonly abortCtrl;
    private categories;
    private readonly configMap;
    private valueMap;
    private running;
    private zodSchema;
    private wss;
    private wssPort;
    private wssPing;
    constructor(cats: CATS, defs: DEFS);
    /**
     * Load configuration values from environment variables.
     * Default format is "PREFIX_CATEGORY_CONFIG", or the envName defined in each ConfigDefinition.
     *
     * @param prefix
     */
    fromEnvironment(prefix?: string): this;
    fromJson(filePath: string, ignoreMissing?: boolean): this;
    toJSON(filePath: string): this;
    fromYaml(filePath: string, ignoreMissing?: boolean): this;
    private startWss;
    /**
     * Send data to all connected websocket clients.
     * @private
     */
    private sendWss;
    /**
     * Launch the configuration panel in a system browser window.
     */
    startInterface(config?: Partial<ConfigData>): Promise<this>;
    /**
     * Launch the configuration panel in a system browser window, blocking the current thread until the panel is closed.
     *
     * This call currently doesn't work, as the library has an internal error, but may work in the future.
     */
    startInterfaceSync(config?: Partial<ConfigData>): this;
    /**
     * Returns true if the configuration panel is currently open and running.
     */
    get isRunning(): boolean | undefined;
    /**
     * The child process running the configuration panel, exposed for advanced use cases.
     */
    get childProcess(): import("child_process").ChildProcess | undefined;
    /**
     * Current configuration values, updated in real-time as the user makes changes.
     *
     * Note that these values are not always validated until `validate()` is called.
     * If realtime, validated values are needed, call `validate()` and use the result.
     */
    get values(): VALS;
    /**
     * Close the configuration panel.
     * If waiting for the panel to close is desired, follow this call with `await waitForClose()`.
     *
     * @param reason
     */
    closePanel(reason?: string): this;
    /**
     * Wait for the configuration panel to close, then validate and return all Config values.
     *
     * This does not trigger the panel to close, call `close()` first if needed -
     * otherwise this will wait for the user to close the panel.
     */
    waitForClose(): Promise<VALS>;
    /**
     * Validate the current configuration values and return them, or throw if invalid.
     */
    validate(): VALS;
    private buildHtml;
    private onValueChange;
}
export {};

import z from "zod/v4";
import type { ConfigDefinition } from "./main.js";


export const Elements = {
    /**
     * A button that can be used in the configuration panel.
     * The button stores no value other than `undefined`, but triggers "update" events when clicked in the UI.
     *
     * @constructor
     */
    Button(props: {
        text: string,
        onClick?: (path: string[], value: any) => void,
        config?: Partial<ConfigDefinition>,
    }): ConfigDefinition {
        return {
            skipLabel: true,
            ...props.config,
            type: z.undefined(),
            onInteract: props.onClick,
            toHtml: (_conf, _currentValue) => {
                return `<input
                    type="button"
                    data-all
                    value="${props.text}"
                />`
            }
        }
    }
} as const;
export default Elements;
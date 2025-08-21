/**
 * Utility functions for various operations, mostly related to opinionated HTML formatting.
 */
export const Helpers = {
    /**
     * Converts an object to an HTML table string, using each key+value as a row.
     *
     * Output format looks like this:
     * ```html
     * <table>
     *     <tbody>
     *         <tr><td><b>KEY:</b></td><td>VALUE</td></tr>
     *     </tbody>
     * </table>
     * ```
     *
     * @param obj The object to convert. All keys and values will be converted to strings.
     * @param headers Optional headers for the table.
     * @param escape If true, all keys and values will be HTML escaped to prevent XSS attacks.
     * @returns An HTML string representing the table.
     */
    objToTable: (obj: Record<any, any>, headers: string[] = [], escape = true): string => {
        const rows = Object.entries(obj).map(([key, value]) => {
            const k = escape ? Helpers.escapeHtml(key) : key;
            const v = escape ? Helpers.escapeHtml(value) : value;
            return `<tr><td><b>${k}:</b></td><td>${v}</td></tr>`;
        });
        const h1 = escape ? Helpers.escapeHtml(headers[0]) : headers[0];
        const h2 = escape ? Helpers.escapeHtml(headers[1] ?? '') : headers[1];
        const header = headers?.length ? `<tr><th>${ h1 }</th><th>${ h2 ?? 'unknown' }</th></tr>` : '';
        return `<table>${header}${rows.join('')}</table>`;
    },

    /**
     * Basic HTML escaping function that replaces all non-alphanumeric characters with their HTML entity equivalents.
     * @param s
     */
    escapeHtml: (s: string) => {
        return `${s}`.replace(
            /[^0-9A-Za-z ]/gm,
            c => "&#" + c.charCodeAt(0) + ";"
        );
    },

    /**
     * Shorthand base64 string encode in Node.
     */
    b64: (str: string) => Buffer.from(str, 'utf8').toString('base64'),
} as const;

export default Helpers;
import { type BrowserWindowOptions, type WebviewOptions } from '@webviewjs/webview';
export interface ConfigData {
    windowOptions?: BrowserWindowOptions;
    webviewOptions?: WebviewOptions & {
        openDevtools?: boolean;
    };
    style?: string;
    body: string;
}
export declare function startPanel(optConfig?: ConfigData): Record<string, Record<string, any>> | undefined;

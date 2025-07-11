import { Application, type BrowserWindowOptions, type WebviewOptions } from '@webviewjs/webview';


const isWorker = !!process.send;

export interface ConfigData {
    windowOptions?: BrowserWindowOptions,
    webviewOptions?: WebviewOptions & { openDevtools?: boolean },
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
    displayMethod?: 'webview'|'browser'|'none',
    /**
     * Whether to kill the listening server when the window/browser is closed.
     * Defaults to true.
     */
    killOnClose?: boolean,
}

export function startPanel(optConfig?: ConfigData) {
    if (!optConfig) {
        let configString: string|null = null;
        const start = Date.now();
        let interval = setInterval(() => {
            if (Date.now() - start > 10_000) {
                clearInterval(interval);
                throw Error('No configuration data received from parent process after 10 seconds.');
            }
            if (configString) {
                clearInterval(interval);
                bootBrowser(JSON.parse(configString));
            }
        }, 100);
        process.once('message', (data: string) => configString = data );
    } else {
        return bootBrowser(optConfig);
    }
}

function bootBrowser(config: ConfigData) {
    const app = new Application();
    const window = app.createBrowserWindow({
        transparent: false,
        decorations: true,
        title: 'Configuration Panel',
        width: 350,
        height: 400,
        ...config.windowOptions,
    });

    const webview = window.createWebview({
        url: `http://localhost:${config.port}`,
        transparent: false,
        enableDevtools: true,
        ...config.webviewOptions,
    });

    if (!webview.isDevtoolsOpen() && config.webviewOptions?.openDevtools) webview.openDevtools();

    const localState: Record<string, Record<string, any>> = {};

    webview.onIpcMessage((data) => {
        if (isWorker) {
            process.send?.(data.body.toString('utf-8'));
        } else {
            // If running in main process, IPC won't work, so just save a local snapshot to be returned when the window closes.
            const { path, value } = JSON.parse(data.body.toString('utf-8'));
            let obj: any = localState;
            for (let i = 0; i < path.length; i++) {
                const key = path[i];
                if (i === path.length - 1) {
                    obj[key] = value;
                } else {
                    obj[key] = obj[key] || {};
                    obj = obj[key];
                }
            }
        }
    });

    if (!isWorker) {
        app.onEvent(evt => {
            if (evt.event === 0) {
                window.setVisible(false);
            }
        })
    }

    // webview.evaluateScript(`onIpcMessage("test")`);
    try {
        app.run();
    } catch(err) {
        console.error('Error running webview application:', err);
    }

    return localState;
}

if (isWorker) {
    startPanel();
}

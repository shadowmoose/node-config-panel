import { Application } from '@webviewjs/webview';
const isWorker = !!process.send;
export function startPanel(optConfig) {
    if (!optConfig) {
        let configString = null;
        const start = Date.now();
        let interval = setInterval(() => {
            if (Date.now() - start > 10000) {
                clearInterval(interval);
                throw Error('No configuration data received from parent process after 10 seconds.');
            }
            if (configString) {
                clearInterval(interval);
                bootBrowser(JSON.parse(configString));
            }
        }, 100);
        process.once('message', (data) => configString = data);
    }
    else {
        return bootBrowser(optConfig);
    }
}
function bootBrowser(config) {
    var _a;
    const app = new Application();
    const window = app.createBrowserWindow(Object.assign({ transparent: false, decorations: true, title: 'Configuration Panel', width: 300, height: 400 }, config.windowOptions));
    const webview = window.createWebview(Object.assign({ html: `<!DOCTYPE html>
        <html lang="en-us">
            <head>
                <title>Loading...</title>
                <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: #f6f8fa;
                    color: #222;
                    margin: 10px;
                    padding: 0;
                }
                
                main, .container {
                    max-width: 800px;
                    margin: 2rem auto;
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                    padding: 2rem;
                }
                label {
                    font-weight: bold;
                    margin-bottom: 0.5rem;
                    margin-right: 0.5rem;
                    display: inline-block;
                }
                ${config.style || ''}
                </style>
            </head>
            <body>
                ${config.body}
                <script>
                    const sendValue = (path, value) => window.ipc.postMessage(JSON.stringify({ path, value }));
                    const inputs = document.querySelectorAll('input, textarea, select');
                    const values = {};
                    
                    inputs.forEach(input => {
                        const name = input.name || input.id;
                        const path = JSON.parse(atob(name));
                        if (!name || !path) return;
                        
                        switch (input.type) { 
                            case 'checkbox':
                            case 'radio':
                                input.addEventListener('change', () => sendValue(path, input.checked));
                                break;
                            default:
                                input.addEventListener('input', () => sendValue(path, input.value));
                        }
                    });
                </script>
            </body>
        </html>
        `, transparent: false, enableDevtools: true }, config.webviewOptions));
    if (!webview.isDevtoolsOpen() && ((_a = config.webviewOptions) === null || _a === void 0 ? void 0 : _a.openDevtools))
        webview.openDevtools();
    const localState = {};
    webview.onIpcMessage((data) => {
        var _a;
        if (isWorker) {
            (_a = process.send) === null || _a === void 0 ? void 0 : _a.call(process, data.body.toString('utf-8'));
        }
        else {
            // If running in main process, IPC won't work, so just save a local snapshot to be returned when the window closes.
            const { path, value } = JSON.parse(data.body.toString('utf-8'));
            let obj = localState;
            for (let i = 0; i < path.length; i++) {
                const key = path[i];
                if (i === path.length - 1) {
                    obj[key] = value;
                }
                else {
                    obj[key] = obj[key] || {};
                    obj = obj[key];
                }
            }
        }
    });
    if (!isWorker) {
        app.onEvent(evt => {
            console.log('APP EVENT:', evt);
            if (evt.event === 0) {
                window.setVisible(false);
            }
        });
    }
    // webview.evaluateScript(`onIpcMessage("test")`);
    try {
        app.run();
    }
    catch (err) {
        console.error('Error running webview application:', err);
    }
    return localState;
}
if (process.send) {
    startPanel();
}

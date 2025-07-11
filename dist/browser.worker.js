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
    const window = app.createBrowserWindow(Object.assign({ transparent: false, decorations: true, title: 'Configuration Panel', width: 350, height: 400 }, config.windowOptions));
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
                }
                .description {
                    font-size: 0.9rem;
                    color: #555;
                    margin-bottom: 0.5rem;
                    margin-top: 0;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 0;
                    padding: 0;
                }
                ${config.style || ''}
                </style>
            </head>
            <body>
                ${config.body}
                <script>
                    const inputs = document.querySelectorAll('input, textarea, select');
                    const values = {};
                    
                    const socket = new WebSocket("ws://localhost:${config.port}");
                    
                    socket.addEventListener("open", (event) => { console.log('WebSocket connected'); });
                    socket.addEventListener("close", (event) => document.body.innerHTML = '<h2>Connection lost. Please close this window.</h2>' );
                    socket.addEventListener("error", (event) => document.body.innerHTML = '<h2>Connection lost. Please close this window.</h2>' );
                    socket.addEventListener("message", (event) => {
                        const data = JSON.parse(event.data);
                        console.log("Message from server ", data);
                        if (data.error) {
                            document.getElementById('error-'+data.id).textContent = data.error;
                        }
                        if (data.ok) {
                            document.getElementById('error-'+data.ok).textContent = '';
                        }
                    });
                    
                    const sendValue = (path, value, id) => socket.send(JSON.stringify({ path, value, id }));
                    
                    inputs.forEach(input => {
                        const name = input.id;
                        const path = JSON.parse(atob(name));
                        if (!name || !path) return;
                        
                        switch (input.type) { 
                            case 'checkbox':
                            case 'radio':
                                input.addEventListener('change', () => sendValue(path, input.checked, name));
                                break;
                            default:
                                input.addEventListener('input', () => sendValue(path, input.value, name));
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

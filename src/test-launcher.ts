import { ConfigPanel, InputType } from "./main.ts";


// TODO: Swap to websocket communication instead of IPC, as the callbacks block on some platforms (Bun).
const testPanel = new ConfigPanel({
    test_cat: { displayName: 'Test Category', description: 'This is a test category' },
    cat_2: { displayName: 'Category Two' },
}, {
    test_cat: {
        text_string: {
            type: InputType.string().max(20).default('test-default'),
            displayName: 'Text String',
            description: 'A simple text string input',
        },
        test_number: {
            type: InputType.number().min(0).max(100).default(50),
            displayName: 'Test Number',
        },
        test_boolean: {
            type: InputType.boolean().default(false),
            displayName: 'Test Boolean',
            description: 'Check me out.'
        },
    },
    cat_2: {
        test_enum: {
            type: InputType.enum(["Salmon", "Tuna", "Trout"]).default('Tuna'),
            envName: 'FISH_TYPE',
        }
    }
});

testPanel.on('values', console.dir);
testPanel.on('error', console.error);
testPanel.on('exit', console.error);

await testPanel
    .fromJSON('.env.json', true)
    .fromEnvironment('test_')
    .startInterface({
        windowOptions: {
            title: 'Test Config Panel',
            width: 350,
            height: 320,
        },
        webviewOptions: {
            openDevtools: true,
        },
    });

const results = await testPanel.waitForClose();

console.log('Validated input config:', results);
console.log('IDE help test:', testPanel.values.cat_2.test_enum);
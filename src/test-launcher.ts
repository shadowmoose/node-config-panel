import { ConfigPanel, InputType } from "./main.ts";
import { z } from "zod";


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
            type: InputType.number().min(0).max(100),
            displayName: 'Test Number',
            customParser: (input: any) => {
                if (parseInt(input) % 2 !== 0) throw Error('Number must be even');
                return input;
            }
        },
        test_boolean: {
            type: InputType.boolean().default(false),
            displayName: 'Test Boolean',
            description: 'Check me out.',
        },
    },
    cat_2: {
        test_enum: {
            type: InputType.enum(["Salmon", "Tuna", "Trout"]).default('Tuna'),
            envName: 'FISH_TYPE',
        },
        complex_string_array: {
            type: z.string().transform(value => value.split(',')).pipe(z.string().array()),
            default: 'one,two,three',
            useZodTypeName: 'string',
        }
    }
});

testPanel.on('values', console.dir);
testPanel.on('error', console.error);
testPanel.on('exit', console.error);

testPanel.on('change.test_cat', data => console.log(data));
testPanel.on(testPanel.getChangeKey('test_cat', 'test_number'), data => console.log(data));

await testPanel
    .fromJSON('.env.json', true)
    .fromEnvironment('test_')
    .startInterface({
        windowOptions: {
            title: 'Test Config Panel',
            width: 350,
            height: 500,
        },
        webviewOptions: {
            openDevtools: false,
        },
        displayMethod: 'webview', // 'browser' | 'webview' | 'none'
        port: 0, // Use random available port.
        host: '0.0.0.0', // Allow remote access for configuration.
        htmlHeader: '<h1 style="text-align: center">Configuration Panel</h1>',
        htmlFooter: '<p style="font-size: small;text-align: center">Generated Panel Demo</p>',
    });

const results = await testPanel.waitForClose();

console.log('Validated input config:', results);
console.log('IDE help test:', testPanel.values.cat_2.complex_string_array);
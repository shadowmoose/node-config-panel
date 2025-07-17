import { ConfigPanel, InputType } from "./main.ts";
import { z } from "zod";


const conf = new ConfigPanel({
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
            type: z.string().transform(value => value.split(',')).pipe(z.string().trim().min(1).array()),
            default: 'one,two,three',
            useZodTypeName: 'string',
        }
    }
});

conf.on('values', console.dir);
conf.on('error', console.error);
conf.on('exit', console.error);

conf.on('change.test_cat', data => console.log(data));
conf.on(conf.key('test_cat', 'test_number'), data => console.log(data));
conf.on(conf.key('cat_2'), data => console.log(data));

await conf
    .load()
    .fromJSON({
        filePath: '.env.json',
        ignoreMissing: true,
    }).fromEnvironment({
        prefix: 'TEST_',
        envFile: '.env',
    }).startInterface({
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

const results = await conf.waitForClose();

console.log('Validated input config:', results);
console.log('IDE help test:', conf.values.cat_2.complex_string_array);
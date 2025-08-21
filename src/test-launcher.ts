import { ConfigPanel, Helpers, InputType } from "./main.ts";
import { z } from "zod";
import { clearInterval } from "node:timers";


const conf = new ConfigPanel({
    test_cat: { displayName: 'Test Category', description: 'This is a test category' },
    cat_2: { displayName: 'Category Two' },
    display_cat: { displayName: 'Display Category', displayHtml: 'Pending...' },
}, {
    test_cat: {
        text_string: {
            type: InputType.string().max(20).default('test-default'),
            displayName: 'Text String',
            description: 'A simple text string input',
        },
        test_number: {
            type: InputType.number().min(0).max(100).refine(value => value % 2 === 0, 'Number must be even'),
            default: 2,
            displayName: 'Test Number',
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
    },
    display_cat: {}
});

conf.on('values', console.dir);
conf.on('error', console.error);
conf.on('exit', console.error);

conf.on('change.test_cat', data => console.log(data));
conf.on(conf.key('test_cat', 'test_number'), data => console.log(data));
conf.on(conf.key('cat_2'), data => console.log(data));

let count = 0;
const timer = setInterval(() => {
    if (!conf.isRunning) return clearInterval(timer);
    conf.sendHTML(
        'display_cat',
        Helpers.objToTable({
            'Current Runtime': ++count,
            Second: 'value',
            'Date': new Date().toISOString(),
            'Config Values': '<pre>'+JSON.stringify(conf.values, null, 2)+'</pre>',
        }, [], false),
        // Also send a test script, which should not be executed.
        '<script> document.body.style.background = "black"; alert("Error") </script>'
    );
}, 1_000).unref();

await conf
    .load()
    .fromJSON({
        filePath: '.env.json',
        ignoreMissing: true,
    }).fromEnvironment({
        prefix: 'TEST_',
        envFile: '.env',
    }).startInterface({
        title: 'Test Config Panel',
        stayOpen: false,
        displayMethod: 'browser', // 'browser' | 'none'
        port: 0, // Use random available port.
        host: '0.0.0.0', // Allow remote access for configuration.
        htmlHeader: '<h1 style="text-align: center">Configuration Panel</h1>',
        htmlFooter: '<p style="font-size: small;text-align: center">Generated Panel Demo</p>',
    }, port => console.log(`Config panel running at http://localhost:${port}`));

const results = await conf.waitForClose();

console.log('Validated input config:', results);
console.log('IDE help test:', conf.values.cat_2.complex_string_array);
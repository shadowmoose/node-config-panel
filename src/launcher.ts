import { ConfigPanel, InputType } from "./main.ts";


const test = new ConfigPanel({
    test_cat: { displayName: 'Test Category', description: 'This is a test category' }
}, {
    test_cat: {
        text_string: {
            type: InputType.string().max(1000).default('test-default'),
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
    }
});

test.on('values', console.dir);
test.on('error', console.error);

void test
    .fromJson('.env.json', true)
    .fromEnvironment('test_')
    .startInterface({
        windowOptions: {
            title: 'Test Config Panel',
        }
    });

const results = await test.waitForClose();

console.log('Validated input config:', results);
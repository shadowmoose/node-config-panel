import { ConfigPanel, InputType } from "./main.ts";
import { z } from "zod";
import { after, describe, it, type TestContext } from 'node:test';
import * as fs from "node:fs";

// Manually configure environment and args for testing
process.env['FISH_TYPE'] = 'Trout';
process.env['test_cat_test_boolean'] = '0';
process.argv.push('--test-string=from-args1');
process.argv.push('-n', '42');


const conf = new ConfigPanel({
    test_cat: { displayName: 'Test Category', description: 'This is a test category' },
    cat_2: { displayName: 'Category Two' },
}, {
    test_cat: {
        text_string: {
            type: InputType.string().max(20).default('test-default'),
            displayName: 'Text String',
            description: 'A simple text string input',
            argName: 'test-string',
        },
        test_number: {
            type: InputType.number().min(0).max(100),
            displayName: 'Test Number',
            argName: 'test-number',
            argShort: 'n',
            customParser: (input: any) => {
                if (parseInt(input) % 2 !== 0) throw Error('Number must be even');
                return input;
            }
        },
        test_boolean: {
            type: z.stringbool(),
            default: 'true',
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
            default: 'one, two ,three',
            useZodTypeName: 'string',
        }
    }
}).load();

const values = conf.values;

describe('Happy Path Tests', () => {
    after(() => {
        if (fs.existsSync('test.env.json')) fs.unlinkSync('test.env.json');
    });

    it('Values Load', (t: TestContext) => {
        t.assert.ok(conf.values, 'Values should be defined after loading from sources');
    });

    it('Complex parsing functions', (t: TestContext) => {
        t.assert.ok(Array.isArray(values.cat_2.complex_string_array), 'Should be an array' );
        t.assert.deepEqual(values.cat_2.complex_string_array, ['one', 'two', 'three'], 'Array should match expected values' );
    });

    it('Environmental boolean parsed', (t: TestContext) => {
        t.assert.equal(values.test_cat.test_boolean, false, 'Boolean should be false' );
    });

    it('Saving and Loading env files', ({ assert }) => {
        conf.setRaw('cat_2', 'test_enum', 'Salmon');
        conf.toJSON('test.env.json');
        conf.fromJSON({ filePath: 'test.env.json' });
        assert.equal(conf.values.cat_2.test_enum, 'Salmon', 'Reassigned enum should have changed.' );
    });

    it('Values reference stays valid', ({ assert }) => {
        const values = conf.values;
        const testCat = values.test_cat;
        const newValue = `${Date.now()}`;
        conf.set('test_cat', 'text_string', newValue);
        assert.equal(values.test_cat.text_string, newValue, 'Reference to values was clobbered!' );
        assert.equal(testCat.text_string, newValue, 'Reference to category was clobbered!' );
    });
})

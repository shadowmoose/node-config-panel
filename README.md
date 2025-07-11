# Config Panel
This is the initial push of my personal configuration GUI, used primarily for rapid development of desktop Node/Bun apps.

This library provides a visual configuration panel, working cross-platform via native webviews, 
in order to expose real-time configuration options to users in a friendly way.

All configuration values are strongly types, and validated before being accepted.
The panel can load/save from JSON files and environment variables, and can be extended to support other formats.

[![screenshot](docs/screenshot.png)](docs/screenshot.png)

> **Note:**  
> This is an early release, and the API may change in future versions.

## Example Usage
```typescript
import { ConfigPanel, InputType } from "@shadowmoose/config";


const testPanel = new ConfigPanel({
    // Define categories.
    test_category: { displayName: 'Test Category', description: 'This is a test category' },
    cat_2: { displayName: 'Category Two' },
}, {
    // Define all config inputs, within each category.
    test_category: {
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
            displayName: 'Test Enum',
        }
    }
});

// Example event listeners for real-time feedback.
testPanel.on('values', console.dir); // Listen for any changes to values.
testPanel.on('change.test_category.test_boolean', console.dir); // Listen for changes to a specific value.
testPanel.on('change.test_category', console.dir); // Listen for changes to values within a specific category.
testPanel.on('error', console.error); // Listen for any errors that occur.
testPanel.on('exit', console.error); // Listen for when the panel is closed.

// Load existing config from a JSON file and environment variables, then start the interface.
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
            openDevtools: false, // Example option to open devtools on start.
        },
        // Custom CSS to apply to the panel. Everything has a simple class name to make this easy.
        style: '.category_title { color: blue; } .wrapper_test_category { background: #f0f0f0 !important; }',
    });

// Example: save updated config to a JSON file.
testPanel.toJSON('.env.json');
// Example: accessing current valid config values live, without waiting.
console.log(testPanel.values);
/*
Output: {
    test_category: {
        text_string: string
        test_number: number
        test_boolean: boolean
    }
    cat_2: {
        test_enum: "Salmon" | "Tuna" | "Trout"
    }
}
 */

// Wait for the panel to be closed, and save the results to a variable.
const results = await testPanel.waitForClose();
console.log('Configured enum value:', results.cat_2.test_enum);
```
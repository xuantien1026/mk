// Simulates ExtendScript's #include by running .jsx files in a shared vm context.
// Load order matters exactly as it does with #include — names before validate, etc.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '../..');

function createEnv() {
    const context = vm.createContext({});

    function include(relPath) {
        const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
        vm.runInContext(code, context);
    }

    return { context, include };
}

module.exports = { createEnv };

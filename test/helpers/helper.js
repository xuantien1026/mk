// Shared setup for the validate.jsx test suites. Simulates ExtendScript's
// #include by running .jsx files in a shared vm context (load order matters
// exactly as it does with #include — names before validate, etc.), then builds
// fake documents to validate.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '../..');

function makeEnv() {
    const context = vm.createContext({});

    function include(relPath) {
        const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
        vm.runInContext(code, context);
    }

    include('lib/names.jsx');
    include('lib/validate.jsx');
    return context;
}

function makeDoc(names) {
    return { pageItems: names.map(function (n) { return { name: n }; }) };
}

// Loads the pure print-command parsing helpers (no names.jsx dependency).
function makePrintEnv() {
    const context = vm.createContext({});
    const code = fs.readFileSync(path.join(ROOT, 'lib/print_command.jsx'), 'utf8');
    vm.runInContext(code, context);
    return context;
}

module.exports = { makeEnv, makeDoc, makePrintEnv };

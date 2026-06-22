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

// Each entry may be a string (a valid part with sensible default bounds) or an
// object { name, geometricBounds?, typename?, pageItems? } to model degenerate or
// grouped parts for the bounds check. Default bounds [0,10,10,0] => 10x10, valid.
function makeDoc(names) {
    return {
        pageItems: names.map(function (entry) {
            if (typeof entry === 'string') entry = { name: entry };
            var item = {
                name:            entry.name,
                typename:        entry.typename || 'PathItem',
                geometricBounds: entry.geometricBounds || [0, 10, 10, 0]
            };
            if (entry.pageItems) item.pageItems = entry.pageItems;
            return item;
        })
    };
}

// Loads the pure print-command parsing helpers (no names.jsx dependency).
function makePrintEnv() {
    const context = vm.createContext({});
    const code = fs.readFileSync(path.join(ROOT, 'lib/print_command.jsx'), 'utf8');
    vm.runInContext(code, context);
    return context;
}

// Loads the shared Illustrator helpers (lib/utils.jsx) in isolation — they only
// traverse the DOM-shaped objects passed to them, so fake page items suffice.
function makeUtilsEnv() {
    const context = vm.createContext({});
    const code = fs.readFileSync(path.join(ROOT, 'lib/utils.jsx'), 'utf8');
    vm.runInContext(code, context);
    return context;
}

// Build a fake TextFrame page item. strokeColorType 'NoColor' models an unstroked
// glyph; any other value (e.g. 'CMYKColor') models a visible border.
function textFrame(name, strokeWeight, strokeColorType) {
    return {
        name:     name,
        typename: 'TextFrame',
        textRange: {
            characterAttributes: {
                strokeColor:  { typename: strokeColorType || 'NoColor' },
                strokeWeight: strokeWeight
            }
        }
    };
}

// Build a fake GroupItem wrapping child page items.
function groupItem(name, children) {
    return { name: name, typename: 'GroupItem', pageItems: children };
}

// Build a fake container (document/group) exposing a pageItems collection.
function container(children) {
    return { pageItems: children };
}

module.exports = { makeEnv, makeDoc, makePrintEnv, makeUtilsEnv, textFrame, groupItem, container };

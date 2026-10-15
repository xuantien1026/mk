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

// Document collection that holds each typename (Document.pathItems, .groupItems, …).
var COLLECTION_BY_TYPE = {
    GroupItem: 'groupItems', PathItem: 'pathItems', CompoundPathItem: 'compoundPathItems',
    TextFrame: 'textFrames', PlacedItem: 'placedItems', RasterItem: 'rasterItems',
    SymbolItem: 'symbolItems', MeshItem: 'meshItems', PluginItem: 'pluginItems',
    GraphItem: 'graphItems', LegacyTextItem: 'legacyTextItems', NonNativeItem: 'nonNativeItems'
};

// Fake Illustrator collection: an array with a getByName that throws when absent.
function collection(items) {
    var c = items.slice();
    c.getByName = function (name) {
        for (var i = 0; i < c.length; i++) if (c[i].name === name) return c[i];
        throw new Error('No such element');
    };
    return c;
}

// Each entry may be a string (a valid part with sensible default bounds) or an
// object { name, geometricBounds?, typename?, pageItems? } to model degenerate or
// grouped parts for the bounds check. Default bounds [0,10,10,0] => 10x10, valid.
// The entries become the top-level items of the document's single layer; like
// Illustrator, the document's typed collections (pathItems, groupItems, …) are
// flattened and include items nested inside groups.
function makeDoc(names) {
    var topLevel = names.map(function (entry) {
        if (typeof entry === 'string') entry = { name: entry };
        var item = {
            name:            entry.name,
            typename:        entry.typename || 'PathItem',
            geometricBounds: entry.geometricBounds || [0, 10, 10, 0]
        };
        if (entry.pageItems) item.pageItems = entry.pageItems;
        return item;
    });

    var all = [];
    (function flatten(items) {
        for (var i = 0; i < items.length; i++) {
            all.push(items[i]);
            if (items[i].pageItems) flatten(items[i].pageItems);
        }
    })(topLevel);

    var doc = {
        layers: [{ pageItems: collection(topLevel), layers: [] }],
        pageItems: collection(all)
    };
    for (var type in COLLECTION_BY_TYPE) {
        doc[COLLECTION_BY_TYPE[type]] = collection(all.filter(function (it) {
            return (it.typename || 'PathItem') === type;
        }));
    }
    return doc;
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

// Loads the pure print-sheet layout (lib/sheet_layout.jsx) and the layout engines, with
// their PT_PER_MM dependency from config.jsx. Override SHEET_* globals on the returned
// context to test other layouts — the functions read them at call time.
function makeSheetEnv() {
    const context = vm.createContext({});
    for (const rel of ['lib/config.jsx', 'lib/sheet_layout.jsx', 'lib/layout_sequential.jsx']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context);
    }
    return context;
}

// Build a fake GroupItem wrapping child page items.
function groupItem(name, children) {
    return { name: name, typename: 'GroupItem', pageItems: children };
}

// Build a fake container (document/group) exposing a pageItems collection.
function container(children) {
    return { pageItems: children };
}

module.exports = { makeEnv, makeDoc, makePrintEnv, makeUtilsEnv, makeSheetEnv, groupItem, container };

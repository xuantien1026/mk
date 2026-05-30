#target illustrator

var SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

var PT_PER_MM = 2.83465;

// Shape type identifiers — must match the naming convention in the outline .ai files
var FRONT  = 'TRUOC';

// -------------------------------------------------------
// Database: load shapes_db.json from the script's folder
// Format: { "DisplayName": { "path": "...", "BACK": [...], "FRONT": [...], "SLEEVE": [...] } }
// -------------------------------------------------------
function loadDatabase() {
    var dbFile = new File($.fileName.replace(/[^\/\\]+$/, 'shapes_db.json'));
    if (!dbFile.exists) throw new Error('shapes_db.json not found next to the script.');
    dbFile.open('r');
    var content = dbFile.read();
    dbFile.close();
    return eval('(' + content + ')');
}

// -------------------------------------------------------
// Dialog: pick outline file, shape variants, and sizes — all in one
// -------------------------------------------------------
function selectOptions(db) {
    var fileNames = [];
    for (var key in db) fileNames.push(key);
    if (fileNames.length === 0) throw new Error('shapes_db.json contains no entries.');

    var TYPES = ['BACK', FRONT, 'SLEEVE'];

    var dlg = new Window('dialog', 'Step 1 — Resize Options');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    // File selector
    var fileRow = dlg.add('group');
    fileRow.orientation = 'row';
    var fileLbl = fileRow.add('statictext', undefined, 'Outline file:');
    fileLbl.preferredSize = [80, 20];
    var fileDropdown = fileRow.add('dropdownlist', undefined, fileNames);
    fileDropdown.preferredSize = [220, 20];
    fileDropdown.selection = 0;

    // Variant dropdowns (one per type)
    var variantRows      = {};
    var variantDropdowns = {};
    for (var t = 0; t < TYPES.length; t++) {
        var type     = TYPES[t];
        var variants = db[fileNames[0]][type] || [];
        var row      = dlg.add('group');
        row.orientation = 'row';
        var lbl = row.add('statictext', undefined, type + ':');
        lbl.preferredSize = [80, 20];
        var dd = row.add('dropdownlist', undefined, variants);
        dd.preferredSize = [220, 20];
        if (variants.length > 0) dd.selection = 0;
        row.visible      = variants.length > 0;
        variantRows[type]      = row;
        variantDropdowns[type] = dd;
    }

    // Refresh variant dropdowns when the file selection changes
    function refreshVariants() {
        var entry = db[fileDropdown.selection.text];
        for (var t = 0; t < TYPES.length; t++) {
            var type     = TYPES[t];
            var variants = entry[type] || [];
            var dd       = variantDropdowns[type];
            dd.removeAll();
            for (var i = 0; i < variants.length; i++) dd.add('item', variants[i]);
            if (variants.length > 0) dd.selection = 0;
            variantRows[type].visible = variants.length > 0;
        }
    }
    fileDropdown.onChange = refreshVariants;

    // Size checkboxes
    var sizesPanel = dlg.add('panel', undefined, 'Sizes to prepare');
    sizesPanel.orientation = 'row';
    var checks = {};
    for (var i = 0; i < SIZES.length; i++) {
        checks[SIZES[i]] = sizesPanel.add('checkbox', undefined, SIZES[i]);
    }

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;

    var selectedSizes = [];
    for (var i = 0; i < SIZES.length; i++) {
        if (checks[SIZES[i]].value) selectedSizes.push(SIZES[i]);
    }
    if (selectedSizes.length === 0) { alert('No sizes selected.'); return null; }

    var selectedEntry = db[fileDropdown.selection.text];
    var variants = {};
    for (var t = 0; t < TYPES.length; t++) {
        var sel = variantDropdowns[TYPES[t]].selection;
        variants[TYPES[t]] = sel ? sel.text : null;
    }

    return {
        file:     new File(selectedEntry.path),
        variants: variants,   // e.g. { BACK: 'SHAPE1', FRONT: 'SHAPE1', SLEEVE: 'SHAPE1' }
        sizes:    selectedSizes
    };
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function requireItem(collection, name, fileName) {
    try {
        return collection.getByName(name);
    } catch (e) {
        throw new Error('Khong tim thay "' + name + '" trong file ' + fileName);
    }
}

function copyItemToDoc(itemName, fromDoc, toDoc) {
    var item = requireItem(fromDoc.pageItems, itemName, fromDoc.name);
    var savedName = item.name;
    var destLayer = toDoc.layers[0];
    var wasLocked = destLayer.locked;
    destLayer.locked = false;
    var copy = item.duplicate(destLayer, ElementPlacement.PLACEATEND);
    destLayer.locked = wasLocked;
    item.name = savedName;
    return copy;
}

function findItemByName(container, name) {
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) return item;
        if (item.typename === 'GroupItem') {
            var found = findItemByName(item, name);
            if (found) return found;
        }
    }
    return null;
}

function findAllItemsByName(container, name, results) {
    if (!results) results = [];
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) results.push(item);
        if (item.typename === 'GroupItem') findAllItemsByName(item, name, results);
    }
    return results;
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var db = loadDatabase();

    var options = selectOptions(db);
    if (!options) return;

    var mainDoc = app.activeDocument;
    if (!options.file.exists) {
        throw new Error('Khong tim thay file: ' + options.file.fsName);
    }
    var sourceDoc = app.open(options.file);

    // Output goes to a brand-new document, not a layer in the design file.
    // The artboard is made large (and we anchor to its top) so the vertical stack
    // stays above Illustrator's pasteboard coordinate limit for all sizes.
    var OUT_W = 575 * 10 * PT_PER_MM; // 575 cm — near Illustrator's max artboard size
    var OUT_H = 575 * 10 * PT_PER_MM; // 575 cm — near Illustrator's max artboard size
    var outDoc = app.documents.add(mainDoc.documentColorSpace, OUT_W, OUT_H);
    outDoc.artboards[0].artboardRect = [0, OUT_H, OUT_W, 0];

    var outputLayer = outDoc.layers[0];
    outputLayer.name = 'SIZED_OUTPUT';

    var backShapes = {}, frontShapes = {}, sleeveShapes = {};
    for (var s = 0; s < options.sizes.length; s++) {
        var sz = options.sizes[s];
        function shapeName(sz, type, variant) {
            return variant ? sz + '_' + type + '_' + variant : sz + '_' + type;
        }
        backShapes[sz]        = copyItemToDoc(shapeName(sz, 'BACK',   options.variants.BACK),   sourceDoc, outDoc);
        backShapes[sz].name   = sz + '_BACK_SHAPE';
        frontShapes[sz]       = copyItemToDoc(shapeName(sz, FRONT,    options.variants[FRONT]), sourceDoc, outDoc);
        frontShapes[sz].name  = sz + '_FRONT_SHAPE';
        sleeveShapes[sz]      = copyItemToDoc(shapeName(sz, 'SLEEVE', options.variants.SLEEVE), sourceDoc, outDoc);
        sleeveShapes[sz].name = sz + '_SLEEVE_SHAPE';
    }

    sourceDoc.close(SaveOptions.DONOTSAVECHANGES);

    var backDesign  = requireItem(mainDoc.pageItems, 'BACK_DESIGN',  mainDoc.name);
    var frontDesign = requireItem(mainDoc.pageItems, 'FRONT_DESIGN', mainDoc.name);
    var leftSleeve  = requireItem(mainDoc.pageItems, 'LEFT_SLEEVE',  mainDoc.name);
    var rightSleeve = requireItem(mainDoc.pageItems, 'RIGHT_SLEEVE', mainDoc.name);

    // side: 'FRONT' | 'BACK' | null (sleeve)
    function resizeAndMask(design, maskShape, instanceName, sizeName, side) {
        var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        designCopy.name = instanceName + '_DESIGN';

        // Extract SIZE elements before scaling so their size is preserved
        var sizeFields = [];
        if (side !== null) {
            var allSizeItems = findAllItemsByName(designCopy, 'SIZE');
            for (var i = 0; i < allSizeItems.length; i++) {
                if (allSizeItems[i].typename === 'TextFrame') {
                    allSizeItems[i].contents = sizeName;
                    allSizeItems[i].move(outputLayer, ElementPlacement.PLACEATEND);
                    sizeFields.push(allSizeItems[i]);
                }
            }
        }

        var boundingPath = (designCopy.typename === 'GroupItem' && designCopy.clipped && designCopy.pageItems.length > 0)
            ? designCopy.pageItems[0]
            : designCopy;

        var preBounds = boundingPath.geometricBounds;
        var visibleW  = preBounds[2] - preBounds[0];
        var visibleH  = preBounds[1] - preBounds[3];

        var scaleX = (maskShape.width  / visibleW) * 100;
        var scaleY = (maskShape.height / visibleH) * 100;
        var scale  = Math.max(scaleX, scaleY);
        designCopy.resize(scale, scale, true, true, true, true, true, Transformation.CENTER);

        var postBounds  = boundingPath.geometricBounds;
        var visCenterX  = (postBounds[0] + postBounds[2]) / 2;
        var visCenterY  = (postBounds[1] + postBounds[3]) / 2;
        var maskCenterX = maskShape.position[0] + maskShape.width  / 2;
        var maskCenterY = maskShape.position[1] - maskShape.height / 2;
        designCopy.position = [
            designCopy.position[0] + (maskCenterX - visCenterX),
            designCopy.position[1] + (maskCenterY - visCenterY)
        ];

        var clipPath  = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        var clipGroup = outputLayer.groupItems.add();
        clipGroup.name = instanceName + '_FINAL';

        designCopy.move(clipGroup, ElementPlacement.PLACEATEND);
        clipPath.move(clipGroup, ElementPlacement.PLACEATBEGINNING);
        clipGroup.clipped = true;

        // Position SIZE elements at fixed offsets from mask edges
        var maskBottom = maskShape.position[1] - maskShape.height;
        for (var i = 0; i < sizeFields.length; i++) {
            var sf       = sizeFields[i];
            var sfBounds = sf.geometricBounds;
            var sfY = sf.position[1] + (maskBottom - sfBounds[3]);
            var sfX = (side === 'FRONT')
                ? sf.position[0] + (maskShape.position[0] + maskShape.width - 20 * PT_PER_MM - sfBounds[2])
                : sf.position[0] + (maskShape.position[0] + 20 * PT_PER_MM - sfBounds[0]);
            sf.position = [sfX, sfY];
            sf.move(designCopy, ElementPlacement.PLACEBEFORE);
        }

        var outlineShape = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        outlineShape.name = instanceName + '_OUTLINE';
        outlineShape.move(clipGroup, ElementPlacement.PLACEBEFORE);

        return clipGroup;
    }

    // A clipped group's geometricBounds (and .width/.height) INCLUDE the artwork
    // hidden by the mask — Illustrator does not clip the reported bounds. The clip
    // path (pageItems[0]) defines the true visible extent, so read it for sizing.
    function visBounds(group) {
        var p = (group.typename === 'GroupItem' && group.clipped && group.pageItems.length > 0)
            ? group.pageItems[0]
            : group;
        var b = p.geometricBounds; // [left, top, right, bottom]
        return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
    }

    // Move a clip group so its VISIBLE top-left lands at (newX, newY); the matching
    // _OUTLINE is shifted by the same delta.
    function moveWithOutline(group, newX, newY) {
        var vb = visBounds(group);
        var deltaX = newX - vb.left;
        var deltaY = newY - vb.top;
        group.position = [group.position[0] + deltaX, group.position[1] + deltaY];
        var outline = outDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
        outline.position = [outline.position[0] + deltaX, outline.position[1] + deltaY];
    }

    var bgWidth    = 1.6 * 1000 * PT_PER_MM;
    var padding    = 40;
    var spacing    = 40;
    // Anchor the output to the top edge of the output artboard so the vertical stack
    // has maximum room before hitting Illustrator's pasteboard coordinate limit (the
    // point where geometry gets clamped, which corrupts the lower sizes).
    var bgLeft     = outDoc.artboards[0].artboardRect[0];
    var bgTop      = outDoc.artboards[0].artboardRect[1];
    var currentTop = bgTop;

    for (var s = 0; s < options.sizes.length; s++) {
        var sz = options.sizes[s];

        var backGrp     = resizeAndMask(backDesign,  backShapes[sz],   sz + '_BACK',         sz, 'BACK');
        var frontGrp    = resizeAndMask(frontDesign, frontShapes[sz],  sz + '_FRONT',        sz, 'FRONT');
        var leftSlvGrp  = resizeAndMask(leftSleeve,  sleeveShapes[sz], sz + '_LEFT_SLEEVE',  sz, null);
        var rightSlvGrp = resizeAndMask(rightSleeve, sleeveShapes[sz], sz + '_RIGHT_SLEEVE', sz, null);

        var frontVB = visBounds(frontGrp), backVB = visBounds(backGrp);
        var lSlvVB  = visBounds(leftSlvGrp), rSlvVB = visBounds(rightSlvGrp);

        var sleeveColHeight = lSlvVB.height + spacing + rSlvVB.height;
        var sleeveColWidth  = Math.max(lSlvVB.width, rSlvVB.width);
        var rowHeight       = Math.max(frontVB.height, backVB.height, sleeveColHeight) + padding * 2;
        var totalRowWidth   = frontVB.width + spacing + backVB.width + spacing + sleeveColWidth;
        var startX          = bgLeft + (bgWidth - totalRowWidth) / 2;
        var sleeveColX      = startX + frontVB.width + spacing + backVB.width + spacing;
        var sleeveColTop    = currentTop - (rowHeight - sleeveColHeight) / 2;

        moveWithOutline(frontGrp,    startX,                                       currentTop - (rowHeight - frontVB.height) / 2);
        moveWithOutline(backGrp,     startX + frontVB.width + spacing,             currentTop - (rowHeight - backVB.height)  / 2);
        moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColWidth - lSlvVB.width) / 2, sleeveColTop);
        moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColWidth - rSlvVB.width) / 2, sleeveColTop - lSlvVB.height - spacing);

        currentTop -= rowHeight;

        backShapes[sz].remove();
        frontShapes[sz].remove();
        sleeveShapes[sz].remove();
    }

    app.activeDocument = outDoc;
    // Show the transparency grid so the artboard reads as an empty/transparent
    // background instead of solid white.
    try { app.executeMenuCommand('TransparencyGrid'); } catch (e) {}
    alert('Done! ' + options.sizes.length + ' size(s) prepared in a new document (layer "SIZED_OUTPUT").\nMake manual adjustments and save, then run apply_names.jsx on it.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}

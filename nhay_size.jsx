#target illustrator
#include "lib/quy_uoc_ten.jsx"
#include "lib/cau_hinh.jsx"

var PT_PER_MM = 2.83465;

// Thrown when the user cancels a dialog — the outer catch ends the script silently.
function CancelledError() {
    this.name    = 'CancelledError';
    this.message = 'User cancelled.';
}
CancelledError.prototype = new Error();

// Shape type identifiers — must match the naming convention in the outline .ai files
var BACK   = 'SAU';
var FRONT  = 'TRUOC';
var SLEEVE = 'TAY';
var PANT   = 'QUAN';

// SIZE label layout
var SIZE_GLYPH_HEIGHT = 2 * PT_PER_MM;  // visible glyphs scaled to exactly 2mm tall
var SIZE_BOTTOM_GAP   = 1 * PT_PER_MM;  // glyph bottom sits 1mm above the design bottom edge
var SIZE_SIDE_INSET   = 20 * PT_PER_MM; // horizontal inset from the near mask edge

// -------------------------------------------------------
// Outline files: discovered from the file_rap folder next to the script.
// No config file — the available styles are parsed straight from each .ai's item
// names, which follow the {size}_{position}_{style} convention (see HDSD.md).
// -------------------------------------------------------
var OUTLINE_FOLDER = new File($.fileName).parent.fsName + '/file_rap';

function contains(arr, value) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
    return false;
}

// List every .ai file in the outline folder.
function loadOutlineFiles() {
    var folder = new Folder(OUTLINE_FOLDER);
    if (!folder.exists) throw new Error('Khong tim thay thu muc: ' + folder.fsName);
    var files = folder.getFiles(function (f) {
        return (f instanceof File) && /\.ai$/i.test(f.name);
    });
    if (files.length === 0) throw new Error('Khong co file .ai nao trong thu muc: ' + folder.fsName);
    files.sort();
    return files;
}

// If an item name matches {size}_{position}_{style}, record its style under that position.
function recordVariant(name, variants) {
    if (!name) return;
    var parts = name.split('_');
    if (parts.length < 3) return;              // no style component (e.g. plain "L_SAU")
    var size     = parts[0];
    var position = parts[1];
    var style    = parts.slice(2).join('_');   // style may itself contain underscores
    if (!variants.hasOwnProperty(position)) return; // not a known position
    if (!contains(SIZES, size)) return;             // not a known size
    if (!contains(variants[position], style)) variants[position].push(style);
}

// Open an outline file and collect the distinct style variants per position.
function discoverVariants(file) {
    var variants = {};
    variants[BACK] = []; variants[FRONT] = []; variants[SLEEVE] = []; variants[PANT] = [];
    var doc = app.open(file);
    for (var i = 0; i < doc.pageItems.length; i++) {
        recordVariant(doc.pageItems[i].name, variants);
    }
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return variants;
}

// -------------------------------------------------------
// Dialog: pick outline file, shape variants, and sizes — all in one
// -------------------------------------------------------
function selectOptions() {
    var files = loadOutlineFiles();

    // Pre-scan each file once so the dialog never has to open documents while it is
    // modal. Display name = file name without the .ai extension.
    var fileNames      = [];
    var variantsByPath = {};
    for (var f = 0; f < files.length; f++) {
        fileNames.push(decodeURI(files[f].name).replace(/\.ai$/i, ''));
        variantsByPath[files[f].fsName] = discoverVariants(files[f]);
    }

    var TYPES = [BACK, FRONT, SLEEVE, PANT];

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

    function variantsForSelection() {
        return variantsByPath[files[fileDropdown.selection.index].fsName];
    }

    // Variant dropdowns (one per type)
    var variantRows      = {};
    var variantDropdowns = {};
    var initialVariants  = variantsForSelection();
    for (var t = 0; t < TYPES.length; t++) {
        var type     = TYPES[t];
        var variants = initialVariants[type] || [];
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
        var entry = variantsForSelection();
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

    if (dlg.show() !== 1) throw new CancelledError();

    var selectedSizes = [];
    for (var i = 0; i < SIZES.length; i++) {
        if (checks[SIZES[i]].value) selectedSizes.push(SIZES[i]);
    }
    if (selectedSizes.length === 0) throw new Error('Chua chon size nao.');

    var variants = {};
    for (var t = 0; t < TYPES.length; t++) {
        var sel = variantDropdowns[TYPES[t]].selection;
        variants[TYPES[t]] = sel ? sel.text : null;
    }

    return {
        file:     files[fileDropdown.selection.index],
        variants: variants,
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

// TextFrame.geometricBounds extends to the font's descender line, not the actual
// glyph ink. Outline a throwaway copy to measure the true extent of the visible
// glyphs. Returns [left, top, right, bottom].
function glyphBounds(textFrame) {
    var dup      = textFrame.duplicate();
    var outlined = dup.createOutline();
    var b        = outlined.geometricBounds;
    outlined.remove();
    return b;
}

// Pull the SIZE text frames out of the design BEFORE it gets scaled (so their own
// size is preserved), stamp them with the size label, and park them on parkLayer.
function extractSizeLabels(designCopy, sizeName, parkLayer) {
    var labels = [];
    var items  = findAllItemsByName(designCopy, SIZE);
    for (var i = 0; i < items.length; i++) {
        if (items[i].typename === 'TextFrame') {
            items[i].contents = sizeName;
            items[i].move(parkLayer, ElementPlacement.PLACEATEND);
            labels.push(items[i]);
        }
    }
    return labels;
}

// Scale one SIZE label to SIZE_GLYPH_HEIGHT and place its glyph bottom SIZE_BOTTOM_GAP
// above the design's bottom edge, inset SIZE_SIDE_INSET from the near side, then tuck
// it back in front of the design.
function placeSizeLabel(label, maskShape, side, designCopy) {
    var gb     = glyphBounds(label);
    var glyphH = gb[1] - gb[3];
    if (glyphH > 0) {
        var s = (SIZE_GLYPH_HEIGHT / glyphH) * 100;
        label.resize(s, s, true, true, true, true, true, Transformation.CENTER);
    }

    var maskBottom = maskShape.position[1] - maskShape.height;
    var bounds     = label.geometricBounds;
    var newY = label.position[1] + (maskBottom + SIZE_BOTTOM_GAP - glyphBounds(label)[3]);
    var newX = (side === 'FRONT')
        ? label.position[0] + (maskShape.position[0] + maskShape.width - SIZE_SIDE_INSET - bounds[2])
        : label.position[0] + (maskShape.position[0] + SIZE_SIDE_INSET - bounds[0]);
    label.position = [newX, newY];
    label.move(designCopy, ElementPlacement.PLACEBEFORE);
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var options = selectOptions();

    var mainDoc   = app.activeDocument;
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

    var backShapes = {}, frontShapes = {}, sleeveShapes = {}, pantShapes = {};
    for (var s = 0; s < options.sizes.length; s++) {
        var sz = options.sizes[s];
        function shapeName(sz, type, variant) {
            return variant ? sz + '_' + type + '_' + variant : sz + '_' + type;
        }
        backShapes[sz]        = copyItemToDoc(shapeName(sz, BACK,   options.variants[BACK]),   sourceDoc, outDoc);
        backShapes[sz].name   = sz + '_BACK_SHAPE';
        frontShapes[sz]       = copyItemToDoc(shapeName(sz, FRONT,  options.variants[FRONT]),  sourceDoc, outDoc);
        frontShapes[sz].name  = sz + '_FRONT_SHAPE';
        sleeveShapes[sz]      = copyItemToDoc(shapeName(sz, SLEEVE, options.variants[SLEEVE]), sourceDoc, outDoc);
        sleeveShapes[sz].name = sz + '_SLEEVE_SHAPE';
        pantShapes[sz]        = copyItemToDoc(shapeName(sz, PANT,   options.variants[PANT]),   sourceDoc, outDoc);
        pantShapes[sz].name   = sz + '_PANT_SHAPE';
    }

    sourceDoc.close(SaveOptions.DONOTSAVECHANGES);

    var frontDesign  = requireItem(mainDoc.pageItems, THAN_TRUOC, mainDoc.name);
    var backDesign = requireItem(mainDoc.pageItems, THAN_SAU,   mainDoc.name);
    var leftSleeve  = requireItem(mainDoc.pageItems, TAY_TRAI,   mainDoc.name);
    var rightSleeve = requireItem(mainDoc.pageItems, TAY_PHAI,   mainDoc.name);
    var leftPant    = requireItem(mainDoc.pageItems, QUAN_TRAI,  mainDoc.name);
    var rightPant   = requireItem(mainDoc.pageItems, QUAN_PHAI,  mainDoc.name);

    // side: 'FRONT' | 'BACK' | null (sleeve)
    function resizeAndMask(design, maskShape, instanceName, sizeName, side) {
        var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        designCopy.name = instanceName + '_DESIGN';

        // Extract SIZE labels before scaling so their own size is preserved
        var sizeLabels = (side !== null) ? extractSizeLabels(designCopy, sizeName, outputLayer) : [];

        // Convention: the last element of every design group is its bounding path
        // (a normal path or a clip path) defining the intended fit extent. Measure that,
        // not the whole group — so artwork that overflows the bounds (side bleed, stray
        // elements) doesn't distort the scale.
        var boundingPath = (designCopy.typename === 'GroupItem' && designCopy.pageItems.length > 0)
            ? designCopy.pageItems[designCopy.pageItems.length - 1]
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

        // Scale and position the SIZE labels relative to the masked design
        for (var i = 0; i < sizeLabels.length; i++) {
            placeSizeLabel(sizeLabels[i], maskShape, side, designCopy);
        }

        var outlineShape = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        outlineShape.name = instanceName + '_OUTLINE';

        // Keep each part-instance's _OUTLINE and _FINAL together as a single group in
        // the SIZED_OUTPUT layer, so they read as one unit and can be selected/moved
        // together. Outline stays on top (PLACEATBEGINNING), final below.
        var instanceGroup = outputLayer.groupItems.add();
        instanceGroup.name = instanceName;
        outlineShape.move(instanceGroup, ElementPlacement.PLACEATBEGINNING);
        clipGroup.move(instanceGroup, ElementPlacement.PLACEATEND);

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
        // The outline file holds only the LEFT sleeve shape — mirror it (negative X
        // scale) for the right sleeve.
        var sleeveShapeR = sleeveShapes[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
        sleeveShapeR.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
        var leftSlvGrp  = resizeAndMask(leftSleeve,  sleeveShapes[sz], sz + '_LEFT_SLEEVE',  sz, null);
        var rightSlvGrp = resizeAndMask(rightSleeve, sleeveShapeR,     sz + '_RIGHT_SLEEVE', sz, null);

        // The outline file holds only the LEFT pant shape — mirror it (negative X scale)
        // for the right pant.
        var pantShapeR = pantShapes[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
        pantShapeR.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
        var leftPantGrp  = resizeAndMask(leftPant,  pantShapes[sz], sz + '_LEFT_PANT',  sz, null);
        var rightPantGrp = resizeAndMask(rightPant, pantShapeR,     sz + '_RIGHT_PANT', sz, null);

        var frontVB = visBounds(frontGrp), backVB = visBounds(backGrp);
        var lSlvVB  = visBounds(leftSlvGrp), rSlvVB = visBounds(rightSlvGrp);
        var lPntVB  = visBounds(leftPantGrp), rPntVB = visBounds(rightPantGrp);

        var sleeveColHeight = lSlvVB.height + spacing + rSlvVB.height;
        var sleeveColWidth  = Math.max(lSlvVB.width, rSlvVB.width);
        var pantColHeight   = lPntVB.height + spacing + rPntVB.height;
        var pantColWidth    = Math.max(lPntVB.width, rPntVB.width);
        var rowHeight       = Math.max(frontVB.height, backVB.height, sleeveColHeight, pantColHeight) + padding * 2;
        var totalRowWidth   = frontVB.width + spacing + backVB.width + spacing + sleeveColWidth + spacing + pantColWidth;
        var startX          = bgLeft + (bgWidth - totalRowWidth) / 2;
        var sleeveColX      = startX + frontVB.width + spacing + backVB.width + spacing;
        var sleeveColTop    = currentTop - (rowHeight - sleeveColHeight) / 2;
        var pantColX        = sleeveColX + sleeveColWidth + spacing;
        var pantColTop      = currentTop - (rowHeight - pantColHeight) / 2;

        moveWithOutline(frontGrp,    startX,                                       currentTop - (rowHeight - frontVB.height) / 2);
        moveWithOutline(backGrp,     startX + frontVB.width + spacing,             currentTop - (rowHeight - backVB.height)  / 2);
        moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColWidth - lSlvVB.width) / 2, sleeveColTop);
        moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColWidth - rSlvVB.width) / 2, sleeveColTop - lSlvVB.height - spacing);
        moveWithOutline(leftPantGrp,  pantColX + (pantColWidth - lPntVB.width) / 2, pantColTop);
        moveWithOutline(rightPantGrp, pantColX + (pantColWidth - rPntVB.width) / 2, pantColTop - lPntVB.height - spacing);

        currentTop -= rowHeight;

        backShapes[sz].remove();
        frontShapes[sz].remove();
        sleeveShapes[sz].remove();
        sleeveShapeR.remove();
        pantShapes[sz].remove();
        pantShapeR.remove();
    }

    app.activeDocument = outDoc;
    alert('Hoàn thành nhảy size. Bạn có thể chỉnh sửa thiết kế, sau đó chạy bước tiếp theo: nhap_ten_so.jsx');
}

function run() {
    try {
        main();
    } catch (e) {
        if (e instanceof CancelledError) return; // user cancelled — end silently
        alert('Error: ' + e.message + '\nLine: ' + e.line);
    }
}

run();

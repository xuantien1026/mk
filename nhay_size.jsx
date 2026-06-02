#target illustrator
#include "lib/names.jsx"
#include "lib/config.jsx"
#include "lib/utils.jsx"

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
var PANT   = 'QUAN';   // 2-shape pant: one shape per leg (right is mirrored)
var PANT1  = 'QUAN1';  // 4-shape pant: two left shapes (both mirrored for the right)
var PANT2  = 'QUAN2';

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
    variants[BACK] = []; variants[FRONT] = []; variants[SLEEVE] = [];
    variants[PANT] = []; variants[PANT1] = []; variants[PANT2] = [];
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

    var TYPES = [BACK, FRONT, SLEEVE, PANT, PANT1, PANT2];

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

// Existence check via the native getByName (fast, C-level) — do NOT use the scripted
// findAllItemsByName for this: it walks the whole document tree in interpreted code.
function hasItem(collection, name) {
    try { collection.getByName(name); return true; } catch (e) { return false; }
}

// Design part names that must be unique across the whole document. A duplicate almost
// always means a group/layer was copied by mistake — getByName would then silently pick
// the first one and resize the wrong artwork — so we stop with a clear error instead.
var UNIQUE_PART_NAMES = [
    THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI,
    QUAN_TRAI, QUAN_PHAI,
    QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2
];

// Count how many items in the document carry `name`. doc.pageItems is already a
// flat collection of every item in the document (including those nested in groups),
// so we iterate it once — do NOT use findAllItemsByName here, which recurses into
// groups and would double-count anything inside a group.
function countItemsByName(doc, name) {
    var items = doc.pageItems, count = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].name === name) count++;
    }
    return count;
}

// Stop the script if any design part appears more than once in the document.
function validateUniqueParts(doc) {
    var dupes = [];
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) {
        var name  = UNIQUE_PART_NAMES[i];
        var count = countItemsByName(doc, name);
        if (count > 1) dupes.push(name + ' (xuất hiện ' + count + ' lần)');
    }
    if (dupes.length > 0) {
        throw new Error('File thiết kế có phần tử bị lặp — mỗi phần tử chỉ được xuất hiện 1 lần:\n- '
            + dupes.join('\n- '));
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

// Build the SIZE label from scratch. We know its text, glyph height and placement, so
// the design file no longer has to provide a SIZE text frame. Created on parkLayer;
// placeSizeLabel then scales and positions it.
function makeSizeLabel(sizeName, parkLayer) {
    var label = parkLayer.textFrames.add();
    label.contents = sizeName;
    label.name = SIZE;
    return label;
}

// Gather every PathItem inside a mask shape (it may be a plain path, a compound path,
// or a group of paths).
function collectPaths(item, out) {
    if (!out) out = [];
    if (item.typename === 'PathItem') {
        out.push(item);
    } else if (item.typename === 'CompoundPathItem') {
        for (var i = 0; i < item.pathItems.length; i++) out.push(item.pathItems[i]);
    } else if (item.typename === 'GroupItem') {
        for (var j = 0; j < item.pageItems.length; j++) collectPaths(item.pageItems[j], out);
    }
    return out;
}

// Cubic Bézier point at t for control points p0..p3 ([x, y]).
function bezierPoint(p0, p1, p2, p3, t) {
    var mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// Flatten a path into straight [ [x,y],[x,y] ] segments (Béziers sampled in `steps`).
function flattenSegments(pathItem, steps, segs) {
    var pp = pathItem.pathPoints, n = pp.length;
    if (n < 2) return segs;
    var count = pathItem.closed ? n : n - 1;
    for (var i = 0; i < count; i++) {
        var a = pp[i], b = pp[(i + 1) % n];
        var p0 = a.anchor, p1 = a.rightDirection, p2 = b.leftDirection, p3 = b.anchor, prev = p0;
        for (var s = 1; s <= steps; s++) {
            var cur = bezierPoint(p0, p1, p2, p3, s / steps);
            segs.push([prev, cur]);
            prev = cur;
        }
    }
    return segs;
}

// Leftmost/rightmost x where the (flattened) shape crosses the horizontal line y = Y,
// i.e. the shape's true horizontal extent at that height. Null if it doesn't reach Y.
function spanAtY(segs, Y) {
    var min = null, max = null;
    for (var i = 0; i < segs.length; i++) {
        var a = segs[i][0], b = segs[i][1], ya = a[1], yb = b[1];
        if ((ya <= Y && Y < yb) || (yb <= Y && Y < ya)) {
            var x = a[0] + (b[0] - a[0]) * (Y - ya) / (yb - ya);
            if (min === null || x < min) min = x;
            if (max === null || x > max) max = x;
        }
    }
    return (min === null) ? null : { left: min, right: max };
}

// b = [left, top, right, bottom] (top > bottom); is point [x, y] inside it?
function boundsContain(b, pt) {
    return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] <= b[1] && pt[1] >= b[3];
}

// Frontmost filled path under a point — walk the design front-to-back (pageItems[0] is
// on top) and return the first filled path/compound whose bounds contain the point.
// Containment is by bounding box, so overlaps aren't resolved exactly. Null if none.
function fillColorAtPoint(item, pt) {
    if (item.typename === 'GroupItem') {
        for (var i = 0; i < item.pageItems.length; i++) {
            var c = fillColorAtPoint(item.pageItems[i], pt);
            if (c) return c;
        }
        return null;
    }
    if (item.typename === 'CompoundPathItem') {
        if (boundsContain(item.geometricBounds, pt) && item.pathItems.length && item.pathItems[0].filled) {
            return item.pathItems[0].fillColor;
        }
        return null;
    }
    if (item.typename === 'PathItem') {
        if (item.filled && boundsContain(item.geometricBounds, pt)) return item.fillColor;
        return null;
    }
    return null;
}

// Perceived luminance 0..1 of a solid color, or null when it can't be judged
// (gradient / pattern / no fill) — caller then defaults to a dark label.
function colorLuminance(color) {
    var tn = color.typename, r, g, b;
    if (tn === 'RGBColor')  { return (0.299 * color.red + 0.587 * color.green + 0.114 * color.blue) / 255; }
    if (tn === 'GrayColor') { return 1 - (color.gray / 100); } // gray is a 0..100 tint, 100 = black
    if (tn === 'CMYKColor') {
        var k = color.black / 100;
        r = 255 * (1 - color.cyan / 100)    * (1 - k);
        g = 255 * (1 - color.magenta / 100) * (1 - k);
        b = 255 * (1 - color.yellow / 100)  * (1 - k);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    if (tn === 'SpotColor') { try { return colorLuminance(color.spot.color); } catch (e) { return null; } }
    return null;
}

// Black or white in the document's color space.
function blackOrWhite(doc, white) {
    if (doc.documentColorSpace === DocumentColorSpace.RGB) {
        var c = new RGBColor(); c.red = c.green = c.blue = white ? 255 : 0; return c;
    }
    var k = new CMYKColor(); k.cyan = 0; k.magenta = 0; k.yellow = 0; k.black = white ? 0 : 100; return k;
}

// Scale the SIZE label to SIZE_GLYPH_HEIGHT and place its glyph bottom SIZE_BOTTOM_GAP
// above the design's bottom edge, inset SIZE_SIDE_INSET from the near side (nearSide is
// 'RIGHT' or 'LEFT'), then tuck it in front of the design.
function placeSizeLabel(label, maskShape, nearSide, designCopy, doc) {
    var gb     = glyphBounds(label);
    var glyphH = gb[1] - gb[3];
    if (glyphH > 0) {
        var s = (SIZE_GLYPH_HEIGHT / glyphH) * 100;
        label.resize(s, s, true, true, true, true, true, Transformation.CENTER);
    }

    var maskBottom = maskShape.position[1] - maskShape.height;
    var bounds     = label.geometricBounds;
    var newY = label.position[1] + (maskBottom + SIZE_BOTTOM_GAP - glyphBounds(label)[3]);

    // The bottom of a piece (a sleeve especially) can be narrower than its bounding box,
    // so inset from the shape's ACTUAL edge at the label's height, not the box edge.
    var segs = [], paths = collectPaths(maskShape);
    for (var i = 0; i < paths.length; i++) flattenSegments(paths[i], 24, segs);
    var span      = spanAtY(segs, maskBottom + SIZE_BOTTOM_GAP + SIZE_GLYPH_HEIGHT / 2);
    var edgeLeft  = span ? span.left  : maskShape.position[0];
    var edgeRight = span ? span.right : maskShape.position[0] + maskShape.width;

    var newX = (nearSide === 'RIGHT')
        ? label.position[0] + (edgeRight - SIZE_SIDE_INSET - bounds[2])
        : label.position[0] + (edgeLeft  + SIZE_SIDE_INSET - bounds[0]);
    label.position = [newX, newY];

    // Contrasting fill so the label reads over the design: sample the frontmost solid
    // fill under the label centre (the label isn't in the design yet, so it can't match
    // itself); dark background -> white text, light/unknown -> black text.
    var lb     = label.geometricBounds;
    var under  = fillColorAtPoint(designCopy, [(lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2]);
    var lum    = under ? colorLuminance(under) : null;
    label.textRange.characterAttributes.fillColor = blackOrWhite(doc, lum !== null && lum < 0.5);

    label.move(designCopy, ElementPlacement.PLACEBEFORE);
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var options = selectOptions();

    var mainDoc   = app.activeDocument;
    validateUniqueParts(mainDoc);
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

    // Produce shirts only if the design has the shirt groups, pants only if it has the
    // pant groups — so a shirt-only or pant-only design file just works.
    var hasShirt = hasItem(mainDoc.pageItems, THAN_TRUOC) && hasItem(mainDoc.pageItems, THAN_SAU)
                && hasItem(mainDoc.pageItems, TAY_TRAI)   && hasItem(mainDoc.pageItems, TAY_PHAI);
    // Pants come in two flavours: the original 2-shape (one group per leg) or the
    // 4-shape split (two pieces per leg). Detect per design; 4-shape wins if both sets
    // of groups happen to be present.
    var has4Pant = hasItem(mainDoc.pageItems, QUAN_TRAI1) && hasItem(mainDoc.pageItems, QUAN_TRAI2)
                && hasItem(mainDoc.pageItems, QUAN_PHAI1) && hasItem(mainDoc.pageItems, QUAN_PHAI2);
    var has2Pant = !has4Pant && hasItem(mainDoc.pageItems, QUAN_TRAI) && hasItem(mainDoc.pageItems, QUAN_PHAI);
    var hasPant  = has4Pant || has2Pant;
    if (!hasShirt && !hasPant) {
        throw new Error('File thiết kế không có nhóm thân áo (THAN_TRUOC/THAN_SAU/TAY_TRAI/TAY_PHAI) lẫn nhóm quần (QUAN_TRAI/QUAN_PHAI hoặc QUAN_TRAI1/QUAN_TRAI2/QUAN_PHAI1/QUAN_PHAI2).');
    }

    var backShapes = {}, frontShapes = {}, sleeveShapes = {};
    var pantShapes = {}, pantShapes1 = {}, pantShapes2 = {};
    for (var s = 0; s < options.sizes.length; s++) {
        var sz = options.sizes[s];
        function shapeName(sz, type, variant) {
            return variant ? sz + '_' + type + '_' + variant : sz + '_' + type;
        }
        if (hasShirt) {
            backShapes[sz]        = copyItemToDoc(shapeName(sz, BACK,   options.variants[BACK]),   sourceDoc, outDoc);
            backShapes[sz].name   = sz + '_BACK_SHAPE';
            frontShapes[sz]       = copyItemToDoc(shapeName(sz, FRONT,  options.variants[FRONT]),  sourceDoc, outDoc);
            frontShapes[sz].name  = sz + '_FRONT_SHAPE';
            sleeveShapes[sz]      = copyItemToDoc(shapeName(sz, SLEEVE, options.variants[SLEEVE]), sourceDoc, outDoc);
            sleeveShapes[sz].name = sz + '_SLEEVE_SHAPE';
        }
        if (has2Pant) {
            pantShapes[sz]        = copyItemToDoc(shapeName(sz, PANT,   options.variants[PANT]),   sourceDoc, outDoc);
            pantShapes[sz].name   = sz + '_PANT_SHAPE';
        } else if (has4Pant) {
            pantShapes1[sz]       = copyItemToDoc(shapeName(sz, PANT1,  options.variants[PANT1]),  sourceDoc, outDoc);
            pantShapes1[sz].name  = sz + '_PANT1_SHAPE';
            pantShapes2[sz]       = copyItemToDoc(shapeName(sz, PANT2,  options.variants[PANT2]),  sourceDoc, outDoc);
            pantShapes2[sz].name  = sz + '_PANT2_SHAPE';
        }
    }

    sourceDoc.close(SaveOptions.DONOTSAVECHANGES);

    var frontDesign, backDesign, leftSleeve, rightSleeve;
    var leftPant, rightPant, leftPant1, leftPant2, rightPant1, rightPant2;
    if (hasShirt) {
        frontDesign = requireItem(mainDoc.pageItems, THAN_TRUOC, mainDoc.name);
        backDesign  = requireItem(mainDoc.pageItems, THAN_SAU,   mainDoc.name);
        leftSleeve  = requireItem(mainDoc.pageItems, TAY_TRAI,   mainDoc.name);
        rightSleeve = requireItem(mainDoc.pageItems, TAY_PHAI,   mainDoc.name);
    }
    if (has2Pant) {
        leftPant    = requireItem(mainDoc.pageItems, QUAN_TRAI,  mainDoc.name);
        rightPant   = requireItem(mainDoc.pageItems, QUAN_PHAI,  mainDoc.name);
    } else if (has4Pant) {
        leftPant1   = requireItem(mainDoc.pageItems, QUAN_TRAI1, mainDoc.name);
        leftPant2   = requireItem(mainDoc.pageItems, QUAN_TRAI2, mainDoc.name);
        rightPant1  = requireItem(mainDoc.pageItems, QUAN_PHAI1, mainDoc.name);
        rightPant2  = requireItem(mainDoc.pageItems, QUAN_PHAI2, mainDoc.name);
    }

    // nearSide: 'RIGHT' | 'LEFT' — which edge the SIZE label is inset from.
    function resizeAndMask(design, maskShape, instanceName, sizeName, nearSide) {
        var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        designCopy.name = instanceName + '_DESIGN';

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

        // Scale width and height independently so the design's bounding path fills the
        // shape exactly (the shape is then used as a clip mask).
        var scaleX = (maskShape.width  / visibleW) * 100;
        var scaleY = (maskShape.height / visibleH) * 100;
        designCopy.resize(scaleX, scaleY, true, true, true, true, true, Transformation.CENTER);

        // The independent scale distorts every LOGO inside the design. Restore each
        // logo's aspect ratio: it was just scaled by scaleX horizontally and scaleY
        // vertically, so correcting its height by scaleX/scaleY makes its net scale
        // uniform at scaleX. Resize about each logo's own center so it stays put.
        var logoHeightCorrection = (scaleX / scaleY) * 100;
        var logos = findAllItemsByName(designCopy, LOGO);
        for (var li = 0; li < logos.length; li++) {
            logos[li].resize(100, logoHeightCorrection,
                true, true, true, true, true, Transformation.CENTER);
        }

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

        // Create the SIZE label and place it relative to the masked design.
        placeSizeLabel(makeSizeLabel(sizeName, outputLayer), maskShape, nearSide, designCopy, outDoc);

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

    // The true outer extent of a part is its cut OUTLINE, not the design: the outline
    // is a stroked path whose stroke reaches a few mm beyond the clip/design edge.
    // Measure the outline's visibleBounds (stroke included) so layout gaps sit between
    // the actual cut lines. (A clipped group's own bounds can't be used — they include
    // the artwork hidden by the mask. The outline coincides with the clip path.)
    function visBounds(group) {
        var outline = outDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
        var b = outline.visibleBounds; // [left, top, right, bottom], includes stroke
        return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
    }

    // Move a part so its OUTLINE's visible top-left lands at (newX, newY); the clipped
    // _FINAL design is shifted by the same delta so the two stay aligned.
    function moveWithOutline(group, newX, newY) {
        var vb = visBounds(group);
        var deltaX = newX - vb.left;
        var deltaY = newY - vb.top;
        group.position = [group.position[0] + deltaX, group.position[1] + deltaY];
        var outline = outDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
        outline.position = [outline.position[0] + deltaX, outline.position[1] + deltaY];
    }

    var bgWidth    = 1.6 * 1000 * PT_PER_MM;
    var spacing    = 3 * PT_PER_MM;       // 3mm gap between adjacent designs
    var padding    = spacing / 2;         // row margin: gap between rows/sizes = 2*padding = 3mm
    // Anchor the output to the top edge of the output artboard so the vertical stack
    // has maximum room before hitting Illustrator's pasteboard coordinate limit (the
    // point where geometry gets clamped, which corrupts the lower sizes).
    var bgLeft     = outDoc.artboards[0].artboardRect[0];
    var bgTop      = outDoc.artboards[0].artboardRect[1];
    var currentTop = bgTop;

    for (var s = 0; s < options.sizes.length; s++) {
        var sz = options.sizes[s];

        if (hasShirt) {
            var backGrp     = resizeAndMask(backDesign,  backShapes[sz],   sz + '_BACK',         sz, 'LEFT');
            var frontGrp    = resizeAndMask(frontDesign, frontShapes[sz],  sz + '_FRONT',        sz, 'RIGHT');
            // The outline file holds only the LEFT sleeve shape — mirror it (negative X
            // scale) for the right sleeve.
            var sleeveShapeR = sleeveShapes[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
            sleeveShapeR.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
            var leftSlvGrp  = resizeAndMask(leftSleeve,  sleeveShapes[sz], sz + '_LEFT_SLEEVE',  sz, 'LEFT');
            var rightSlvGrp = resizeAndMask(rightSleeve, sleeveShapeR,     sz + '_RIGHT_SLEEVE', sz, 'RIGHT');

            var frontVB = visBounds(frontGrp), backVB = visBounds(backGrp);
            var lSlvVB  = visBounds(leftSlvGrp), rSlvVB = visBounds(rightSlvGrp);

            // Row 1: front, back, and the sleeve column (left sleeve stacked over right).
            var sleeveColHeight = lSlvVB.height + spacing + rSlvVB.height;
            var sleeveColWidth  = Math.max(lSlvVB.width, rSlvVB.width);
            var row1Height      = Math.max(frontVB.height, backVB.height, sleeveColHeight) + padding * 2;
            var row1Width       = frontVB.width + spacing + backVB.width + spacing + sleeveColWidth;
            var row1StartX      = bgLeft + (bgWidth - row1Width) / 2;
            var sleeveColX      = row1StartX + frontVB.width + spacing + backVB.width + spacing;
            var sleeveColTop    = currentTop - (row1Height - sleeveColHeight) / 2;

            moveWithOutline(frontGrp,    row1StartX,                                       currentTop - (row1Height - frontVB.height) / 2);
            moveWithOutline(backGrp,     row1StartX + frontVB.width + spacing,             currentTop - (row1Height - backVB.height)  / 2);
            moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColWidth - lSlvVB.width) / 2, sleeveColTop);
            moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColWidth - rSlvVB.width) / 2, sleeveColTop - lSlvVB.height - spacing);

            currentTop -= row1Height;

            backShapes[sz].remove();
            frontShapes[sz].remove();
            sleeveShapes[sz].remove();
            sleeveShapeR.remove();
        }

        if (hasPant) {
            // The outline file holds only the LEFT pant shape(s) — mirror each
            // (negative X scale) for the right leg. Build the list of masked pant pieces
            // for whichever flavour this design uses, then lay them out the same way.
            var pantGrps = [], pantTemps = [];
            if (has2Pant) {
                var pantShapeR = pantShapes[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
                pantShapeR.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
                pantGrps.push(resizeAndMask(leftPant,  pantShapes[sz], sz + '_LEFT_PANT',  sz, 'LEFT'));
                pantGrps.push(resizeAndMask(rightPant, pantShapeR,     sz + '_RIGHT_PANT', sz, 'RIGHT'));
                pantTemps.push(pantShapes[sz], pantShapeR);
            } else { // has4Pant
                var s1R = pantShapes1[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
                s1R.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
                var s2R = pantShapes2[sz].duplicate(outputLayer, ElementPlacement.PLACEATEND);
                s2R.resize(-100, 100, true, true, true, true, true, Transformation.CENTER);
                // Left leg: piece i's design (QUAN_TRAIi) clips shape QUANi. On the
                // right leg the pieces cross over — the flipped QUAN1 shape takes the
                // QUAN_PHAI2 design and the flipped QUAN2 shape takes QUAN_PHAI1.
                pantGrps.push(resizeAndMask(leftPant1,  pantShapes1[sz], sz + '_LEFT_PANT_1',  sz, 'LEFT'));
                pantGrps.push(resizeAndMask(leftPant2,  pantShapes2[sz], sz + '_LEFT_PANT_2',  sz, 'LEFT'));
                pantGrps.push(resizeAndMask(rightPant1, s2R,             sz + '_RIGHT_PANT_1', sz, 'RIGHT'));
                pantGrps.push(resizeAndMask(rightPant2, s1R,             sz + '_RIGHT_PANT_2', sz, 'RIGHT'));
                pantTemps.push(pantShapes1[sz], pantShapes2[sz], s1R, s2R);
            }

            // Pant row: every piece side by side (L1 L2 R1 R2 for the 4-shape pant,
            // left | right for the 2-shape pant), centered within the layout width.
            var vbs = [], maxH = 0, rowW = 0;
            for (var pi = 0; pi < pantGrps.length; pi++) {
                vbs[pi] = visBounds(pantGrps[pi]);
                if (vbs[pi].height > maxH) maxH = vbs[pi].height;
                rowW += vbs[pi].width + (pi > 0 ? spacing : 0);
            }
            var rowH = maxH + padding * 2;
            var rowStartX = bgLeft + (bgWidth - rowW) / 2, px = rowStartX;
            // Align the pieces on their bottom edge (padding above the row bottom),
            // rather than centering them vertically.
            for (var pj = 0; pj < pantGrps.length; pj++) {
                moveWithOutline(pantGrps[pj], px, currentTop - padding - (maxH - vbs[pj].height));
                px += vbs[pj].width + spacing;
            }

            currentTop -= rowH;

            for (var pk = 0; pk < pantTemps.length; pk++) pantTemps[pk].remove();
        }
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

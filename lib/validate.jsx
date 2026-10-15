var UNIQUE_PART_NAMES = [
    THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI,
    QUAN_TRAI, QUAN_PHAI,
    QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2
];

// Top-level names countParts tracks: the parts, plus the optional SO_VECTOR digit set
// (not a part — it has no bounding path, so collectBoundsErrors skips it).
var COUNTED_NAMES = UNIQUE_PART_NAMES.concat([SO_VECTOR]);

// The digits SO_VECTOR must hold, one direct child named after each.
var SO_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// A shirt's body (front + back) is always required. Sleeves are an independent
// all-or-none group: most shirts have both, but some — e.g. basketball jerseys —
// have neither. Each group is validated separately so a sleeveless design passes.
var SHIRT_BODY_PART_NAMES   = [THAN_TRUOC, THAN_SAU];
var SHIRT_SLEEVE_PART_NAMES = [TAY_TRAI, TAY_PHAI];

// 2-shape pant and 4-shape pant are independent schemes — a design uses one or
// the other. Each scheme is all-or-none on its own.
var PANT_2_PART_NAMES = [QUAN_TRAI, QUAN_PHAI];
var PANT_4_PART_NAMES = [QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2];

// Every non-text art collection of a Document. Each is flattened (it includes items
// nested inside groups), so a native getByName on it finds an SO of that type anywhere.
var NON_TEXT_COLLECTIONS = [
    'groupItems', 'pathItems', 'compoundPathItems', 'placedItems', 'rasterItems',
    'symbolItems', 'meshItems', 'pluginItems', 'graphItems', 'legacyTextItems',
    'nonNativeItems'
];

// Counts how many times each part name appears and records a reference to the
// (last-seen) item for each name, so checks that need the actual item — e.g.
// collectBoundsErrors — don't have to look again. UNIQUE_PART_NAMES covers every
// name any check cares about, so all the collect* checks below read from the
// returned maps.
//
// Performance: do NOT walk Document.pageItems. It is the flattened list of every art
// object, and in ExtendScript each access crosses into Illustrator — a design file
// with two designs had 163,699 objects and this scan alone ran for minutes. Parts
// are always top-level items of a layer (never nested in a group), so only each
// layer's own pageItems — a handful of objects — are scanned.
function countParts(doc) {
    var counts = {}, items = {};
    for (var i = 0; i < COUNTED_NAMES.length; i++) {
        counts[COUNTED_NAMES[i]] = 0;
        items[COUNTED_NAMES[i]]  = null;
    }

    function scanLayer(layer) {
        var pageItems = layer.pageItems;
        var len = pageItems.length;
        for (var i = 0; i < len; i++) {
            var it = pageItems[i];
            var n  = it.name;
            if (n && counts.hasOwnProperty(n)) {
                counts[n]++;
                items[n] = it;
            }
        }
        for (var j = 0; j < layer.layers.length; j++) scanLayer(layer.layers[j]);
    }
    for (var l = 0; l < doc.layers.length; l++) scanLayer(doc.layers[l]);

    return { counts: counts, items: items, soItems: findNonTextSo(doc) };
}

// SO sits deep inside the design groups, so it can't be found by a top-level scan.
// Instead ask each non-text collection natively (C-level, fast) for an item named
// SO: any hit is an SO that isn't a TextFrame. Returns those items (at most one
// per collection) — enough for collectSoErrors to report the offending type.
function findNonTextSo(doc) {
    var found = [];
    for (var i = 0; i < NON_TEXT_COLLECTIONS.length; i++) {
        var coll = doc[NON_TEXT_COLLECTIONS[i]];
        if (!coll) continue;
        try { found.push(coll.getByName(SO)); } catch (e) { /* none of this type */ }
    }
    return found;
}

// Enforces "all present or none present" for a group of part names, reading from
// a counts map. Returns the list of missing parts (empty when the group is
// complete or entirely absent).
function findPartialGroup(counts, names) {
    var missing = [];
    var foundCount = 0;
    for (var i = 0; i < names.length; i++) {
        var n = names[i];
        if (counts[n] > 0) foundCount++; else missing.push(n);
    }

    // Valid: none present, or all present.
    if (foundCount === 0 || missing.length === 0) return [];
    return missing;
}

// Each collect* function takes the counts map from countParts and returns an
// array of error message strings (empty when the check passes). They never
// throw, so validateDocument can gather every problem and report them together.

function collectDuplicateErrors(counts) {
    var dupes = [];
    for (var i = 0; i < COUNTED_NAMES.length; i++) {
        var n = COUNTED_NAMES[i];
        if (counts[n] > 1) dupes.push(n + ' (xuất hiện ' + counts[n] + ' lần)');
    }
    if (dupes.length === 0) return [];
    return ['File thiết kế có phần tử bị lặp — mỗi phần tử chỉ được xuất hiện 1 lần:\n- '
        + dupes.join('\n- ')];
}

function collectShirtErrors(counts) {
    var errors = [];

    var missingBody = findPartialGroup(counts, SHIRT_BODY_PART_NAMES);
    if (missingBody.length > 0) {
        errors.push('File thiết kế thiếu phần thân áo — áo phải có đủ THAN_TRUOC, THAN_SAU.\n'
            + 'Thiếu:\n- ' + missingBody.join('\n- '));
    }

    // Sleeves are optional (e.g. áo bóng rổ không có tay), but all-or-none: if one
    // sleeve is present the other must be too.
    var missingSleeve = findPartialGroup(counts, SHIRT_SLEEVE_PART_NAMES);
    if (missingSleeve.length > 0) {
        errors.push('File thiết kế thiếu tay áo — nếu có tay áo thì phải có đủ TAY_TRAI, TAY_PHAI.\n'
            + 'Thiếu:\n- ' + missingSleeve.join('\n- '));
    }

    return errors;
}

function collectPantErrors(counts) {
    var errors = [];

    var missing2 = findPartialGroup(counts, PANT_2_PART_NAMES);
    if (missing2.length > 0) {
        errors.push('File thiết kế thiếu phần tử của quần (loại 2 mảnh) — phải có đủ QUAN_TRAI, QUAN_PHAI.\n'
            + 'Thiếu:\n- ' + missing2.join('\n- '));
    }

    var missing4 = findPartialGroup(counts, PANT_4_PART_NAMES);
    if (missing4.length > 0) {
        errors.push('File thiết kế thiếu phần tử của quần (loại 4 mảnh) — phải có đủ QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2.\n'
            + 'Thiếu:\n- ' + missing4.join('\n- '));
    }

    return errors;
}

// The bounding path of each part — by convention the last element of the group —
// must have a real, non-zero extent. A degenerate last element (a guide, an open
// horizontal/vertical line, a stray point, a hidden/empty path) would later make
// nhay_size compute an Infinite scale, and Illustrator's resize() throws the opaque
// "Illegal argument ... numeric value expected" error mid-export. Catch every bad
// part here, up front. Reads the actual items (not just counts) to measure them.
function collectBoundsErrors(items) {
    var bad = [];
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) {
        var name = UNIQUE_PART_NAMES[i];
        var item = items[name];
        if (!item) continue;                         // absent — other checks handle it
        var bp   = (item.typename === 'GroupItem' && item.pageItems.length > 0)
            ? item.pageItems[item.pageItems.length - 1]
            : item;
        var b = bp.geometricBounds;
        var w = b[2] - b[0], h = b[1] - b[3];
        if (!(w > 0) || !(h > 0)) {
            bad.push(name + ' (chiều rộng=' + w + ', chiều cao=' + h + ')');
        }
    }
    if (bad.length === 0) return [];
    return ['File thiết kế có phần tử với khung bao bị lỗi — phần tử cuối cùng của mỗi nhóm '
        + 'phải là một hình khép kín có chiều rộng và chiều cao khác 0:\n- ' + bad.join('\n- ')];
}

// Every SO element (the shirt/pant number) must be a TextFrame: nhap_ten_so fills it
// via applyField, which only writes into text frames — so a group (or path) named SO
// would silently never receive its number — and nhay_size keeps its glyph-stroke
// border alive by treating it as text. Reads the non-text SO items found by
// countParts (findNonTextSo), so any item here is an error.
function collectSoErrors(soItems) {
    for (var i = 0; i < soItems.length; i++) {
        if (soItems[i].typename !== 'TextFrame') return ['"Số" phải là TextFrame (hiện là ' + soItems[i].typename + ')'];
    }
    return [];
}

// The optional SO_VECTOR digit set: when present, the print step builds each SO from
// it (print_pages.jsx), so it must be a group holding exactly one item named after
// each digit 0–9, each with a real extent. Absent → SO stays text, nothing to check.
function collectSoVectorErrors(soVector) {
    if (!soVector) return [];
    if (soVector.typename !== 'GroupItem') {
        return ['"' + SO_VECTOR + '" phải là một nhóm (Group) chứa các số 0–9 (hiện là ' + soVector.typename + ')'];
    }
    var counts = {}, bad = [];
    for (var i = 0; i < soVector.pageItems.length; i++) {
        var it = soVector.pageItems[i];
        if (!counts.hasOwnProperty(it.name)) counts[it.name] = 0;
        counts[it.name]++;
        if (counts[it.name] === 1 && /^[0-9]$/.test(it.name)) {
            var b = it.geometricBounds;
            if (!(b[2] - b[0] > 0) || !(b[1] - b[3] > 0)) bad.push('số ' + it.name + ' rỗng (rộng/cao bằng 0)');
            if (it.typename === 'TextFrame') bad.push('số ' + it.name + ' là chữ, hãy Create Outlines');
        }
    }
    for (var d = 0; d < SO_DIGITS.length; d++) {
        var n = counts[SO_DIGITS[d]] || 0;
        if (n === 0) bad.push('thiếu số ' + SO_DIGITS[d]);
        else if (n > 1) bad.push('số ' + SO_DIGITS[d] + ' xuất hiện ' + n + ' lần');
    }
    if (bad.length === 0) return [];
    return ['Nhóm "' + SO_VECTOR + '" (bộ số vector) không hợp lệ:\n- ' + bad.join('\n- ')];
}

// Runs every validation against the design document and, if anything fails,
// throws a single Error listing all problems at once. The document is scanned
// exactly once (countParts); every check reads from the resulting maps.
function validateDocument(doc) {
    var parts  = countParts(doc);
    var counts = parts.counts;

    var errors = [];
    errors = errors.concat(collectDuplicateErrors(counts));
    errors = errors.concat(collectShirtErrors(counts));
    errors = errors.concat(collectPantErrors(counts));
    errors = errors.concat(collectBoundsErrors(parts.items));
    errors = errors.concat(collectSoErrors(parts.soItems));
    errors = errors.concat(collectSoVectorErrors(parts.items[SO_VECTOR]));

    if (errors.length > 0) {
        throw new Error('File thiết kế không hợp lệ — vui lòng sửa các lỗi sau:\n\n'
            + errors.join('\n\n'));
    }
}

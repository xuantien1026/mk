var UNIQUE_PART_NAMES = [
    THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI,
    QUAN_TRAI, QUAN_PHAI,
    QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2
];

var SHIRT_PART_NAMES = [THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI];

// 2-shape pant and 4-shape pant are independent schemes — a design uses one or
// the other. Each scheme is all-or-none on its own.
var PANT_2_PART_NAMES = [QUAN_TRAI, QUAN_PHAI];
var PANT_4_PART_NAMES = [QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2];

// Single pass over the document: counts how many times each relevant part name
// appears and records a reference to the (last-seen) item for each name, so checks
// that need the actual item — e.g. collectBoundsErrors — don't have to scan again.
// UNIQUE_PART_NAMES covers every name any check cares about, so all the collect*
// checks below can read from the returned maps without re-scanning the document.
function countParts(doc) {
    var counts = {}, items = {}, soItems = [];
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) {
        counts[UNIQUE_PART_NAMES[i]] = 0;
        items[UNIQUE_PART_NAMES[i]]  = null;
    }

    // Document.pageItems is the flattened list of every art object (including ones
    // nested inside the design groups), so a single pass reaches every SO no matter
    // how deeply it sits.
    var pageItems = doc.pageItems;
    for (var i = 0; i < pageItems.length; i++) {
        var n = pageItems[i].name;
        if (counts.hasOwnProperty(n)) {
            counts[n]++;
            items[n] = pageItems[i];
        }
        if (n === SO) soItems.push(pageItems[i]);
    }
    return { counts: counts, items: items, soItems: soItems };
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
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) {
        var n = UNIQUE_PART_NAMES[i];
        if (counts[n] > 1) dupes.push(n + ' (xuất hiện ' + counts[n] + ' lần)');
    }
    if (dupes.length === 0) return [];
    return ['File thiết kế có phần tử bị lặp — mỗi phần tử chỉ được xuất hiện 1 lần:\n- '
        + dupes.join('\n- ')];
}

function collectShirtErrors(counts) {
    var missing = findPartialGroup(counts, SHIRT_PART_NAMES);
    if (missing.length === 0) return [];
    return ['File thiết kế thiếu phần tử của áo — áo phải có đủ 4 phần (THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI).\n'
        + 'Thiếu:\n- ' + missing.join('\n- ')];
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
// border alive by treating it as text. Reads the SO items gathered by countParts.
function collectSoErrors(soItems) {
    for (var i = 0; i < soItems.length; i++) {
        if (soItems[i].typename !== 'TextFrame') return ['"Số" phải là TextFrame (hiện là ' + soItems[i].typename + ')'];
    }
    return [];
}

// Runs every validation against the design document and, if anything fails,
// throws a single Error listing all problems at once. The document is scanned
// exactly once (countParts); every check reads from the resulting counts map.
function validateDocument(doc) {
    var parts  = countParts(doc);
    var counts = parts.counts;

    var errors = [];
    errors = errors.concat(collectDuplicateErrors(counts));
    errors = errors.concat(collectShirtErrors(counts));
    errors = errors.concat(collectPantErrors(counts));
    errors = errors.concat(collectBoundsErrors(parts.items));
    errors = errors.concat(collectSoErrors(parts.soItems));

    if (errors.length > 0) {
        throw new Error('File thiết kế không hợp lệ — vui lòng sửa các lỗi sau:\n\n'
            + errors.join('\n\n'));
    }
}

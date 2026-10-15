// Pure parsing for the print-command CSV — no File/Window dependencies, so it can
// be unit-tested under node --test as well as #included by nhap_ten_so.jsx and
// xep_don_so_luong.jsx.

// Minimal RFC-4180 CSV parser: handles quoted fields, escaped "" quotes,
// embedded commas/newlines, and \r\n or \n line endings.
function parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (inQuotes) {
            if (ch === '"') {
                if (text.charAt(i + 1) === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field); field = '';
        } else if (ch === '\n') {
            row.push(field); rows.push(row); row = []; field = '';
        } else if (ch !== '\r') {
            field += ch;
        }
    }
    row.push(field); rows.push(row);
    return rows;
}

// Lowercase + strip Vietnamese diacritics so header matching is case/accent
// insensitive (and the patterns below stay plain ASCII).
function foldAscii(s) {
    s = s.replace(/^\s+|\s+$/g, '').toLowerCase();
    var groups = {
        'a': 'àáạảãâầấậẩẫăằắặẳẵ',
        'e': 'èéẹẻẽêềếệểễ',
        'i': 'ìíịỉĩ',
        'o': 'òóọỏõôồốộổỗơờớợởỡ',
        'u': 'ùúụủũưừứựửữ',
        'y': 'ỳýỵỷỹ',
        'd': 'đ'
    };
    var out = '';
    for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i), rep = ch;
        for (var base in groups) {
            if (groups[base].indexOf(ch) !== -1) { rep = base; break; }
        }
        out += rep;
    }
    return out;
}

function trimCell(cells, idx) {
    if (idx < 0 || idx >= cells.length) return '';
    return cells[idx].replace(/^\s+|\s+$/g, '');
}

function contains(arr, value) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
    return false;
}

function parseOrders(text) {
    if (text.length && text.charCodeAt(0) === 0xFEFF) text = text.substring(1); // strip BOM

    var rows = parseCsv(text);

    var HDR_SIZE = 'size', HDR_SO = 'so', HDR_TEN_TREN = 'ten tren so', HDR_VARIANT = 'mau',
        HDR_QUANTITY = 'so luong', HDR_FORM = 'form';
    var headerRow = -1, sizeCol = -1, soCol = -1, tenTrenCol = -1, variantCol = -1, quantityCol = -1,
        formCol = -1;
    for (var r = 0; r < rows.length && headerRow === -1; r++) {
        var sCol = -1, nCol = -1, ttCol = -1, vCol = -1, qCol = -1, fCol = -1;
        for (var c = 0; c < rows[r].length; c++) {
            var key = foldAscii(rows[r][c]);
            if      (key === HDR_SIZE)     sCol  = c;
            else if (key === HDR_SO)       nCol  = c;
            else if (key === HDR_TEN_TREN) ttCol = c;
            else if (key === HDR_VARIANT)  vCol  = c;
            else if (key === HDR_QUANTITY) qCol  = c;
            else if (key === HDR_FORM)     fCol  = c;
        }
        if (sCol !== -1 && nCol !== -1) {
            headerRow = r; sizeCol = sCol; soCol = nCol; tenTrenCol = ttCol; variantCol = vCol;
            quantityCol = qCol; formCol = fCol;
        }
    }
    if (headerRow === -1) throw new Error('Khong tim thay bang du lieu (thieu cot SIZE / SO) trong file CSV.');

    var orders = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
        var size = trimCell(rows[r], sizeCol).toUpperCase();
        if (size === '') continue; // not an order row
        orders.push({
            size:      size,
            number:    trimCell(rows[r], soCol),
            nameAbove: tenTrenCol !== -1 ? trimCell(rows[r], tenTrenCol) : '',
            variant:   variantCol !== -1 ? trimCell(rows[r], variantCol) : '',
            quantity:  quantityCol !== -1 ? trimCell(rows[r], quantityCol) : '',
            form:      formCol !== -1 ? trimCell(rows[r], formCol) : ''
        });
    }
    return orders;
}

// Distinct variant values across the orders, in first-seen order. A single distinct
// value (including all-blank, which yields ['']) means there is nothing to choose.
function distinctVariant(orders) {
    var seen = [];
    for (var i = 0; i < orders.length; i++) {
        if (!contains(seen, orders[i].variant)) seen.push(orders[i].variant);
    }
    return seen;
}

// Keep only the orders of the chosen variant (Mẫu).
function filterByVariant(orders, chosen) {
    var out = [];
    for (var i = 0; i < orders.length; i++) if (orders[i].variant === chosen) out.push(orders[i]);
    return out;
}

// FORM is blank (NAM) or NỮ, matched case/accent insensitively.
function isFemaleForm(order) {
    return foldAscii(order.form) === 'nu';
}

// Whether any order is FORM NỮ — only then is there a NAM / NỮ choice to make.
function hasFemaleForm(orders) {
    for (var i = 0; i < orders.length; i++) if (isFemaleForm(orders[i])) return true;
    return false;
}

// Keep only the NỮ orders (female true) or only the rest, i.e. NAM (female false).
function filterByForm(orders, female) {
    var out = [];
    for (var i = 0; i < orders.length; i++) if (isFemaleForm(orders[i]) === female) out.push(orders[i]);
    return out;
}

// Group orders by size ({ size: [orders] }), dropping any size not in sizes.
function groupOrdersBySize(orders, sizes) {
    var bySize = {};
    for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        if (!contains(sizes, o.size)) continue;
        if (!bySize[o.size]) bySize[o.size] = [];
        bySize[o.size].push(o);
    }
    return bySize;
}

// A quantity order (xep_don_so_luong.jsx): only sizes and how many of each, no numbers
// or names. Each row stands for its Số lượng pieces — 1 when blank. Returns
// { size: count }, dropping any size not in sizes. Throws on a Số lượng that isn't a
// whole number.
function quantityBySize(orders, sizes) {
    var bySize = {};
    for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        if (!contains(sizes, o.size)) continue;
        if (o.quantity !== '' && !/^\d+$/.test(o.quantity)) {
            throw new Error('So luong khong hop le: "' + o.quantity + '" (size ' + o.size + ').');
        }
        bySize[o.size] = (bySize[o.size] || 0) + (o.quantity === '' ? 1 : parseInt(o.quantity, 10));
    }
    return bySize;
}

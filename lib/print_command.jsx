// Pure parsing for the print-command CSV — no File/Window dependencies, so it can
// be unit-tested under node --test as well as #included by nhap_ten_so.jsx.

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

// Parse the CSV text, locate the header row by its Size / Số Áo / Tên In Trên Áo /
// Mẫu columns, and return the order rows as [{ size, number, name, variant }].
// Size and Số Áo are required; Tên In Trên Áo and Mẫu are optional ('' when absent).
function parseOrders(text) {
    if (text.length && text.charCodeAt(0) === 0xFEFF) text = text.substring(1); // strip BOM

    var rows = parseCsv(text);

    var HDR_SIZE = 'size', HDR_SO = 'so ao', HDR_TEN = 'ten in tren ao', HDR_VARIANT = 'mau';
    var headerRow = -1, sizeCol = -1, soCol = -1, tenCol = -1, variantCol = -1;
    for (var r = 0; r < rows.length && headerRow === -1; r++) {
        var sCol = -1, nCol = -1, tCol = -1, vCol = -1;
        for (var c = 0; c < rows[r].length; c++) {
            var key = foldAscii(rows[r][c]);
            if      (key === HDR_SIZE) sCol = c;
            else if (key === HDR_SO)   nCol = c;
            else if (key === HDR_TEN)  tCol = c;
            else if (key === HDR_VARIANT)  vCol = c;
        }
        if (sCol !== -1 && nCol !== -1) {
            headerRow = r; sizeCol = sCol; soCol = nCol; tenCol = tCol; variantCol = vCol;
        }
    }
    if (headerRow === -1) throw new Error('Khong tim thay bang du lieu (thieu cot Size / So Ao) trong file CSV.');

    var orders = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
        var size = trimCell(rows[r], sizeCol).toUpperCase();
        if (size === '') continue; // not an order row
        orders.push({
            size:   size,
            number: trimCell(rows[r], soCol),
            name:   tenCol !== -1 ? trimCell(rows[r], tenCol) : '',
            variant:    variantCol !== -1 ? trimCell(rows[r], variantCol) : ''
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

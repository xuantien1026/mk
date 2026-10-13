const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makePrintEnv } = require('./helpers/helper');

// Build CSV text from an array of row arrays.
function csv(rows) {
    return rows.map(function (r) { return r.join(','); }).join('\n');
}

test('parseOrders builds {size, number, nameAbove, nameBelow, variant} from a full header', function () {
    const { parseOrders } = makePrintEnv();
    const text = csv([
        ['SIZE', 'SỐ', 'TÊN TRÊN SỐ', 'TÊN DƯỚI SỐ', 'MẪU'],
        ['m', '10', 'Alice', 'Smith', 'Design A'],
        ['l', '11', 'Bob',   'Jones', 'Design B']
    ]);
    const orders = parseOrders(text);
    assert.equal(orders.length, 2);
    assert.deepEqual(
        { size: orders[0].size, number: orders[0].number, nameAbove: orders[0].nameAbove, nameBelow: orders[0].nameBelow, variant: orders[0].variant },
        { size: 'M', number: '10', nameAbove: 'Alice', nameBelow: 'Smith', variant: 'Design A' }
    );
    assert.equal(orders[1].variant, 'Design B');
});

test('parseOrders reads the detail table of a production order, skipping the summary', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['MK1026000', '', '', '', '', '', '', ''],
        ['KHÁCH HÀNG:', 'NGUYỄN ANH MAI - HÀ NỘI', '', '', '', 'CHẤT LIỆU', 'KIM CƯƠNG NHẬT BẢN', ''],
        ['BẢNG TỔNG HỢP', '', '', '', '', '', '', ''],
        ['Mẫu', 'Size', 'Form', 'Tổng số lượng', '', '', '', ''],
        ['1', 'M', 'NỮ', '2', '', '', '', ''],
        ['', 'TỔNG SỐ LƯỢNG', '', '2', '', '', '', ''],
        ['DANH SÁCH CHI TIẾT', '', '', '', '', '', '', ''],
        ['STT', 'TÊN TRÊN SỐ', 'SỐ', 'TÊN DƯỚI SỐ', 'SIZE', 'SỐ LƯỢNG', 'FORM', 'MẪU'],
        ['1', 'A', '1', 'X', 'M', '', 'NỮ', '1'],
        ['2', 'B', '2', '', 'l', '', '', '1']
    ]));
    assert.equal(orders.length, 2);
    assert.deepEqual(
        { size: orders[0].size, number: orders[0].number, nameAbove: orders[0].nameAbove, nameBelow: orders[0].nameBelow, variant: orders[0].variant },
        { size: 'M', number: '1', nameAbove: 'A', nameBelow: 'X', variant: '1' }
    );
    assert.equal(orders[1].size, 'L');
});

test('parseOrders matches headers regardless of accent/case', function () {
    const { parseOrders } = makePrintEnv();
    for (const variantHeader of ['Mẫu', 'MAU', 'mẫu', '  mau  ']) {
        const orders = parseOrders(csv([
            ['size', 'so', variantHeader],
            ['s', '1', 'X']
        ]));
        assert.equal(orders.length, 1, 'header "' + variantHeader + '" should match');
        assert.equal(orders[0].variant, 'X');
    }
});

test('parseOrders leaves optional columns as empty strings when absent', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ'],
        ['m', '7']
    ]));
    assert.equal(orders[0].nameAbove, '');
    assert.equal(orders[0].nameBelow, '');
    assert.equal(orders[0].variant, '');
});

test('parseOrders skips rows above the header and blank-size rows', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Bảng lệnh in', ''],
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', 'A'],
        ['',  '2', 'A'],   // blank size — skipped
        ['l', '3', 'B']
    ]));
    assert.equal(orders.length, 2);
    assert.equal(orders[0].size, 'M');
    assert.equal(orders[1].size, 'L');
});

test('parseOrders handles quoted fields with embedded commas and strips BOM', function () {
    const { parseOrders } = makePrintEnv();
    const text = '﻿' + csv([
        ['SIZE', 'SỐ', 'TÊN TRÊN SỐ'],
        ['m', '1', '"Doe, John"']
    ]);
    const orders = parseOrders(text);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].nameAbove, 'Doe, John');
});

test('parseOrders throws when required columns are missing', function () {
    const { parseOrders } = makePrintEnv();
    assert.throws(() => parseOrders(csv([['TÊN TRÊN SỐ'], ['Alice']])));
});

test('distinctVariant returns values in first-seen order with dedupe', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', 'B'],
        ['l', '2', 'A'],
        ['s', '3', 'B']
    ]));
    assert.deepEqual(Array.from(distinctVariant(orders)), ['B', 'A']);
});

test('distinctVariant yields [""] when the Mẫu column is absent (no prompt)', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ'],
        ['m', '1'],
        ['l', '2']
    ]));
    const d = distinctVariant(orders);
    assert.equal(d.length, 1);
    assert.equal(d[0], '');
});

test('distinctVariant yields [""] when every Mẫu cell is blank (no prompt)', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', ''],
        ['l', '2', '']
    ]));
    const d = distinctVariant(orders);
    assert.equal(d.length, 1);
    assert.equal(d[0], '');
});

test('distinctVariant includes the blank group when blanks mix with values', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', 'A'],
        ['l', '2', '']
    ]));
    const d = distinctVariant(orders);
    assert.equal(d.length, 2);
    assert.ok(d.indexOf('') !== -1, 'blank should be one of the distinct values');
});

test('filtering by a chosen value keeps exactly the matching rows', function () {
    const { parseOrders, filterByVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', 'A'],
        ['l', '2', 'B'],
        ['s', '3', 'A']
    ]));
    const kept = filterByVariant(orders, 'A');
    assert.equal(kept.length, 2);
    assert.deepEqual(Array.from(kept).map(function (o) { return o.number; }), ['1', '3']);
});

test('filtering by the blank group keeps exactly the blank-variant rows', function () {
    const { parseOrders, filterByVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'MẪU'],
        ['m', '1', 'A'],
        ['l', '2', ''],
        ['s', '3', '']
    ]));
    const kept = filterByVariant(orders, '');
    assert.equal(kept.length, 2);
    assert.deepEqual(Array.from(kept).map(function (o) { return o.number; }), ['2', '3']);
});

test('groupOrdersBySize groups in order and drops sizes that were not prepared', function () {
    const { parseOrders, groupOrdersBySize } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ'],
        ['m', '1'],
        ['l', '2'],
        ['m', '3'],
        ['xl', '4']
    ]));
    const bySize = groupOrdersBySize(orders, ['M', 'L']);
    assert.deepEqual(Object.keys(bySize).sort(), ['L', 'M']);
    assert.deepEqual(Array.from(bySize.M).map(function (o) { return o.number; }), ['1', '3']);
    assert.equal(bySize.XL, undefined);
});

test('parseOrders matches the Tên dưới số header regardless of accent/case', function () {
    const { parseOrders } = makePrintEnv();
    for (const header of ['Tên dưới số', 'TEN DUOI SO', '  tên dưới số ']) {
        const orders = parseOrders(csv([
            ['size', 'so', header],
            ['s', '1', 'Below']
        ]));
        assert.equal(orders[0].nameBelow, 'Below', 'header "' + header + '" should match');
        assert.equal(orders[0].nameAbove, '');
    }
});

test('parseOrders reads the Số lượng column, blank when absent', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['STT', 'TÊN TRÊN SỐ', 'SỐ', 'TÊN DƯỚI SỐ', 'SIZE', 'SỐ LƯỢNG', 'FORM', 'MẪU'],
        ['1', '', '', '', 'M', '5', 'NỮ', '1'],
        ['2', '', '', '', 'L', '', '', '1']
    ]));
    assert.deepEqual(Array.from(orders).map(function (o) { return o.quantity; }), ['5', '']);
    assert.equal(parseOrders(csv([['SIZE', 'SỐ'], ['m', '1']]))[0].quantity, '');
});

test('quantityBySize sums each size’s Số lượng, a blank one counting 1', function () {
    const { parseOrders, quantityBySize } = makePrintEnv();
    const orders = parseOrders(csv([
        ['SIZE', 'SỐ', 'TÊN TRÊN SỐ', 'SỐ LƯỢNG'],
        ['m', '9', 'Alice', '3'],
        ['l', '',  '',      ''],
        ['m', '',  '',      '2'],
        ['s', '',  '',      '0'],
        ['xl', '', '',      '4']   // not prepared — dropped
    ]));
    assert.deepEqual({ ...quantityBySize(orders, ['S', 'M', 'L']) }, { M: 5, L: 1, S: 0 });
});

test('quantityBySize throws on a Số lượng that is not a whole number', function () {
    const { parseOrders, quantityBySize } = makePrintEnv();
    for (const bad of ['abc', '2.5', '-1']) {
        const orders = parseOrders(csv([['SIZE', 'SỐ', 'SỐ LƯỢNG'], ['m', '', bad]]));
        assert.throws(() => quantityBySize(orders, ['M']), bad);
    }
});

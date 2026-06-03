const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makePrintEnv } = require('./helpers/helper');

// Build CSV text from an array of row arrays.
function csv(rows) {
    return rows.map(function (r) { return r.join(','); }).join('\n');
}

test('parseOrders builds {size, number, name, variant} from a full header', function () {
    const { parseOrders } = makePrintEnv();
    const text = csv([
        ['Size', 'Số Áo', 'Tên In Trên Áo', 'Mẫu'],
        ['m', '10', 'Alice', 'Design A'],
        ['l', '11', 'Bob',   'Design B']
    ]);
    const orders = parseOrders(text);
    assert.equal(orders.length, 2);
    assert.deepEqual(
        { size: orders[0].size, number: orders[0].number, name: orders[0].name, variant: orders[0].variant },
        { size: 'M', number: '10', name: 'Alice', variant: 'Design A' }
    );
    assert.equal(orders[1].variant, 'Design B');
});

test('parseOrders matches headers regardless of accent/case', function () {
    const { parseOrders } = makePrintEnv();
    for (const variantHeader of ['Mẫu', 'MAU', 'mẫu', '  mau  ']) {
        const orders = parseOrders(csv([
            ['SIZE', 'so ao', variantHeader],
            ['s', '1', 'X']
        ]));
        assert.equal(orders.length, 1, 'header "' + variantHeader + '" should match');
        assert.equal(orders[0].variant, 'X');
    }
});

test('parseOrders leaves optional columns as empty strings when absent', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Size', 'Số Áo'],
        ['m', '7']
    ]));
    assert.equal(orders[0].name, '');
    assert.equal(orders[0].variant, '');
});

test('parseOrders skips rows above the header and blank-size rows', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Bảng lệnh in', ''],
        ['Size', 'Số Áo', 'Mẫu'],
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
        ['Size', 'Số Áo', 'Tên In Trên Áo'],
        ['m', '1', '"Doe, John"']
    ]);
    const orders = parseOrders(text);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].name, 'Doe, John');
});

test('parseOrders throws when required columns are missing', function () {
    const { parseOrders } = makePrintEnv();
    assert.throws(() => parseOrders(csv([['Tên In Trên Áo'], ['Alice']])));
});

test('distinctVariant returns values in first-seen order with dedupe', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Size', 'Số Áo', 'Mẫu'],
        ['m', '1', 'B'],
        ['l', '2', 'A'],
        ['s', '3', 'B']
    ]));
    assert.deepEqual(Array.from(distinctVariant(orders)), ['B', 'A']);
});

test('distinctVariant yields [""] when the Mẫu column is absent (no prompt)', function () {
    const { parseOrders, distinctVariant } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Size', 'Số Áo'],
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
        ['Size', 'Số Áo', 'Mẫu'],
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
        ['Size', 'Số Áo', 'Mẫu'],
        ['m', '1', 'A'],
        ['l', '2', '']
    ]));
    const d = distinctVariant(orders);
    assert.equal(d.length, 2);
    assert.ok(d.indexOf('') !== -1, 'blank should be one of the distinct values');
});

// Mirror the filter main() applies once a Mẫu is chosen.
function filterByVariant(orders, chosen) {
    const out = [];
    for (let i = 0; i < orders.length; i++) if (orders[i].variant === chosen) out.push(orders[i]);
    return out;
}

test('filtering by a chosen value keeps exactly the matching rows', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Size', 'Số Áo', 'Mẫu'],
        ['m', '1', 'A'],
        ['l', '2', 'B'],
        ['s', '3', 'A']
    ]));
    const kept = filterByVariant(orders, 'A');
    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map(function (o) { return o.number; }), ['1', '3']);
});

test('filtering by the blank group keeps exactly the blank-variant rows', function () {
    const { parseOrders } = makePrintEnv();
    const orders = parseOrders(csv([
        ['Size', 'Số Áo', 'Mẫu'],
        ['m', '1', 'A'],
        ['l', '2', ''],
        ['s', '3', '']
    ]));
    const kept = filterByVariant(orders, '');
    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map(function (o) { return o.number; }), ['2', '3']);
});

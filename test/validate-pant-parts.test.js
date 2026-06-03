const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeEnv, makeDoc } = require('./helpers/helper');

test('no error when no pant parts are present (no pant)', function () {
    const { collectPantErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'UNRELATED']);
    assert.equal(collectPantErrors(countParts(doc)).length, 0);
});

test('no error on an empty document', function () {
    const { collectPantErrors, countParts } = makeEnv();
    assert.equal(collectPantErrors(countParts(makeDoc([]))).length, 0);
});

test('no error for a complete 2-piece pant', function () {
    const { collectPantErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI', 'QUAN_PHAI']);
    assert.equal(collectPantErrors(countParts(doc)).length, 0);
});

test('no error for a complete 4-piece pant', function () {
    const { collectPantErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI1', 'QUAN_TRAI2', 'QUAN_PHAI1', 'QUAN_PHAI2']);
    assert.equal(collectPantErrors(countParts(doc)).length, 0);
});

test('reports an error when a 2-piece pant is missing a half', function () {
    const { collectPantErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI']);
    const errors = collectPantErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('QUAN_PHAI'), 'should name the missing half');
    assert.ok(errors[0].includes('2 mảnh'),    'should identify the 2-piece scheme');
});

test('reports an error when a 4-piece pant is missing a piece', function () {
    const { collectPantErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI1', 'QUAN_TRAI2', 'QUAN_PHAI1']);
    const errors = collectPantErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('QUAN_PHAI2'), 'should name the missing piece');
    assert.ok(errors[0].includes('4 mảnh'),     'should identify the 4-piece scheme');
});

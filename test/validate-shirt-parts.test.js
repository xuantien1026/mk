const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeEnv, makeDoc } = require('./helpers/helper');

test('no error when all four shirt parts are present', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI']);
    assert.equal(collectShirtErrors(countParts(doc).counts).length, 0);
});

test('no error when no shirt parts are present (no shirt)', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI', 'QUAN_PHAI', 'UNRELATED']);
    assert.equal(collectShirtErrors(countParts(doc).counts).length, 0);
});

test('no error on an empty document', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    assert.equal(collectShirtErrors(countParts(makeDoc([])).counts).length, 0);
});

test('no error alongside other parts when shirt is complete', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI', 'QUAN_TRAI']);
    assert.equal(collectShirtErrors(countParts(doc).counts).length, 0);
});

test('no error for a sleeveless shirt (e.g. basketball)', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU']);
    assert.equal(collectShirtErrors(countParts(doc).counts).length, 0);
});

test('reports an error when one sleeve is missing', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI']);
    const errors = collectShirtErrors(countParts(doc).counts);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('TAY_PHAI'), 'message should name the missing sleeve');
});

test('reports an error when a body part is missing', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'TAY_TRAI', 'TAY_PHAI']);
    const errors = collectShirtErrors(countParts(doc).counts);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_SAU'), 'message should name the missing body part');
});

test('reports both body and sleeve errors when only one part is present', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'TAY_TRAI']);
    const errors = collectShirtErrors(countParts(doc).counts);
    assert.equal(errors.length, 2);
    const joined = errors.join('\n');
    assert.ok(joined.includes('THAN_SAU'), 'should list THAN_SAU as missing');
    assert.ok(joined.includes('TAY_PHAI'), 'should list TAY_PHAI as missing');
});

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeEnv, makeDoc } = require('./helpers/helper');

test('no error when all four shirt parts are present', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI']);
    assert.equal(collectShirtErrors(countParts(doc)).length, 0);
});

test('no error when no shirt parts are present (no shirt)', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['QUAN_TRAI', 'QUAN_PHAI', 'UNRELATED']);
    assert.equal(collectShirtErrors(countParts(doc)).length, 0);
});

test('no error on an empty document', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    assert.equal(collectShirtErrors(countParts(makeDoc([]))).length, 0);
});

test('no error alongside other parts when shirt is complete', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI', 'QUAN_TRAI']);
    assert.equal(collectShirtErrors(countParts(doc)).length, 0);
});

test('reports an error when one shirt part is missing', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI']);
    const errors = collectShirtErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('TAY_PHAI'), 'message should name the missing part');
});

test('reports all missing parts when only one shirt part is present', function () {
    const { collectShirtErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC']);
    const errors = collectShirtErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_SAU'), 'should list THAN_SAU as missing');
    assert.ok(errors[0].includes('TAY_TRAI'), 'should list TAY_TRAI as missing');
    assert.ok(errors[0].includes('TAY_PHAI'), 'should list TAY_PHAI as missing');
});

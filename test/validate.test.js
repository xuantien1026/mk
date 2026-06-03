const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeEnv, makeDoc } = require('./helpers/helper');

test('no duplicate error when no duplicates are present', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI', 'UNRELATED']);
    assert.equal(collectDuplicateErrors(countParts(doc)).length, 0);
});

test('no duplicate error on an empty document', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    assert.equal(collectDuplicateErrors(countParts(makeDoc([]))).length, 0);
});

test('reports an error when a part appears more than once', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'THAN_SAU']);
    const errors = collectDuplicateErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_TRUOC'), 'message should name the duplicate');
    assert.ok(errors[0].includes('2'),          'message should report the count');
});

test('reports all duplicates in one message, not just the first', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'QUAN_TRAI', 'QUAN_TRAI', 'QUAN_TRAI']);
    const errors = collectDuplicateErrors(countParts(doc));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_TRUOC'), 'should mention THAN_TRUOC');
    assert.ok(errors[0].includes('QUAN_TRAI'),  'should mention QUAN_TRAI');
    assert.ok(errors[0].includes('3'),          'should report count of 3');
});

test('validateDocument passes for a valid complete shirt', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI']);
    assert.doesNotThrow(() => validateDocument(doc));
});

test('validateDocument passes on an empty document', function () {
    const { validateDocument } = makeEnv();
    assert.doesNotThrow(() => validateDocument(makeDoc([])));
});

test('validateDocument reports duplicate, shirt and pant errors all at once', function () {
    const { validateDocument } = makeEnv();
    // THAN_TRUOC duplicated, shirt incomplete (no sleeves), 2-piece pant missing a half.
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'THAN_SAU', 'QUAN_TRAI']);
    assert.throws(
        () => validateDocument(doc),
        function (err) {
            assert.ok(err.message.includes('bị lặp'),   'should report the duplicate');
            assert.ok(err.message.includes('TAY_TRAI'), 'should report the missing shirt part');
            assert.ok(err.message.includes('QUAN_PHAI'),'should report the missing pant half');
            return true;
        }
    );
});

test('performance: validateDocument on 50,000 irrelevant items completes in under 50ms', function () {
    const { validateDocument } = makeEnv();
    const names = [];
    for (var i = 0; i < 50000; i++) names.push('IRRELEVANT_' + i);
    const doc = makeDoc(names);

    const start = Date.now();
    validateDocument(doc);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, 'Expected < 50ms but took ' + elapsed + 'ms');
});

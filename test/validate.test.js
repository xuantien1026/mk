const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { createEnv } = require('./helpers/jsx-loader');

function makeEnv() {
    const { context, include } = createEnv();
    include('lib/names.jsx');
    include('lib/validate.jsx');
    return context;
}

function makeDoc(names) {
    return { pageItems: names.map(function (n) { return { name: n }; }) };
}

test('passes when no duplicates are present', function () {
    const { validateUniqueParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI', 'UNRELATED']);
    assert.doesNotThrow(() => validateUniqueParts(doc));
});

test('passes on an empty document', function () {
    const { validateUniqueParts } = makeEnv();
    assert.doesNotThrow(() => validateUniqueParts(makeDoc([])));
});

test('throws when a part appears more than once', function () {
    const { validateUniqueParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'THAN_SAU']);
    assert.throws(
        () => validateUniqueParts(doc),
        function (err) {
            assert.ok(err.message.includes('THAN_TRUOC'), 'message should name the duplicate');
            assert.ok(err.message.includes('2'),          'message should report the count');
            return true;
        }
    );
});

test('reports all duplicates in one throw, not just the first', function () {
    const { validateUniqueParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'QUAN_TRAI', 'QUAN_TRAI', 'QUAN_TRAI']);
    assert.throws(
        () => validateUniqueParts(doc),
        function (err) {
            assert.ok(err.message.includes('THAN_TRUOC'), 'should mention THAN_TRUOC');
            assert.ok(err.message.includes('QUAN_TRAI'),  'should mention QUAN_TRAI');
            assert.ok(err.message.includes('3'),          'should report count of 3');
            return true;
        }
    );
});

test('performance: 50,000 irrelevant items complete in under 50ms', function () {
    const { validateUniqueParts } = makeEnv();
    const names = [];
    for (var i = 0; i < 50000; i++) names.push('IRRELEVANT_' + i);
    const doc = makeDoc(names);

    const start = Date.now();
    validateUniqueParts(doc);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, 'Expected < 50ms but took ' + elapsed + 'ms');
});

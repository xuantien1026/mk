const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeEnv, makeDoc } = require('./helpers/helper');

test('no duplicate error when no duplicates are present', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI', 'UNRELATED']);
    assert.equal(collectDuplicateErrors(countParts(doc).counts).length, 0);
});

test('no duplicate error on an empty document', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    assert.equal(collectDuplicateErrors(countParts(makeDoc([])).counts).length, 0);
});

test('reports an error when a part appears more than once', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'THAN_SAU']);
    const errors = collectDuplicateErrors(countParts(doc).counts);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_TRUOC'), 'message should name the duplicate');
    assert.ok(errors[0].includes('2'),          'message should report the count');
});

test('reports all duplicates in one message, not just the first', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'QUAN_TRAI', 'QUAN_TRAI', 'QUAN_TRAI']);
    const errors = collectDuplicateErrors(countParts(doc).counts);
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
    // THAN_TRUOC duplicated, shirt body incomplete (missing THAN_SAU), 2-piece pant missing a half.
    const doc = makeDoc(['THAN_TRUOC', 'THAN_TRUOC', 'TAY_TRAI', 'TAY_PHAI', 'QUAN_TRAI']);
    assert.throws(
        () => validateDocument(doc),
        function (err) {
            assert.ok(err.message.includes('bị lặp'),   'should report the duplicate');
            assert.ok(err.message.includes('THAN_SAU'), 'should report the missing shirt part');
            assert.ok(err.message.includes('QUAN_PHAI'),'should report the missing pant half');
            return true;
        }
    );
});

test('no bounds error when every part has a real, non-zero extent', function () {
    const { collectBoundsErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI']);
    assert.equal(collectBoundsErrors(countParts(doc).items).length, 0);
});

test('reports a bounds error for a part with zero width or height', function () {
    const { collectBoundsErrors, countParts } = makeEnv();
    const doc = makeDoc([
        'THAN_TRUOC',
        { name: 'THAN_SAU',  geometricBounds: [0, 10, 0, 0] },   // width 0
        { name: 'TAY_TRAI',  geometricBounds: [0, 5, 10, 5] }    // height 0
    ]);
    const errors = collectBoundsErrors(countParts(doc).items);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_SAU'), 'should name the zero-width part');
    assert.ok(errors[0].includes('TAY_TRAI'), 'should name the zero-height part');
    assert.ok(!errors[0].includes('THAN_TRUOC'), 'should not flag the valid part');
});

test('bounds check measures the last element of a group', function () {
    const { collectBoundsErrors, countParts } = makeEnv();
    // Group whose last child is a degenerate (zero-height) bounding path.
    const doc = makeDoc([{
        name: 'THAN_TRUOC',
        typename: 'GroupItem',
        geometricBounds: [0, 10, 10, 0],                          // group bounds look fine
        pageItems: [
            { typename: 'PathItem', geometricBounds: [0, 10, 10, 0] },
            { typename: 'PathItem', geometricBounds: [0, 5, 10, 5] } // last child: height 0
        ]
    }]);
    const errors = collectBoundsErrors(countParts(doc).items);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('THAN_TRUOC'));
});

test('validateDocument reports a degenerate bounding path', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc([
        { name: 'THAN_TRUOC', geometricBounds: [0, 0, 0, 0] },   // collapsed
        'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI'
    ]);
    assert.throws(() => validateDocument(doc), /khung bao bị lỗi/i);
});

test('no SO error when SO is a text frame', function () {
    const { collectSoErrors, countParts } = makeEnv();
    const doc = makeDoc([
        'THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI',
        { name: 'SO', typename: 'TextFrame' }
    ]);
    assert.equal(collectSoErrors(countParts(doc).soItems).length, 0);
});

test('no SO error when the document has no SO at all', function () {
    const { collectSoErrors, countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI']);
    assert.equal(collectSoErrors(countParts(doc).soItems).length, 0);
});

test('reports an SO error, naming its actual type, when SO is not a text frame', function () {
    const { collectSoErrors, countParts } = makeEnv();
    const doc = makeDoc([{ name: 'SO', typename: 'GroupItem' }]);
    const errors = collectSoErrors(countParts(doc).soItems);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('TextFrame'), 'should state the required type');
    assert.ok(errors[0].includes('GroupItem'), 'should state the actual type');
});

test('validateDocument throws when SO is not a text frame', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc([
        'THAN_TRUOC', 'THAN_SAU', 'TAY_TRAI', 'TAY_PHAI',
        { name: 'SO', typename: 'PathItem' }
    ]);
    assert.throws(() => validateDocument(doc), /"Số" phải là TextFrame/);
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

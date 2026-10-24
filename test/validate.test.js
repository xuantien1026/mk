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

test('reports an SO nested inside a part group when it is not a text frame', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc([
        { name: 'THAN_TRUOC', typename: 'GroupItem', pageItems: [
            { name: 'SO', typename: 'GroupItem', pageItems: [] },
            { typename: 'PathItem', geometricBounds: [0, 10, 10, 0] }
        ] },
        'THAN_SAU'
    ]);
    assert.throws(() => validateDocument(doc), /"Số" phải là TextFrame \(hiện là GroupItem\)/);
});

test('accepts an SO text frame nested inside a part group', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc([
        { name: 'THAN_TRUOC', typename: 'GroupItem', pageItems: [
            { name: 'SO', typename: 'TextFrame' },
            { typename: 'PathItem', geometricBounds: [0, 10, 10, 0] }
        ] },
        'THAN_SAU'
    ]);
    assert.doesNotThrow(() => validateDocument(doc));
});

test('parts are only counted at the top level of a layer, not inside groups', function () {
    const { countParts } = makeEnv();
    const doc = makeDoc([
        'THAN_TRUOC',
        { name: 'WRAPPER', typename: 'GroupItem', pageItems: [{ name: 'THAN_TRUOC' }] }
    ]);
    assert.equal(countParts(doc).counts.THAN_TRUOC, 1);
});

test('parts on sublayers are counted', function () {
    const { countParts } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC']);
    doc.layers[0].layers = [{ pageItems: [{ name: 'THAN_SAU' }], layers: [] }];
    assert.equal(countParts(doc).counts.THAN_SAU, 1);
});

test('validateDocument does not walk the flattened Document.pageItems', function () {
    const { validateDocument } = makeEnv();
    const doc = makeDoc(['THAN_TRUOC', 'THAN_SAU']);
    Object.defineProperty(doc, 'pageItems', {
        get() { throw new Error('Document.pageItems must not be scanned'); }
    });
    assert.doesNotThrow(() => validateDocument(doc));
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

// A fake vector digit set group (SO_AO by default) holding the given digit names (each
// a valid 10x10 path unless given as an object).
function soVector(digits, name) {
    return {
        name: name || 'SO_AO', typename: 'GroupItem', geometricBounds: [0, 10, 100, 0],
        pageItems: digits.map(function (d) {
            return typeof d === 'string' ? { name: d, typename: 'GroupItem', geometricBounds: [0, 10, 10, 0] } : d;
        })
    };
}
const ALL_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

test('validateDocument passes without vector digit sets (SO stays text)', function () {
    const { collectSoVectorErrors, countParts } = makeEnv();
    const items = countParts(makeDoc(['THAN_TRUOC', 'THAN_SAU'])).items;
    assert.equal(collectSoVectorErrors(items.SO_AO, 'SO_AO').length, 0);
    assert.equal(collectSoVectorErrors(items.SO_QUAN, 'SO_QUAN').length, 0);
});

test('validateDocument passes with complete SO_AO and SO_QUAN digit sets', function () {
    const { validateDocument } = makeEnv();
    assert.doesNotThrow(() => validateDocument(makeDoc(['THAN_TRUOC', 'THAN_SAU', 'QUAN_TRAI', 'QUAN_PHAI',
        soVector(ALL_DIGITS, 'SO_AO'), soVector(ALL_DIGITS, 'SO_QUAN')])));
});

test('validateDocument passes with only one of SO_AO / SO_QUAN', function () {
    const { validateDocument } = makeEnv();
    assert.doesNotThrow(() => validateDocument(makeDoc(['THAN_TRUOC', 'THAN_SAU', soVector(ALL_DIGITS, 'SO_AO')])));
    assert.doesNotThrow(() => validateDocument(makeDoc(['QUAN_TRAI', 'QUAN_PHAI', soVector(ALL_DIGITS, 'SO_QUAN')])));
});

test('reports missing, duplicated, empty and text digits in a vector digit set', function () {
    const { collectSoVectorErrors, countParts } = makeEnv();
    const digits = ['0', '1', '1', '3', '4', '5', '6', '7',
        { name: '8', typename: 'PathItem', geometricBounds: [0, 0, 0, 0] },
        { name: '9', typename: 'TextFrame', geometricBounds: [0, 10, 10, 0] }];
    const errors = collectSoVectorErrors(countParts(makeDoc([soVector(digits, 'SO_QUAN')])).items.SO_QUAN, 'SO_QUAN');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('SO_QUAN'),              'should name the group');
    assert.ok(errors[0].includes('thiếu số 2'),           'should report the missing digit');
    assert.ok(errors[0].includes('số 1 xuất hiện 2 lần'), 'should report the duplicated digit');
    assert.ok(errors[0].includes('số 8 rỗng'),            'should report the empty digit');
    assert.ok(errors[0].includes('số 9 là chữ'),          'should report the text digit');
});

test('reports each invalid vector digit set separately', function () {
    const { validateDocument } = makeEnv();
    assert.throws(() => validateDocument(makeDoc([soVector(['0'], 'SO_AO'), soVector(ALL_DIGITS, 'SO_QUAN')])),
        (e) => e.message.includes('"SO_AO"') && !e.message.includes('"SO_QUAN"'));
    assert.throws(() => validateDocument(makeDoc([soVector(ALL_DIGITS, 'SO_AO'), soVector(['0'], 'SO_QUAN')])),
        (e) => e.message.includes('"SO_QUAN"') && !e.message.includes('"SO_AO"'));
});

test('reports a vector digit set that is not a group', function () {
    const { validateDocument } = makeEnv();
    assert.throws(() => validateDocument(makeDoc([{ name: 'SO_AO', typename: 'PathItem' }])), /SO_AO/);
    assert.throws(() => validateDocument(makeDoc([{ name: 'SO_QUAN', typename: 'PathItem' }])), /SO_QUAN/);
});

test('reports a duplicated vector digit set group', function () {
    const { collectDuplicateErrors, countParts } = makeEnv();
    const errors = collectDuplicateErrors(countParts(makeDoc([
        soVector(ALL_DIGITS, 'SO_QUAN'), soVector(ALL_DIGITS, 'SO_QUAN'), soVector(ALL_DIGITS, 'SO_AO')])).counts);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('SO_QUAN'));
    assert.ok(!errors[0].includes('SO_AO'));
});

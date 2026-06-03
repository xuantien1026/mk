var UNIQUE_PART_NAMES = [
    THAN_TRUOC, THAN_SAU, TAY_TRAI, TAY_PHAI,
    QUAN_TRAI, QUAN_PHAI,
    QUAN_TRAI1, QUAN_TRAI2, QUAN_PHAI1, QUAN_PHAI2
];

function validateUniqueParts(doc) {
    var counts = {};
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) counts[UNIQUE_PART_NAMES[i]] = 0;

    var items = doc.pageItems;
    for (var i = 0; i < items.length; i++) {
        var n = items[i].name;
        if (counts.hasOwnProperty(n)) counts[n]++;
    }

    var dupes = [];
    for (var i = 0; i < UNIQUE_PART_NAMES.length; i++) {
        var n = UNIQUE_PART_NAMES[i];
        if (counts[n] > 1) dupes.push(n + ' (xuất hiện ' + counts[n] + ' lần)');
    }
    if (dupes.length > 0) {
        throw new Error('File thiết kế có phần tử bị lặp — mỗi phần tử chỉ được xuất hiện 1 lần:\n- '
            + dupes.join('\n- '));
    }
}

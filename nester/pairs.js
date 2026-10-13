// Parts that must be placed one right after the other: job.pairs, [[a, b], ...] part
// indices — a shirt's front and back, when the front carries its number
// (lib/layout_nest.jsx).

// part → its pair partner; null when the job has no pairs.
function partnersOf(job) {
    if (!job.pairs || !job.pairs.length) return null;
    const partner = new Map();
    for (const [a, b] of job.pairs) { partner.set(a, b); partner.set(b, a); }
    return partner;
}

module.exports = { partnersOf };

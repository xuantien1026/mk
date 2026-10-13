// Order constraints on a job's parts (lib/layout_nest.jsx):
//  - job.pairs, [[a, b], ...] part indices, placed one right after the other — a
//    shirt's front and back, when the front carries its number;
//  - job.pants, [part, ...], placed after every other part — the pants, when the user
//    wants all shirts and sleeves first.

// part → its pair partner; null when the job has no pairs.
function partnersOf(job) {
    if (!job.pairs || !job.pairs.length) return null;
    const partner = new Map();
    for (const [a, b] of job.pairs) { partner.set(a, b); partner.set(b, a); }
    return partner;
}

// The set of parts to place last; null when the job has none.
function pantsOf(job) {
    return job.pants && job.pants.length ? new Set(job.pants) : null;
}

module.exports = { partnersOf, pantsOf };

// Order constraints on a job's parts (lib/layout_nest.jsx):
//  - job.pairs, [[a, b], ...] part indices, placed one right after the other — a
//    shirt's front and back, when the front carries its number;
//  - job.stages, one number per part: parts are placed stage by stage, lowest first —
//    e.g. the pants after every shirt and sleeve, or size by size, or both.

// part → its pair partner; null when the job has no pairs.
function partnersOf(job) {
    if (!job.pairs || !job.pairs.length) return null;
    const partner = new Map();
    for (const [a, b] of job.pairs) { partner.set(a, b); partner.set(b, a); }
    return partner;
}

// Each part's stage (job.stages); null when the job has none, or only one.
function stagesOf(job) {
    if (!job.stages) return null;
    if (job.stages.length !== job.parts.length) throw new Error('job.stages needs one stage per part');
    return job.stages.some((s) => s !== job.stages[0]) ? job.stages : null;
}

module.exports = { partnersOf, stagesOf };

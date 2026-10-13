// Genetic algorithm over part order and rotation (the SVGnest / Deepnest approach). A
// candidate is a list of genes [{ part, rot }]; its fitness is what place.js's
// placeAll gives for it. evaluate() is injected so candidates can be scored on worker
// threads (pool.js) or in-process (tests).
//
// job.pairs ([[a, b], ...], part indices) are parts that must be placed one right after
// the other (either first): a shirt's front and back, when the front carries its
// number. Every candidate keeps each pair as neighbours — see keepPairs.
//
// job.stages (one number per part) orders the parts in stages: the pants after every
// shirt and sleeve, and/or size by size, when the user wants that. Every candidate has
// its parts in stage order — see inStages.
const { partnersOf, stagesOf } = require('./pairs');

// Small seeded PRNG (mulberry32), so a run is reproducible.
function makeRandom(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// genes with each pair's second part moved to right after its first. Everything else
// keeps its order.
function keepPairs(genes, partner) {
    if (!partner) return genes;
    const byPart = new Map(genes.map((x) => [x.part, x]));
    const out = [], done = new Set();
    for (const x of genes) {
        if (done.has(x.part)) continue;
        out.push(x);
        done.add(x.part);
        const p = partner.get(x.part);
        if (p !== undefined && !done.has(p)) { out.push(byPart.get(p)); done.add(p); }
    }
    return out;
}

// genes sorted by stage. Within a stage they keep their order.
function inStages(genes, stages) {
    if (!stages) return genes;
    return genes.map((x, i) => [x, i])
        .sort((a, b) => stages[a[0].part] - stages[b[0].part] || a[1] - b[1])
        .map(([x]) => x);
}

// genes made to keep the job's order constraints. Pairs are a shirt's front and back,
// so never span two stages.
function arrange(genes, partner, stages) {
    return inStages(keepPairs(genes, partner), stages);
}

// genes (pairs already neighbours) cut into units: a pair, or a single part.
function unitsOf(genes, partner) {
    const units = [];
    for (let i = 0; i < genes.length; i++) {
        if (partner && i + 1 < genes.length && partner.get(genes[i].part) === genes[i + 1].part) {
            units.push([genes[i], genes[i + 1]]);
            i++;
        } else {
            units.push([genes[i]]);
        }
    }
    return units;
}

// Starting candidates:
//  - largest part first, all upright;
//  - largest first, every other copy of a shape turned 180° (head-to-toe pairs);
//  - the job's own order (engine 1's sequence), all upright.
function seeds(parts, areaOf, rotations, partner = null, stages = null) {
    const idx = parts.map((_, i) => i);
    const bySize = idx.slice().sort((a, b) => areaOf(b) - areaOf(a) || a - b);
    const turn = rotations.includes(180);
    const seen = {};
    const alternating = bySize.map((part) => {
        const n = (seen[parts[part].shape] = (seen[parts[part].shape] || 0) + 1);
        return { part, rot: turn && n % 2 === 0 ? 180 : 0 };
    });
    return [
        bySize.map((part) => ({ part, rot: 0 })),
        alternating,
        idx.map((part) => ({ part, rot: 0 }))
    ].map((genes) => arrange(genes, partner, stages));
}

// Swap neighbours / flip rotations, each with probability rate. A pair moves as one
// unit, and may also swap which of its two goes first. Swapping two copies of the same
// shape and rotation changes nothing, so those swaps are skipped; a swap across two
// stages is undone by inStages.
function mutate(genes, parts, rate, rotations, random, partner = null, stages = null) {
    const units = unitsOf(genes.map((x) => ({ part: x.part, rot: x.rot })), partner);
    for (let i = 0; i < units.length; i++) {
        if (i + 1 < units.length && random() < rate) {
            const a = units[i], b = units[i + 1];
            const same = a.length === 1 && b.length === 1
                && parts[a[0].part].shape === parts[b[0].part].shape && a[0].rot === b[0].rot;
            if (!same) { units[i] = b; units[i + 1] = a; }
        }
        if (units[i].length === 2 && random() < rate) units[i].reverse();
    }
    const out = inStages([].concat(...units), stages);
    if (rotations.length > 1) {
        for (const x of out) if (random() < rate) x.rot = rotations[Math.floor(random() * rotations.length)];
    }
    return out;
}

// Single-point order crossover: the child takes p1's genes up to the cut, then the
// remaining parts in p2's order (with p2's rotations); a pair the cut splits is joined
// up again, and the stages put back in order.
function crossover(p1, p2, random, partner = null, stages = null) {
    const cut = Math.round(Math.min(Math.max(random(), 0.1), 0.9) * (p1.length - 1));
    const child = p1.slice(0, cut).map((x) => ({ part: x.part, rot: x.rot }));
    const taken = new Set(child.map((x) => x.part));
    for (const x of p2) if (!taken.has(x.part)) child.push({ part: x.part, rot: x.rot });
    return arrange(child, partner, stages);
}

// Pick a parent, favouring better-ranked ones (population sorted best first).
function pick(population, random, exclude) {
    const n = population.length;
    const total = (n * (n + 1)) / 2;
    for (let tries = 0; tries < 10; tries++) {
        let r = random() * total;
        for (let i = 0; i < n; i++) {
            r -= n - i;
            if (r <= 0) {
                if (population[i] !== exclude) return population[i];
                break;
            }
        }
    }
    return population[0] === exclude && n > 1 ? population[1] : population[0];
}

// Run the search until timeLimitMs (always finishing the first generation) or until
// `patience` generations bring no improvement.
//   evaluate(listOfGenes) → Promise<[{ fitness, ... }]> (same order)
//   onProgress({ generation, evaluations, best, elapsedMs }) after every generation
// Resolves to the best evaluation, with its genes.
async function search(job, { evaluate, areaOf, timeLimitMs = 60000, populationSize = 10, mutationRate = 0.1,
                             patience = 200, seed = 1, onProgress } = {}) {
    const random = makeRandom(seed);
    const rotations = job.rotations || [0, 180];
    const partner = partnersOf(job), stages = stagesOf(job);
    const start = Date.now();
    let evaluations = 0;

    async function score(list) {
        const results = await evaluate(list);
        evaluations += list.length;
        return results.map((r, i) => Object.assign({ genes: list[i] }, r));
    }

    const initial = seeds(job.parts, areaOf, rotations, partner, stages);
    const base = initial[1];
    while (initial.length < populationSize) initial.push(mutate(base, job.parts, 0.3, rotations, random, partner, stages));
    let population = (await score(initial)).sort((a, b) => a.fitness - b.fitness);
    let best = population[0];
    let generation = 0, stale = 0;
    if (onProgress) onProgress({ generation, evaluations, best, elapsedMs: Date.now() - start });

    while (Date.now() - start < timeLimitMs && stale < patience) {
        generation++;
        const children = [];
        while (children.length < populationSize - 1) {
            const p1 = pick(population, random);
            const p2 = pick(population, random, p1);
            children.push(mutate(crossover(p1.genes, p2.genes, random, partner, stages), job.parts, mutationRate,
                                 rotations, random, partner, stages));
        }
        const scored = await score(children);
        population = [best].concat(scored).sort((a, b) => a.fitness - b.fitness); // elitism
        if (population[0].fitness < best.fitness - 1e-9) { best = population[0]; stale = 0; } else stale++;
        if (onProgress) onProgress({ generation, evaluations, best, elapsedMs: Date.now() - start });
    }
    return best;
}

module.exports = { search, seeds, mutate, crossover, makeRandom };

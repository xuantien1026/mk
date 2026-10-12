// Genetic algorithm over part order and rotation (the SVGnest / Deepnest approach). A
// candidate is a list of genes [{ part, rot }]; its fitness is what place.js's
// placeAll gives for it. evaluate() is injected so candidates can be scored on worker
// threads (pool.js) or in-process (tests).

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

// Starting candidates:
//  - largest part first, all upright;
//  - largest first, every other copy of a shape turned 180° (head-to-toe pairs);
//  - the job's own order (engine 1's sequence), all upright.
function seeds(parts, areaOf, rotations) {
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
    ];
}

// Swap neighbours / flip rotations, each with probability rate. Swapping two copies of
// the same shape and rotation changes nothing, so those swaps are skipped.
function mutate(genes, parts, rate, rotations, random) {
    const out = genes.map((x) => ({ part: x.part, rot: x.rot }));
    for (let i = 0; i < out.length; i++) {
        if (i + 1 < out.length && random() < rate) {
            const a = out[i], b = out[i + 1];
            if (parts[a.part].shape !== parts[b.part].shape || a.rot !== b.rot) { out[i] = b; out[i + 1] = a; }
        }
        if (rotations.length > 1 && random() < rate) {
            out[i].rot = rotations[Math.floor(random() * rotations.length)];
        }
    }
    return out;
}

// Single-point order crossover: the child takes p1's genes up to the cut, then the
// remaining parts in p2's order (with p2's rotations).
function crossover(p1, p2, random) {
    const cut = Math.round(Math.min(Math.max(random(), 0.1), 0.9) * (p1.length - 1));
    const child = p1.slice(0, cut).map((x) => ({ part: x.part, rot: x.rot }));
    const taken = new Set(child.map((x) => x.part));
    for (const x of p2) if (!taken.has(x.part)) child.push({ part: x.part, rot: x.rot });
    return child;
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
    const start = Date.now();
    let evaluations = 0;

    async function score(list) {
        const results = await evaluate(list);
        evaluations += list.length;
        return results.map((r, i) => Object.assign({ genes: list[i] }, r));
    }

    const initial = seeds(job.parts, areaOf, rotations);
    const base = initial[1];
    while (initial.length < populationSize) initial.push(mutate(base, job.parts, 0.3, rotations, random));
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
            children.push(mutate(crossover(p1.genes, p2.genes, random), job.parts, mutationRate, rotations, random));
        }
        const scored = await score(children);
        population = [best].concat(scored).sort((a, b) => a.fitness - b.fitness); // elitism
        if (population[0].fitness < best.fitness - 1e-9) { best = population[0]; stale = 0; } else stale++;
        if (onProgress) onProgress({ generation, evaluations, best, elapsedMs: Date.now() - start });
    }
    return best;
}

module.exports = { search, seeds, mutate, crossover, makeRandom };

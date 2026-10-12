// Scores GA candidates on worker threads. Each worker builds its own placement context
// (shapes + NFP cache) once, then places whatever gene lists it is sent.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { createContext, placeAll } = require('./place');

if (!isMainThread) {
    const ctx = createContext(workerData.job, workerData.opts);
    parentPort.on('message', ({ id, genes }) => {
        try {
            parentPort.postMessage({ id, result: placeAll(ctx, genes) });
        } catch (e) {
            parentPort.postMessage({ id, error: e.message });
        }
    });
}

// Returns { evaluate(listOfGenes) → Promise<[layout]>, close() }.
function createPool(job, opts = {}, size = Math.max(1, os.cpus().length - 1)) {
    const workers = [];
    const idle = [];
    const queue = [];
    const pending = new Map();
    let nextId = 0;

    function dispatch() {
        while (idle.length && queue.length) {
            const w = idle.pop();
            const task = queue.shift();
            pending.set(task.id, { task, w });
            w.postMessage({ id: task.id, genes: task.genes });
        }
    }

    for (let i = 0; i < size; i++) {
        const w = new Worker(__filename, { workerData: { job, opts } });
        w.on('message', ({ id, result, error }) => {
            const { task } = pending.get(id);
            pending.delete(id);
            idle.push(w);
            if (error) task.reject(new Error(error)); else task.resolve(result);
            dispatch();
        });
        w.on('error', (e) => {
            for (const [id, p] of pending) if (p.w === w) { pending.delete(id); p.task.reject(e); }
        });
        workers.push(w);
        idle.push(w);
    }

    return {
        size,
        evaluate(list) {
            return Promise.all(list.map((genes) => new Promise((resolve, reject) => {
                queue.push({ id: nextId++, genes, resolve, reject });
                dispatch();
            })));
        },
        close() {
            return Promise.all(workers.map((w) => w.terminate()));
        }
    };
}

module.exports = { createPool };

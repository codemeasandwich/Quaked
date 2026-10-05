// Run the actual browser generator worker in an isolated Node worker thread.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
await import('../../src/rockfield_worker.js');
parentPort.on('message',data=>self.onmessage({data}));

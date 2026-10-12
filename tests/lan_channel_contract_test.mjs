/** Tests the exact production IPC adapter used by Tauri, with controlled command
 * completion so peer departure and teardown races are deterministic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLanChannel } from '../src/platform/lan_channel.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  const end = performance.now() + 1000;
  while (!predicate()) { assert(performance.now() < end, 'adapter operation settles'); await turn(); }
}
const message = (to, value, from = 'host') => ({ k: 'msg', from, to, r: 1, b: new Uint8Array([value]) });
function harness(id = 'host', overrides = {}) {
  const poll = deferred(), calls = [], events = [], ended = [];
  const state = { out: [], sending: false, closed: false, peers: new Set(['peer-a', 'peer-b']),
    address: '127.0.0.1:26000', fingerprint: 'test-game', ready: Promise.resolve(), timer: null };
  const endSession = ending => { ended.push(ending); ending.closed = true; clearTimeout(ending.timer); };
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (overrides[command]) return overrides[command](args);
    if (command === 'lan_poll') return poll.promise;
    return true;
  };
  const channel = createLanChannel(state, id, { invoke, endSession });
  channel.onmessage = event => events.push(event.data);
  return { state, channel, poll, calls, events, ended };
}

test('departing peer queued sends cannot close host or prevent another peer receiving', async () => {
  const first = deferred();
  const h = harness('host', { lan_send: ({ message }) => message.to === 'peer-a' ? first.promise : true });
  try {
    h.channel.postMessage(message('peer-a', 1));
    await until(() => h.calls.some(c => c.command === 'lan_send'));
    h.channel.postMessage(message('peer-b', 2));
    h.channel.postMessage(message('peer-a', 3));
    h.channel.postMessage(message('peer-b', 4));
    first.reject(Error('LAN peer disconnected'));
    await until(() => !h.state.sending);
    assert.deepEqual(h.calls.filter(c => c.command === 'lan_send').map(c => [c.args.message.to, c.args.message.b]),
      [['peer-a', [1]], ['peer-b', [2]], ['peer-b', [4]]]);
    assert.deepEqual(h.events, [{ k: 'close', from: 'peer-a', to: 'host' }]);
    assert.equal(h.state.closed, false);
    assert.equal(h.ended.length, 0);
    assert(h.state.peers.has('peer-b'));
    assert(!h.state.peers.has('peer-a'));
  } finally { h.channel.close(); h.poll.resolve([]); await turn(); }
});

test('asynchronous sends preserve peer FIFO and copy bytes before caller reuse', async () => {
  const first = deferred(); let pending = 0, highest = 0, sent = 0;
  const h = harness('host', { lan_send: async () => {
    pending++; highest = Math.max(highest, pending);
    if (sent++ === 0) await first.promise;
    pending--;
  } });
  try {
    const original = message('peer-a', 1);
    h.channel.postMessage(original); original.b[0] = 99;
    h.channel.postMessage(message('peer-b', 2));
    h.channel.postMessage(message('peer-a', 3));
    await until(() => pending === 1);
    assert.equal(h.calls.filter(c => c.command === 'lan_send').length, 1);
    first.resolve(); await until(() => !h.state.sending);
    assert.equal(highest, 1, 'only one IPC send may be outstanding');
    assert.deepEqual(h.calls.filter(c => c.command === 'lan_send').map(c => [c.args.message.to, c.args.message.b]),
      [['peer-a', [1]], ['peer-b', [2]], ['peer-a', [3]]]);
  } finally { first.resolve(); h.channel.close(); h.poll.resolve([]); await turn(); }
});

test('poll events completing after close cannot reach the driver or restart polling', async () => {
  const h = harness();
  await until(() => h.calls.some(c => c.command === 'lan_poll'));
  h.channel.close();
  h.poll.resolve([{ k: 'msg', from: 'peer-a', to: 'host', r: 1, b: [7] }]);
  await turn(); await turn();
  h.channel.postMessage(message('peer-b', 8));
  assert.deepEqual(h.events, []);
  assert.equal(h.calls.filter(c => c.command === 'lan_poll').length, 1);
  assert.equal(h.calls.filter(c => c.command === 'lan_send').length, 0);
  assert.equal(h.ended.length, 1);
});

test('late poll failure after close cannot emit fresh driver events', async t => {
  t.mock.method(console, 'error', () => {});
  const h = harness();
  await until(() => h.calls.some(c => c.command === 'lan_poll'));
  h.channel.close(); h.poll.reject(Error('old session went away'));
  await turn(); await turn();
  assert.deepEqual(h.events, [], 'closed adapter drops stale errors as well as successful replies');
  assert.equal(h.ended.length, 1, 'teardown occurs once');
});

test('late send failure after close cannot manufacture another peer departure', async () => {
  const sent = deferred(), h = harness('host', { lan_send: () => sent.promise });
  h.channel.postMessage(message('peer-a', 1));
  await until(() => h.calls.some(c => c.command === 'lan_send'));
  h.channel.close(); sent.reject(Error('old send failed')); h.poll.resolve([]);
  await until(() => !h.state.sending);
  assert.deepEqual(h.events, []);
  assert.equal(h.ended.length, 1);
});

test('rejected client handshake closes that client without ending an independent host', async t => {
  t.mock.method(console, 'error', () => {});
  const joining = deferred(), host = harness(), client = harness('client-id', { lan_join: () => joining.promise });
  try {
    joining.reject(Error('Game files or engine version differ'));
    await until(() => client.state.closed);
    assert.equal(client.ended.length, 1);
    assert.deepEqual(client.events.map(e => [e.k, e.from, e.to]),
      [['refuse', 'host', 'client-id'], ['close', 'host', 'client-id']]);
    assert.match(client.events[0].reason, /Game files/);
    assert.equal(client.calls.some(c => c.command === 'lan_poll'), false);
    assert.equal(host.state.closed, false);
    assert.equal(host.ended.length, 0);
  } finally { host.channel.close(); host.poll.resolve([]); client.poll.resolve([]); await turn(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { storage, SAVE_KEYS, clearGameData } from '../js/storage.js';
const backend = new Map();
globalThis.localStorage = {
  getItem: key => backend.get(key) ?? null,
  setItem: (key, value) => backend.set(key, value),
  removeItem: key => backend.delete(key),
};
let seq = 0;
async function collection(seed = {}) {
  for (const key of SAVE_KEYS) storage.removeItem(key);
  for (const [key,value] of Object.entries(seed)) storage.setItem(key, JSON.stringify(value));
  return await import(`../js/collection.js?fixture=${++seq}`);
}
test('malformed but valid JSON cannot break deck or inject win markup', async () => {
  const c = await collection({oshiri_deck:{bad:true},oshiri_cardwins:{ojisan:'<img onerror=alert(1)>'},oshiri_cards:{unknown:7},oshiri_cardmisc:{starterBought:'false',pity:-9}});
  assert.equal(c.getDeck(), null); assert.equal(c.winCount('ojisan'), 0);
  assert.deepEqual(c.ownedKinds(), []); assert.equal(c.unlocked(), false);
  assert.ok(c.validateDeck({bad:true}).length > 0);
});
test('starter pack and valid existing cards/deck survive sanitization', async () => {
  const c = await collection(); c.openPack('starter');
  const deck = c.getDeck(); assert.equal(deck.reduce((n, [,v]) => n+v, 0), 15);
  assert.deepEqual(c.validateDeck(deck), []);
  c.recordWin('ojisan'); assert.equal(c.winCount('ojisan'), 1);
  const d = await import(`../js/collection.js?fixture=${++seq}`);
  assert.deepEqual(d.getDeck(), deck); assert.deepEqual(d.ownedAll(), c.ownedAll());
  assert.equal(d.winCount('ojisan'), 1); assert.equal(d.unlocked(), true);
});
test('negative, duplicate over-count, unknown and prototype card IDs are rejected', async () => {
  const c = await collection(); c.openPack('starter');
  const id = c.getDeck()[0][0];
  for (const deck of [[[id,-1]],[[id,15],[id,15]],[['__proto__',1]],[['unknown',1]]]) {
    c.setDeck(deck); assert.equal(c.getDeck(), null); assert.ok(c.validateDeck(deck).length);
  }
});
test('reset removes only this game and preserves another project on the same origin', async () => {
  backend.set('other_game_progress','99');
  const c = await collection(); c.openPack('starter');
  assert.equal(clearGameData(), true);
  for (const key of SAVE_KEYS) assert.equal(backend.has(key), false);
  assert.equal(backend.get('other_game_progress'), '99');
});

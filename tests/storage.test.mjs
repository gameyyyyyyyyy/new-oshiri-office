import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, countMap, normalizeSettings, count, MAX_COUNT } from '../js/storage.js';

test('blocked storage still supports this session, warns once and does not crash', () => {
  let warnings = 0;
  const s = createStorage(() => { throw new Error('SecurityError'); }, () => warnings++);
  assert.equal(s.getItem('a'), null);
  assert.equal(s.setItem('a', 12), false);
  assert.equal(s.getItem('a'), '12');
  assert.equal(s.removeItem('a'), false);
  assert.equal(s.getItem('a'), null);
  assert.equal(warnings, 1);
});
test('quota failure retains the latest value for the session', () => {
  const backend = { getItem: () => '5', setItem() { throw new Error('QuotaExceededError'); } };
  const s = createStorage(() => backend);
  assert.equal(s.getItem('score'), '5');
  s.setItem('score', 6);
  assert.equal(s.getItem('score'), '6');
});
test('hostile save strings and prototype keys cannot become displayed records', () => {
  const data = JSON.parse('{"hoshi":"<img src=x onerror=alert(1)>","trash":"12","unknown":20,"__proto__":{"polluted":true}}');
  const records = countMap(data, ['hoshi', 'trash']);
  assert.equal(records.hoshi, 0); assert.equal(records.trash, 12);
  assert.deepEqual(Object.keys(records), ['hoshi', 'trash']);
  assert.equal(Object.getPrototypeOf(records), null);
  assert.equal({}.polluted, undefined);
});
test('invalid numbers and settings are bounded without changing valid legacy values', () => {
  for (const v of [null, [], {}, true, 'NaN', 'Infinity', '<b>5</b>']) assert.equal(count(v), 0);
  assert.equal(count(-3), 0); assert.equal(count(1e100), MAX_COUNT);
  assert.equal(count('42'), 42);
  assert.deepEqual(normalizeSettings({bgm:0,sfx:0.25,voice:false,look:1.2,stick:0.8,move:1}),
    {bgm:0,sfx:0.25,voice:false,look:1.2,stick:0.8,move:1});
  const bad = normalizeSettings({bgm:'oops',sfx:99,voice:'false',look:-2,stick:99,move:[]});
  assert.deepEqual(bad, {bgm:1,sfx:1,voice:true,look:0.5,stick:2,move:0.6});
});

// All browser persistence goes through this module. Old save keys stay compatible.
export const MAX_COUNT = 1_000_000_000_000;
export const SAVE_KEYS = Object.freeze([
  'oshiri_cards', 'oshiri_deck', 'oshiri_cardwins', 'oshiri_cardmisc',
  'oshiri_pets', 'oshiri_clicks', 'oshiri_totalpt', 'oshiri_slaps',
  'oshiri_slapitems', 'oshiri_taps', 'oshiri_god', 'oshiri_settings',
  'oshiri_save_version',
]);

export function createStorage(getBackend, onFailure = () => {}) {
  const memory = new Map();
  let warned = false;
  function failed() {
    if (!warned) { warned = true; onFailure(); }
  }
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        const value = getBackend().getItem(key);
        memory.set(key, value);
        return value;
      } catch { failed(); return null; }
    },
    setItem(key, value) {
      const text = String(value);
      memory.set(key, text);
      try { getBackend().setItem(key, text); return true; }
      catch { failed(); return false; }
    },
    removeItem(key) {
      memory.set(key, null);
      try { getBackend().removeItem(key); return true; }
      catch { failed(); return false; }
    },
  };
}

export const storage = createStorage(() => globalThis.localStorage, () => {
  if (typeof document === 'undefined') return;
  const notice = document.getElementById('save-notice');
  if (notice) {
    notice.textContent = 'このブラウザでは記録を保存できません。遊べますが、閉じると今回の進み具合が失われることがあります。';
    notice.hidden = false;
  }
});

export function readJSON(key, fallback) {
  const raw = storage.getItem(key);
  if (!raw || raw.length > 500_000) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function boundedNumber(value, fallback = 0, min = 0, max = MAX_COUNT) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
export function count(value, fallback = 0, max = MAX_COUNT) {
  return Math.trunc(boundedNumber(value, fallback, 0, max));
}
export function readCount(key, fallback = 0) {
  return count(storage.getItem(key), fallback);
}
export function countMap(value, allowedKeys) {
  const result = Object.create(null);
  if (!isRecord(value)) return result;
  for (const key of allowedKeys) {
    if (Object.hasOwn(value, key)) result[key] = count(value[key]);
  }
  return result;
}
export function normalizeSettings(value) {
  const raw = isRecord(value) ? value : {};
  return {
    bgm: boundedNumber(raw.bgm, 1, 0, 1),
    sfx: boundedNumber(raw.sfx, 0.3, 0, 1),
    voice: typeof raw.voice === 'boolean' ? raw.voice : true,
    look: boundedNumber(raw.look, 0.7, 0.5, 2),
    stick: boundedNumber(raw.stick, 0.7, 0.5, 2),
    move: boundedNumber(raw.move, 0.6, 0.5, 1.5),
  };
}
export function clearGameData() {
  let complete = true;
  for (const key of SAVE_KEYS) if (!storage.removeItem(key)) complete = false;
  return complete;
}

// Firestore iç içe dizileri (dizi içinde dizi, örn. 2048 tahtası) saklayamaz. Böyle diziler
// kaydederken { __json: '...' } olarak metne çevrilir, yüklerken geri açılır.
const NESTED = '__json';

export function encodeState(value) {
  if (Array.isArray(value)) {
    return value.some(Array.isArray) ? { [NESTED]: JSON.stringify(value) } : value.map(encodeState);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeState(entry)]));
  }
  return value;
}

export function decodeState(value) {
  if (Array.isArray(value)) return value.map(decodeState);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === NESTED && typeof value[NESTED] === 'string') {
      try { return JSON.parse(value[NESTED]); } catch { return null; }
    }
    return Object.fromEntries(keys.map(key => [key, decodeState(value[key])]));
  }
  return value;
}

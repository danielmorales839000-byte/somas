/** Stable integrity across JSONB round-trips (which may reorder object properties). */
export function canonicalJson(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}

import { readFileSync } from 'node:fs'
const s = readFileSync('dist/assets/index-CWqlRsvv.js', 'utf8')
// usos del binding U importado de vendor-supabase
const uses = [...s.matchAll(/U\(/g)].length
console.log('llamadas U():', uses)
const ctx = [...s.matchAll(/.{60}U\(.{60}/g)].slice(0, 3)
ctx.forEach((m) => console.log('ctx:', m[0]))
// buscar dónde se llama createClient-like: "U(" con persistSession
const ps = s.indexOf('persistSession')
console.log('\npersistSession ctx:', s.slice(Math.max(0, ps - 200), ps + 80))

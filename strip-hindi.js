const fs = require('fs')
const path = require('path')

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f)
    return fs.statSync(p).isDirectory() ? walk(p) : (p.endsWith('.tsx') || p.endsWith('.ts')) ? [p] : []
  })
}

const dirs = [
  'D:/Github/Truck_Opti/frontend/src/pages',
  'D:/Github/Truck_Opti/frontend/src/layouts',
  'D:/Github/Truck_Opti/frontend/src/components',
]

let totalChanged = 0

for (const dir of dirs) {
  for (const f of walk(dir)) {
    let c = fs.readFileSync(f, 'utf8')
    if (!c.includes("language === 'en'")) continue
    let c2 = c
    c2 = c2.replace(/\{language === 'en'\s*\n\s*\? '([^']+)'\s*\n\s*: '[^']*'\}/g, '')
    c2 = c2.replace(/\{language === 'en' \? '([^']+)' : '[^']+'\}/g, '')
    c2 = c2.replace(/(:\s*)language === 'en'\s*\n\s*\? '([^']+)'\s*\n\s*: '[^']*'(,?)/g, "''")
    c2 = c2.replace(/language === 'en'\s*\n\s*\? '([^']+)'\s*\n\s*: '[^']*'/g, "''")
    c2 = c2.replace(/language === 'en' \? '([^']+)' : '[^']+'/g, "''")
    if (c2 !== c) { fs.writeFileSync(f, c2, 'utf8'); totalChanged++; console.log('Fixed: ' + path.basename(f)) }
  }
}
console.log('Total: ' + totalChanged)

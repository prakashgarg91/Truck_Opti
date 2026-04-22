const fs = require('fs')
const path = 'D:/Github/Truck_Opti/frontend/src/pages/NewShipmentPage.tsx'
let c = fs.readFileSync(path, 'utf8')

// Find and replace the multi-line toast with template literal
const oldPattern = /toast\(language === 'en'\s*\n\s*\? `Booking created! Notified \${dispatchResult} drivers\.`\s*\n\s*: `[^`]+`, \{ icon: '✅' \}\)/
const newStr = "toast(`Booking created! Notified ${dispatchResult} drivers.`, { icon: '✅' })"

if (oldPattern.test(c)) {
  c = c.replace(oldPattern, newStr)
  fs.writeFileSync(path, c, 'utf8')
  console.log('Fixed NewShipmentPage.tsx')
} else {
  // Show context around line 115
  const lines = c.split('\n')
  for (let i = 112; i < 120; i++) {
    console.log((i+1) + ': ' + JSON.stringify(lines[i]))
  }
}
console.log('Remaining language === en:', (c.match(/language === 'en'/g) || []).length)

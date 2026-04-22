const fs = require('fs')
const path = require('path')

// Files where language import is fully unused
const unusedFiles = [
  'D:/Github/Truck_Opti/frontend/src/pages/AdminDashboardPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/AgencyDriversPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/AgencyRegisterPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/auth/LoginPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/auth/SignupPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/CompanyProfilePage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/DriverDashboardPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/DriverTripPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/NewShipmentPage.tsx',
  'D:/Github/Truck_Opti/frontend/src/pages/TestPaymentPage.tsx',
]

let count = 0
for (const f of unusedFiles) {
  let c = fs.readFileSync(f, 'utf8')
  const orig = c

  // Remove import line
  c = c.replace(/^import \{ useLanguageStore \} from ['"][^'"]+languageStore['"]\r?\n/m, '')
  // Remove const destructuring line (various spacing)
  c = c.replace(/^[ \t]*const \{ language(?:, toggleLanguage)? \} = useLanguageStore\(\)\r?\n/m, '')
  c = c.replace(/^[ \t]*const \{ toggleLanguage(?:, language)? \} = useLanguageStore\(\)\r?\n/m, '')
  // Remove if language is still declared with some variant
  c = c.replace(/^[ \t]*const \{ language \} = useLanguageStore\(\)\r?\n/m, '')

  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8')
    count++
    console.log('Cleaned: ' + path.basename(f))
  }
}
console.log('\nTotal: ' + count)

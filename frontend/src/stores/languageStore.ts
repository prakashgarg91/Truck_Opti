import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Language = 'en' | 'hi'

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: (en: string, hi: string) => string
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'en',
      
      setLanguage: (language) => set({ language }),
      
      toggleLanguage: () => set((state) => ({ 
        language: state.language === 'en' ? 'hi' : 'en' 
      })),
      
      // Translation helper
      t: (en: string, hi: string) => {
        return get().language === 'en' ? en : hi
      }
    }),
    {
      name: 'truckopti-language',
    }
  )
)

// Common translations
export const translations = {
  // Navigation
  home: { en: 'Home', hi: 'होम' },
  dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  packing: { en: '3D Pack', hi: 'पैकिंग' },
  routes: { en: 'Routes', hi: 'रूट' },
  tracking: { en: 'Track', hi: 'ट्रैक' },
  manage: { en: 'Manage', hi: 'मैनेज' },
  profile: { en: 'Profile', hi: 'प्रोफाइल' },
  settings: { en: 'Settings', hi: 'सेटिंग्स' },
  help: { en: 'Help & Support', hi: 'सहायता' },
  logout: { en: 'Logout', hi: 'लॉगआउट' },
  
  // Dashboard
  goodMorning: { en: 'Good Morning', hi: 'सुप्रभात' },
  goodAfternoon: { en: 'Good Afternoon', hi: 'नमस्कार' },
  goodEvening: { en: 'Good Evening', hi: 'शुभ संध्या' },
  activeShipments: { en: 'Active Shipments', hi: 'सक्रिय शिपमेंट' },
  trucksInTransit: { en: 'Trucks in Transit', hi: 'पारगमन में ट्रक' },
  routesToday: { en: 'Routes Today', hi: 'आज के रूट' },
  deliveriesDone: { en: 'Deliveries Done', hi: 'डिलीवरी पूर्ण' },
  quickActions: { en: 'Quick Actions', hi: 'त्वरित कार्रवाई' },
  recentActivity: { en: 'Recent Activity', hi: 'हाल की गतिविधि' },
  viewAll: { en: 'View all', hi: 'सभी देखें' },
  
  // Management
  trucks: { en: 'Trucks', hi: 'ट्रक' },
  cartons: { en: 'Cartons', hi: 'कार्टन' },
  customers: { en: 'Customers', hi: 'ग्राहक' },
  addNew: { en: 'Add New', hi: 'नया जोड़ें' },
  edit: { en: 'Edit', hi: 'संपादित करें' },
  delete: { en: 'Delete', hi: 'हटाएं' },
  save: { en: 'Save', hi: 'सहेजें' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  search: { en: 'Search', hi: 'खोजें' },
  
  // Packing
  startPacking: { en: 'Start Packing', hi: 'पैकिंग शुरू करें' },
  selectTruck: { en: 'Select Truck', hi: 'ट्रक चुनें' },
  addItems: { en: 'Add Items', hi: 'आइटम जोड़ें' },
  optimize: { en: 'Optimize', hi: 'अनुकूलित करें' },
  utilization: { en: 'Utilization', hi: 'उपयोग' },
  
  // Settings
  darkMode: { en: 'Dark Mode', hi: 'डार्क मोड' },
  language: { en: 'Language', hi: 'भाषा' },
  notifications: { en: 'Notifications', hi: 'सूचनाएं' },
  subscription: { en: 'Subscription', hi: 'सदस्यता' },
  
  // Common
  loading: { en: 'Loading...', hi: 'लोड हो रहा है...' },
  error: { en: 'Error', hi: 'त्रुटि' },
  success: { en: 'Success', hi: 'सफलता' },
  confirm: { en: 'Confirm', hi: 'पुष्टि करें' },
  back: { en: 'Back', hi: 'वापस' },
}

// Hook for getting translations
export function useTranslation() {
  const { language, t, toggleLanguage, setLanguage } = useLanguageStore()
  
  const tr = (key: keyof typeof translations) => {
    const trans = translations[key]
    return language === 'en' ? trans.en : trans.hi
  }
  
  return { language, t, tr, toggleLanguage, setLanguage }
}

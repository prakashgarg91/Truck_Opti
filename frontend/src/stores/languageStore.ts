import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'en' | 'hi' | 'gu' | 'mr' | 'ta' | 'te'

// Language display names in their own scripts
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'हिंदी',
  gu: 'ગુજરાતી',
  mr: 'मराठी',
  ta: 'தமிழ்',
  te: 'తెలుగు'
}

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
      
      toggleLanguage: () => set((state) => {
        const languages: Language[] = ['en', 'hi', 'gu', 'mr', 'ta', 'te']
        const currentIndex = languages.indexOf(state.language)
        const nextIndex = (currentIndex + 1) % languages.length
        return { language: languages[nextIndex] }
      }),
      
      // Translation helper (legacy, only en/hi)
      t: (en: string, hi: string) => {
        const lang = get().language
        if (lang === 'hi') return hi
        // For other languages, fall back to English for now
        // Pages should use the full translations object below
        return en
      }
    }),
    {
      name: 'truckopti-language',
    }
  )
)

// Full translations for all 6 languages
export const translations = {
  // Navigation
  home: { 
    en: 'Home', hi: 'होम', gu: 'હોમ', mr: 'होम', ta: 'முகப்பு', te: 'హోమ్' 
  },
  dashboard: { 
    en: 'Dashboard', hi: 'डैशबोर्ड', gu: 'ડેશબોર્ડ', mr: 'डॅशबोर्ड', ta: 'டாஷ்போர்டு', te: 'డాష్బోర్డ్' 
  },
  packing: { 
    en: '3D Pack', hi: 'पैकिंग', gu: 'પેકિંગ', mr: 'पॅकिंग', ta: 'பேக்கிங்', te: 'ప్యాకింగ్' 
  },
  routes: { 
    en: 'Routes', hi: 'रूट', gu: 'રૂટ્સ', mr: 'मार्ग', ta: 'வழிகள்', te: 'రూట్లు' 
  },
  tracking: { 
    en: 'Track', hi: 'ट्रैक', gu: 'ટ્રેક', mr: 'ट्रॅक', ta: 'டிராக்', te: 'ట్రాక్' 
  },
  manage: { 
    en: 'Manage', hi: 'मैनेज', gu: 'મેનેજ', mr: 'व्यवस्थापन', ta: 'மேலாண்மை', te: 'మేనేజ్' 
  },
  profile: { 
    en: 'Profile', hi: 'प्रोफाइल', gu: 'પ્રોફાઇલ', mr: 'प्रोफाइल', ta: 'சுயவிவரம்', te: 'ప్రొఫైల్' 
  },
  settings: { 
    en: 'Settings', hi: 'सेटिंग्स', gu: 'સેટિંગ્સ', mr: 'सेटिंग्ज', ta: 'அமைப்புகள்', te: 'సెట్టింగ్స్' 
  },
  help: { 
    en: 'Help & Support', hi: 'सहायता', gu: 'મદદ', mr: 'मदत', ta: 'உதவி', te: 'సహాయం' 
  },
  logout: { 
    en: 'Logout', hi: 'लॉगआउट', gu: 'લૉગઆઉટ', mr: 'लॉगआउट', ta: 'வெளியேறு', te: 'లాగౌట్' 
  },
  
  // Dashboard
  goodMorning: { 
    en: 'Good Morning', hi: 'सुप्रभात', gu: 'સુપ્રભાત', mr: 'सुप्रभात', ta: 'காலை வணக்கம்', te: 'శుభోదయం' 
  },
  goodAfternoon: { 
    en: 'Good Afternoon', hi: 'नमस्कार', gu: 'નમસ્કાર', mr: 'नमस्कार', ta: 'மதிய வணக்கம்', te: 'శుభ మధ్యాహ్నం' 
  },
  goodEvening: { 
    en: 'Good Evening', hi: 'शुभ संध्या', gu: 'શુભ સાંજ', mr: 'शुभ संध्याकाळ', ta: 'மாலை வணக்கம்', te: 'శుభ సాయంత్రం' 
  },
  activeShipments: { 
    en: 'Active Shipments', hi: 'सक्रिय शिपमेंट', gu: 'સક્રિય શિપમેન્ટ', mr: 'सक्रिय शिपमेंट', ta: 'செயலில் சரக்குகள்', te: 'యాక్టివ్ షిప్మెంట్స్' 
  },
  trucksInTransit: { 
    en: 'Trucks in Transit', hi: 'पारगमन में ट्रक', gu: 'પરિવહનમાં ટ્રક', mr: 'वाहतुकीत ट्रक', ta: 'போக்குவரத்தில் லாரிகள்', te: 'ట్రాన్సిట్‌లో ట్రక్కులు' 
  },
  routesToday: { 
    en: 'Routes Today', hi: 'आज के रूट', gu: 'આજના રૂટ્સ', mr: 'आजचे मार्ग', ta: 'இன்றைய வழிகள்', te: 'ఈరోజు రూట్లు' 
  },
  deliveriesDone: { 
    en: 'Deliveries Done', hi: 'डिलीवरी पूर्ण', gu: 'ડિલિવરી પૂર્ણ', mr: 'डिलिव्हऱ्या पूर्ण', ta: 'செய்யப்பட்ட விநியோகங்கள்', te: 'పూర్తయిన డెలివరీలు' 
  },
  quickActions: { 
    en: 'Quick Actions', hi: 'त्वरित कार्रवाई', gu: 'ઝડપી ક્રિયાઓ', mr: 'जलद क्रिया', ta: 'விரைவு செயல்கள்', te: 'త్వరిత చర్యలు' 
  },
  recentActivity: { 
    en: 'Recent Activity', hi: 'हाल की गतिविधि', gu: 'તાજી પ્રવૃત્તિ', mr: 'अलीकडील Activity', ta: 'சமீபத்திய செயல்பாடு', te: 'ఇటీవలి కార్యాచరణ' 
  },
  viewAll: { 
    en: 'View all', hi: 'सभी देखें', gu: 'બધા જુઓ', mr: 'सर्व पहा', ta: 'அனைத்தையும் காண்க', te: 'అన్నీ చూడండి' 
  },
  saleOrders: {
    en: 'Sale Orders', hi: 'सेल ऑर्डर्स', gu: 'સેલ ઓર્ડર્સ', mr: 'विक्री ऑर्डर', ta: 'விற்பனை ஆர்டர்கள்', te: 'సేల్ ఆర్డర్లు'
  },
  importOrders: {
    en: 'Import Orders', hi: 'ऑर्डर्स आयात करें', gu: 'ઓર્ડર્સ આયાત કરો', mr: 'ऑर्डर आयात करा', ta: 'ஆர்டர்களை இறக்குமதி', te: 'ఆర్డర్లను దిగుమతి చేయండి'
  },
  
  // Management
  trucks: { 
    en: 'Trucks', hi: 'ट्रक', gu: 'ટ્રક', mr: 'ट्रक', ta: 'லாரிகள்', te: 'ట్రక్కులు' 
  },
  cartons: { 
    en: 'Cartons', hi: 'कार्टन', gu: 'કાર્ટન', mr: 'कार्टन्स', ta: 'கார்ட்டன்கள்', te: 'కార్టన్లు' 
  },
  customers: { 
    en: 'Customers', hi: 'ग्राहक', gu: 'ગ્રાહકો', mr: 'ग्राहक', ta: 'வாடிக்கையாளர்கள்', te: 'కస్టమర్లు' 
  },
  addNew: { 
    en: 'Add New', hi: 'नया जोड़ें', gu: 'નવો ઉમેરો', mr: 'नवीन जोडा', ta: 'புதிதாக சேர்', te: 'కొత్తది జోడించు' 
  },
  edit: { 
    en: 'Edit', hi: 'संपादित करें', gu: 'એડિટ કરો', mr: 'संपादित करा', ta: 'திருத்து', te: 'ఎడిట్' 
  },
  delete: { 
    en: 'Delete', hi: 'हटाएं', gu: 'કાઢી નાખો', mr: 'काढून टाका', ta: 'அழி', te: 'తొలగించు' 
  },
  save: { 
    en: 'Save', hi: 'सहेजें', gu: 'સાચવો', mr: 'जतन करा', ta: 'சேமி', te: 'సేవ్' 
  },
  cancel: { 
    en: 'Cancel', hi: 'रद्द करें', gu: 'રદ્દ કરો', mr: 'रद्द करा', ta: 'ரத்து', te: 'రద్దు' 
  },
  search: { 
    en: 'Search', hi: 'खोजें', gu: 'શોધો', mr: 'शोधा', ta: 'தேடு', te: 'శోధించు' 
  },
  
  // Packing
  startPacking: { 
    en: 'Start Packing', hi: 'पैकिंग शुरू करें', gu: 'પેકિંગ શરૂ કરો', mr: 'पॅकिंग सुरू करा', ta: 'பேக்கிங்கை தொடங்கு', te: 'ప్యాకింగ్ ప్రారంభించండి' 
  },
  selectTruck: { 
    en: 'Select Truck', hi: 'ट्रक चुनें', gu: 'ટ્રક પસંદ કરો', mr: 'ट्रक निवडा', ta: 'லாரியைத் தேர்ந்தெடு', te: 'ట్రక్కును ఎంచుకోండి' 
  },
  addItems: { 
    en: 'Add Items', hi: 'आइटम जोड़ें', gu: 'વસ્તુઓ ઉમેરો', mr: 'वस्तू जोडा', ta: 'பொருட்களைச் சேர்', te: 'అైటమ్స్ జోడించు' 
  },
  optimize: { 
    en: 'Optimize', hi: 'अनुकूलित करें', gu: 'ઓપ્ટિમાઇઝ કરો', mr: 'ऑप्टिमाइझ करा', ta: 'உகந்ததாக்கு', te: 'ఆప్టిమైజ్' 
  },
  utilization: { 
    en: 'Utilization', hi: 'उपयोग', gu: 'ઉપયોગ', mr: 'वापर', ta: 'பயன்பாடு', te: 'ఉపయోగం' 
  },
  
  // Cost Estimation
  costEstimate: {
    en: 'Cost Estimate', hi: 'लागत अनुमान', gu: 'ખર્ચ અનુમાન', mr: 'खर्च अंदाज', ta: 'செலவு மதிப்பீடு', te: 'ఖర్చు అంచనా'
  },
  distanceKm: {
    en: 'Distance (km)', hi: 'दूरी (किमी)', gu: 'અંતર (કિમી)', mr: 'अंतर (किमी)', ta: 'தூரம் (கிமீ)', te: 'దూరం (కి.మీ)'
  },
  truckType: {
    en: 'Truck Type', hi: 'ट्रक प्रकार', gu: 'ટ્રક પ્રકાર', mr: 'ट्रक प्रकार', ta: 'லாரி வகை', te: 'ట్రక్కు రకం'
  },
  weightKg: {
    en: 'Weight (kg)', hi: 'वजन (किलो)', gu: 'વજન (કિલો)', mr: 'वजन (किलो)', ta: 'எடை (கிலோ)', te: 'బరువు (కిలో)'
  },
  volumeM3: {
    en: 'Volume (m³)', hi: 'आयतन (घन मी)', gu: 'ઘનફળ (ઘન મીટર)', mr: 'घनफळ (घन मी)', ta: 'அளவு (கன மீ)', te: 'వాల్యూమ్ (క్యూబిక్ మీ)'
  },
  fuelCost: {
    en: 'Fuel', hi: 'ईंधन', gu: 'ઇંધણ', mr: 'इंधन', ta: 'எரிபொருள்', te: 'ఇంధనం'
  },
  tollCost: {
    en: 'Toll', hi: 'टोल', gu: 'ટોલ', mr: 'टोल', ta: 'டோல்', te: 'టోల్'
  },
  driverCost: {
    en: 'Driver', hi: 'ड्राइवर', gu: 'ડ્રાઈવર', mr: 'ड्राईव्हर', ta: 'ஓட்டுநர்', te: 'డ్రైవర్'
  },
  loadingCost: {
    en: 'Loading', hi: 'लोडिंग', gu: 'લોડિંગ', mr: 'लोडिंग', ta: 'ஏற்றுதல்', te: 'లోడింగ్'
  },
  totalCost: {
    en: 'Total', hi: 'कुल', gu: 'કુલ', mr: 'एकूण', ta: 'மொத்தம்', te: 'మొత్తం'
  },
  perKm: {
    en: 'per km', hi: 'प्रति किमी', gu: 'પ્રતિ કિમી', mr: 'प्रति किमी', ta: 'கிமீக்கு', te: 'కి.మీకి'
  },
  perKg: {
    en: 'per kg', hi: 'प्रति किलो', gu: 'પ્રતિ કિલો', mr: 'प्रति किलो', ta: 'கிலோவுக்கு', te: 'కిలోకి'
  },
  getEstimate: {
    en: 'Get Estimate', hi: 'अनुमान लें', gu: 'અનુમાન મેળવો', mr: 'अंदाज घ्या', ta: 'மதிப்பீட்டைப் பெறு', te: 'అంచనా పొందండి'
  },
  
  // Settings
  darkMode: { 
    en: 'Dark Mode', hi: 'डार्क मोड', gu: 'ડાર્ક મોડ', mr: 'डार्क मोड', ta: 'இருள் பயன்முறை', te: 'డార్క్ మోడ్' 
  },
  language: { 
    en: 'Language', hi: 'भाषा', gu: 'ભાષા', mr: 'भाषा', ta: 'மொழி', te: 'భాష' 
  },
  notifications: { 
    en: 'Notifications', hi: 'सूचनाएं', gu: 'નોટિફિકેશન્સ', mr: 'सूचना', ta: 'அறிவிப்புகள்', te: 'నోటిఫికేషన్లు' 
  },
  subscription: { 
    en: 'Subscription', hi: 'सदस्यता', gu: 'સબ્સ્ક્રિપ્શન', mr: 'सदस्यता', ta: 'சந்தா', te: 'సబ్స్క్రిప్షన్' 
  },
  
  // Common
  loading: { 
    en: 'Loading...', hi: 'लोड हो रहा है...', gu: 'લોડ થઈ રહ્યું છે...', mr: 'लोड होत आहे...', ta: 'ஏற்றுகிறது...', te: 'లోడ్ అవుతోంది...' 
  },
  error: { 
    en: 'Error', hi: 'त्रुटि', gu: 'ભૂલ', mr: 'त्रुटी', ta: 'பிழை', te: 'లోపం' 
  },
  success: { 
    en: 'Success', hi: 'सफलता', gu: 'સફળતા', mr: 'यश', ta: 'வெற்றி', te: 'విజయం' 
  },
  confirm: { 
    en: 'Confirm', hi: 'पुष्टि करें', gu: 'ખાતરી કરો', mr: 'खात्री करा', ta: 'உறுதிப்படுத்து', te: 'నిర్ధారించండి' 
  },
  back: { 
    en: 'Back', hi: 'वापस', gu: 'પાછા', mr: 'मागे', ta: 'பின்', te: 'వెనుక' 
  },
}

// Type for translation keys
export type TranslationKey = keyof typeof translations

// Hook for getting translations
export function useTranslation() {
  const { language, setLanguage, toggleLanguage } = useLanguageStore()
  
  const tr = (key: TranslationKey) => {
    const trans = translations[key]
    return trans[language] || trans.en
  }
  
  return { language, tr, toggleLanguage, setLanguage }
}

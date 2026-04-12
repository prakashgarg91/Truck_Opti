import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Phone, Mail, MapPin, Shield, Bell, 
  Globe, ChevronRight, LogOut, Camera, Edit3, Save, X, RefreshCw, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore, LANGUAGE_NAMES, type Language } from '../stores/languageStore'
import { supabase } from '../lib/supabase'

const translations = {
  en: {
    contactInfo: 'Contact Information',
    companyInfo: 'Company Information',
    companyName: 'Company Name',
    gstin: 'GSTIN',
    gstinPlaceholder: 'e.g., 27AABCU9603R1ZX',
    companyAddress: 'Company Address',
    companyAddressPlaceholder: 'e.g., Mumbai, Maharashtra - 400001',
    phone: 'Phone',
    email: 'Email',
    location: 'Location',
    verified: 'Verified',
    verifiedAccount: 'Verified Account',
    settings: 'Settings',
    language: 'Language',
    notifications: 'Notifications',
    notificationDesc: 'Manage notification preferences',
    locationSharing: 'Live Location Sharing',
    locationDesc: 'Allow fleet tracking while delivering',
    logout: 'Logout',
    signOut: 'Sign out of your account',
    user: 'TruckOpti User',
    selectLanguage: 'Select Language',
    notAdded: 'Not added yet',
    tapToSet: 'Tap to set'
  },
  hi: {
    contactInfo: 'संपर्क जानकारी',
    companyInfo: 'कंपनी जानकारी',
    companyName: 'कंपनी का नाम',
    gstin: 'GSTIN',
    gstinPlaceholder: 'जैसे, 27AABCU9603R1ZX',
    companyAddress: 'कंपनी का पता',
    companyAddressPlaceholder: 'जैसे, मुंबई, महाराष्ट्र - 400001',
    phone: 'फोन',
    email: 'ईमेल',
    location: 'स्थान',
    verified: 'सत्यापित',
    verifiedAccount: 'सत्यापित खाता',
    settings: 'सेटिंग्स',
    language: 'भाषा',
    notifications: 'नोटिफिकेशन',
    notificationDesc: 'नोटिफिकेशन प्राथमिकताएं प्रबंधित करें',
    locationSharing: 'लाइव लोकेशन शेयरिंग',
    locationDesc: 'डिलीवरी के दौरान फ्लीट ट्रैकिंग की अनुमति दें',
    logout: 'लॉगआउट',
    signOut: 'अपने खाते से साइन आउट करें',
    user: 'TruckOpti उपयोगकर्ता',
    selectLanguage: 'भाषा चुनें',
    notAdded: 'अभी तक नहीं जोड़ा',
    tapToSet: 'सेट करें'
  },
  gu: {
    contactInfo: 'સંપર્ક માહિતી',
    companyInfo: 'કંપની માહિતી',
    companyName: 'કંપનીનું નામ',
    gstin: 'GSTIN',
    gstinPlaceholder: 'દા.ત., 27AABCU9603R1ZX',
    companyAddress: 'કંપનીનું સરનામું',
    companyAddressPlaceholder: 'દા.ત., મુંબઈ, મહારાષ્ટ્ર - 400001',
    phone: 'ફોન',
    email: 'ઈમેલ',
    location: 'સ્થાન',
    verified: 'ચકાસેલ',
    verifiedAccount: 'ચકાસેલ ખાતું',
    settings: 'સેટિંગ્સ',
    language: 'ભાષા',
    notifications: 'નોટિફિકેશન્સ',
    notificationDesc: 'નોટિફિકેશન પસંદગીઓ મેનેજ કરો',
    locationSharing: 'લાઇવ લોકેશન શેરિંગ',
    locationDesc: 'ડિલિવરી દરમિયાન ફ્લીટ ટ્રેકિંગને મંજૂરી આપો',
    logout: 'લૉગઆઉટ',
    signOut: 'તમારા ખાતામાંથી સાઇન આઉટ કરો',
    user: 'TruckOpti વપરાશકર્તા',
    selectLanguage: 'ભાષા પસંદ કરો',
    notAdded: 'હજુ સુધી ઉમેરાયું નથી',
    tapToSet: 'સેટ કરો'
  },
  mr: {
    contactInfo: 'संपर्क माहिती',
    companyInfo: 'कंपनी माहिती',
    companyName: 'कंपनीचे नाव',
    gstin: 'GSTIN',
    gstinPlaceholder: 'उदा., 27AABCU9603R1ZX',
    companyAddress: 'कंपनीचा पत्ता',
    companyAddressPlaceholder: 'उदा., मुंबई, महाराष्ट्र - 400001',
    phone: 'फोन',
    email: 'ईमेल',
    location: 'स्थान',
    verified: 'सत्यापित',
    verifiedAccount: 'सत्यापित खाते',
    settings: 'सेटिंग्ज',
    language: 'भाषा',
    notifications: 'सूचना',
    notificationDesc: 'सूचना प्राधान्ये व्यवस्थापित करा',
    locationSharing: 'लाइव लोकेशन शेअरिंग',
    locationDesc: 'डिलिव्हरी दरम्यान फ्लीट ट्रॅकिंगची परवानगी द्या',
    logout: 'लॉगआउट',
    signOut: 'तुमच्या खात्यातून साइन आउट करा',
    user: 'TruckOpti वापरकर्ता',
    selectLanguage: 'भाषा निवडा',
    notAdded: 'अद्याप जोडले नाही',
    tapToSet: 'सेट करा'
  },
  ta: {
    contactInfo: 'தொடர்பு தகவல்',
    companyInfo: 'நிறுவன தகவல்',
    companyName: 'நிறுவனத்தின் பெயர்',
    gstin: 'GSTIN',
    gstinPlaceholder: 'எ.கா., 27AABCU9603R1ZX',
    companyAddress: 'நிறுவன முகவரி',
    companyAddressPlaceholder: 'எ.கா., சென்னை, தமிழ்நாடு - 600001',
    phone: 'தொலைபேசி',
    email: 'மின்னஞ்சல்',
    location: 'இடம்',
    verified: 'சரிபார்க்கப்பட்டது',
    verifiedAccount: 'சரிபார்க்கப்பட்ட கணக்கு',
    settings: 'அமைப்புகள்',
    language: 'மொழி',
    notifications: 'அறிவிப்புகள்',
    notificationDesc: 'அறிவிப்பு விருப்பங்களை நிர்வகிக்கவும்',
    locationSharing: 'நேரடி இடம் பகிர்தல்',
    locationDesc: 'விநியோகத்தின்போது கடல் கண்காணிப்பை அனுமதிக்கவும்',
    logout: 'வெளியேறு',
    signOut: 'உங்கள் கணக்கிலிருந்து வெளியேறவும்',
    user: 'TruckOpti பயனர்',
    selectLanguage: 'மொழியைத் தேர்ந்தெடுக்கவும்',
    notAdded: 'இன்னும் சேர்க்கப்படவில்லை',
    tapToSet: 'அமைக்கவும்'
  },
  te: {
    contactInfo: 'సంప్రదింపు సమాచారం',
    phone: 'ఫోన్',
    email: 'ఇమెయిల్',
    location: 'స్థానం',
    verified: 'ధృవీకరించబడింది',
    verifiedAccount: 'ధృవీకరించబడిన ఖాతా',
    settings: 'సెట్టింగ్స్',
    language: 'భాష',
    notifications: 'నోటిఫికేషన్లు',
    notificationDesc: 'నోటిఫికేషన్ ప్రాధాన్యతలను నిర్వహించండి',
    locationSharing: 'లైవ్ లొకేషన్ షేరింగ్',
    locationDesc: 'డెలివరీ సమయంలో ఫ్లీట్ ట్రాకింగ్‌ను అనుమతించండి',
    logout: 'లాగౌట్',
    signOut: 'మీ ఖాతా నుండి సైన్ అవుట్ చేయండి',
    user: 'TruckOpti వినియోగదారు',
    selectLanguage: 'భాషను ఎంచుకోండి'
  }
}

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore()
  const { language, setLanguage } = useLanguageStore()
  
  // Set document title based on language
  useEffect(() => {
    document.title = language === 'en' ? 'Profile - TruckOpti' : 'प्रोफाइल - TruckOpti'
  }, [language])
  
  const t = (translations[language as keyof typeof translations] || translations.en) as any

  // Initialize notification preferences from user metadata
  const [isLocationSharing, setIsLocationSharing] = useState(() => {
    return user?.user_metadata?.location_sharing ?? true
  })
  const [notifications, setNotifications] = useState(() => {
    const prefs = user?.user_metadata?.notification_prefs
    return prefs || { sms: true, push: true, email: false }
  })

  // Persist location sharing preference to user_metadata
  const handleLocationSharingChange = async (enabled: boolean) => {
    setIsLocationSharing(enabled)
    try {
      await supabase.auth.updateUser({
        data: { location_sharing: enabled }
      })
    } catch (_err) {
      toast.error('Failed to update preference')
    }
  }

  // Persist notification preference to user_metadata
  const handleNotificationChange = async (key: string, enabled: boolean) => {
    const newPrefs = { ...notifications, [key]: enabled }
    setNotifications(newPrefs)
    try {
      await supabase.auth.updateUser({
        data: { notification_prefs: newPrefs }
      })
    } catch (_err) {
      toast.error('Failed to update preference')
    }
  }
  
  // Company info from user metadata
  const companyInfo = (user?.user_metadata as any)?.company || {}
  const navigate = useNavigate()

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false)
  const [isEditingCompany, setIsEditingCompany] = useState(false)
  const [editName, setEditName] = useState(user?.name || '')
  const [editPhone, setEditPhone] = useState(user?.phone?.replace('+91', '') || '')
  const [editCompanyName, setEditCompanyName] = useState(companyInfo.name || '')
  const [editGstin, setEditGstin] = useState(companyInfo.gstin || '')
  const [editCompanyAddress, setEditCompanyAddress] = useState(companyInfo.address || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); return }
    setIsUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = data.publicUrl + '?t=' + Date.now()
      const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl, profile_picture: publicUrl } })
      if (metaErr) throw metaErr
      updateUser({ profile_picture: publicUrl })
      toast.success('Profile photo updated!')
    } catch (err: any) {
      console.error('[ProfilePage]', err)
      toast.error(language === 'en' ? 'Upload failed. Please try again.' : 'अपलोड विफल। कृपया पुनः प्रयास करें।')
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: editName,
          name: editName,
          phone: editPhone ? `+91${editPhone}` : undefined
        }
      })
      if (error) throw error
      
      // Update local store
      updateUser({
        name: editName || null,
        phone: editPhone ? `+91${editPhone}` : null
      })
      
      setIsEditing(false)
      toast.success(language === 'en' ? 'Profile updated!' : 'प्रोफ़ाइल अपडेट!')
    } catch (err: any) {
      void err
      toast.error(language === 'en' ? 'Failed to update profile' : 'प्रोफाइल अपडेट करने में विफल')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCompany = async () => {
    setIsSaving(true)
    try {
      // Read current user data to MERGE (not overwrite) CompanyProfilePage fields
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      const existingCompany = (freshUser?.user_metadata as any)?.company || {}
      const { error } = await supabase.auth.updateUser({
        data: {
          company: {
            ...existingCompany,          // Preserve address_line1/city/state/pincode etc.
            name: editCompanyName,
            gstin: editGstin.toUpperCase(),
            address: editCompanyAddress  // legacy flat-string field
          }
        }
      })
      if (error) throw error

      setIsEditingCompany(false)
      toast.success(language === 'en' ? 'Company info updated!' : 'कंपनी जानकारी अपडेट!')
    } catch (err: any) {
      void err
      toast.error(language === 'en' ? 'Failed to update company' : 'कंपनी जानकारी अपडेट करने में विफल')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }
  
  return (
    <div className="p-4 space-y-6">
      {/* Profile Header */}
      <div className="card p-6 text-center">
        <div className="relative inline-block mb-4">
          {user?.profile_picture ? (
            <img 
              src={user.profile_picture} 
              alt={user?.name || 'Profile'} 
              className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-saffron-500 flex items-center justify-center text-white text-3xl font-bold">
              {user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-slate-700 rounded-full shadow-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            {isUploadingAvatar
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Camera className="w-4 h-4" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {user?.name || user?.email?.split('@')[0] || 'TruckOpti User'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {user?.email || ''}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-green-600">
          <Shield className="w-4 h-4" />
          <span>{t.verifiedAccount}</span>
        </div>
        {/* Edit Profile Button */}
        <button
          onClick={() => {
            setIsEditing(!isEditing)
            setEditName(user?.name || '')
            setEditPhone(user?.phone?.replace('+91', '') || '')
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <Edit3 className="w-4 h-4" />
          {isEditing ? (language === 'en' ? 'Cancel' : 'रद्द करें') : (language === 'en' ? 'Edit Profile' : 'प्रोफ़ाइल संपादित करें')}
        </button>
      </div>

      {/* Edit Profile Form */}
      {isEditing && (
        <div className="card p-4 space-y-4 border-2 border-primary-200 dark:border-primary-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            {language === 'en' ? 'Edit Profile' : 'प्रोफ़ाइल संपादित करें'}
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Full Name' : 'पूरा नाम'}
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input w-full"
              placeholder={language === 'en' ? 'Enter your name' : 'अपना नाम दर्ज करें'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Phone Number' : 'फोन नंबर'}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 font-medium">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="input flex-1"
                placeholder="98765 43210"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="btn btn-primary flex-1"
            >
              {isSaving ? (
                <div className="spinner w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{language === 'en' ? 'Save' : 'सहेजें'}</span>
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="btn btn-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Contact Info */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
          {t.contactInfo}
        </h2>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">{t.phone}</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {user?.phone || (language === 'en' ? 'Not added yet' : 'अभी तक नहीं जोड़ा')}
            </p>
          </div>
          {user?.phone_verified ? (
            <span className="badge badge-success">{t.verified}</span>
          ) : (
            <span className="text-xs text-slate-400">{language === 'en' ? 'Add phone' : 'फोन जोड़ें'}</span>
          )}
        </div>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">{t.email}</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {user?.email || (language === 'en' ? 'Not added yet' : 'अभी तक नहीं जोड़ा')}
            </p>
          </div>
          {user?.email ? (
            <span className="badge badge-success">{t.verified}</span>
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </div>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">{t.location}</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {language === 'en' ? 'Tap to set location' : 'स्थान सेट करें'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* Company Information */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            {t.companyInfo}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings/company')}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {language === 'en' ? 'Full Profile' : 'पूर्ण प्रोफ़ाइल'}
            </button>
            <button
              onClick={() => {
                setIsEditingCompany(!isEditingCompany)
                if (!isEditingCompany) {
                  const company = (user?.user_metadata as any)?.company || {}
                  setEditCompanyName(company.name || '')
                  setEditGstin(company.gstin || '')
                  setEditCompanyAddress(company.address || '')
                }
              }}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              <Edit3 className="w-4 h-4" />
              {isEditingCompany ? (language === 'en' ? 'Cancel' : 'रद्द करें') : (language === 'en' ? 'Edit' : 'संपादित करें')}
            </button>
          </div>
        </div>

        {/* Company Info Display */}
        {!isEditingCompany && (
          <>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-500">{t.companyName}</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {companyInfo.name || t.notAdded}
                </p>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-500">{t.gstin}</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {companyInfo.gstin || t.notAdded}
                </p>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-500">{t.companyAddress}</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {companyInfo.address ||
                    [companyInfo.address_line1, companyInfo.city, companyInfo.state, companyInfo.pincode]
                      .filter(Boolean).join(', ') ||
                    t.notAdded}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Company Info Edit Form */}
        {isEditingCompany && (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.companyName}
              </label>
              <input
                type="text"
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
                className="input w-full"
                placeholder={language === 'en' ? 'Enter company name' : 'कंपनी का नाम दर्ज करें'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.gstin}
              </label>
              <input
                type="text"
                value={editGstin}
                onChange={(e) => setEditGstin(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))}
                className="input w-full font-mono"
                placeholder={t.gstinPlaceholder}
              />
              <p className="text-xs text-slate-500 mt-1">15 characters (e.g., 27AABCU9603R1ZX)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.companyAddress}
              </label>
              <textarea
                value={editCompanyAddress}
                onChange={(e) => setEditCompanyAddress(e.target.value)}
                className="input w-full"
                rows={2}
                placeholder={t.companyAddressPlaceholder}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSaveCompany}
                disabled={isSaving}
                className="btn btn-primary flex-1"
              >
                {isSaving ? (
                  <div className="spinner w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{language === 'en' ? 'Save' : 'सहेजें'}</span>
              </button>
              <button
                onClick={() => setIsEditingCompany(false)}
                className="btn btn-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Google Account */}
      {user?.google_linked && (
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
          Connected Accounts
        </h2>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">Google Account</p>
              <p className="text-sm text-slate-500">{user?.email || 'Connected'}</p>
            </div>
            <span className="badge badge-success text-xs">Linked</span>
          </div>
        </div>
      </div>
      )}
      
      {/* Location Sharing */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-saffron-100 dark:bg-saffron-900/30 flex items-center justify-center text-saffron-600">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {t.locationSharing}
              </p>
              <p className="text-sm text-slate-500">
                {t.locationDesc}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isLocationSharing}
              onChange={(e) => handleLocationSharingChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>
      
      {/* Notifications */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5" />
          {t.notifications}
        </h2>
        {Object.entries(notifications).map(([key, value]) => (
          <div key={key} className="p-4 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 capitalize">
              {key === 'sms' ? (language === 'en' ? 'SMS Alerts' : 'एसएमएस अलर्ट') :
               key === 'push' ? (language === 'en' ? 'Push Notifications' : 'पुश नोटिफिकेशन') :
               (language === 'en' ? 'Email Updates' : 'ईमेल अपडेट')}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={value as boolean}
                onChange={(e) => handleNotificationChange(key, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>
        ))}
      </div>
      
      {/* Language Selector */}
      <div className="card p-4">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">
          {t.selectLanguage}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(LANGUAGE_NAMES) as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`p-3 rounded-xl text-sm font-medium transition-all ${
                language === lang 
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 border-2 border-primary-500' 
                  : 'bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-2 border-transparent hover:bg-slate-100'
              }`}
            >
              {LANGUAGE_NAMES[lang]}
            </button>
          ))}
        </div>
      </div>
      
      {/* App Info */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{language === 'en' ? 'App Version' : 'ऐप संस्करण'}</span>
          <span className="text-slate-700 dark:text-slate-300">2.0.0-beta</span>
        </div>
      </div>
      
      {/* Logout Button */}
      <button 
        onClick={handleLogout}
        className="w-full btn bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30"
      >
        <LogOut className="w-5 h-5" />
        <span>{t.logout}</span>
      </button>
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 pb-4">
        <p>TruckOpti India • Made with ❤️ in India</p>
        <p className="mt-1">© 2026 All Rights Reserved</p>
      </div>
    </div>
  )
}

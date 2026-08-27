import { useState, useEffect, useRef } from 'react';
import { Save, Sparkles, Camera, Clapperboard, Stamp, FileText, Cloud, CloudOff, Upload, Download, RefreshCw, HardDrive, QrCode, Building2, User, LogIn, LogOut, ShieldCheck, FolderOpen, Database, Trash2, FlaskConical } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { useSync } from '@/context/SyncContext';
import { useRefresh } from '@/context/RefreshContext';
import { supabase } from '@/lib/supabase';
import { Field, inputClass, textareaClass } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { backupToDrive, restoreFromDrive, listDriveBackups, getStoredFolderId, setStoredFolderId, syncConnectionState, readDriveMeta, type DriveBackupFile } from '@/lib/driveBackup';
import { signInWithGoogle, disconnectGoogle, getStoredClientId, setStoredClientId, getStoredProfile, getStoredToken } from '@/lib/googleAuth';

type Tab = 'films' | 'production';

const DEFAULT_TERMS = `1. अग्रिम भुगतान (Advance Payment): शूट की निर्धारित तिथि से ठीक 7 दिन पूर्व कुल पैकेज राशि का न्यूनतम 50% भुगतान अनिवार्य है।
2. डेटा सुपुर्दगी (Data Collection): पूर्ण भुगतान कर 30 दिनों के भीतर समस्त डेटा, पेन ड्राइव व एल्बम प्राप्त करना अनिवार्य है।
3. डेटा सुरक्षा व दायित्व: डिलीवरी तैयार होने के 30 दिनों के बाद डेटा सुरक्षित रखने की कोई जिम्मेदारी स्टूडियो की नहीं होगी।
4. स्वीकृति (Agreement): बुकिंग अथवा अग्रिम भुगतान करते ही ग्राहक उपर्युक्त सभी शर्तों को पूर्णतः स्वीकार करता है।`;

const DEFAULT_PRODUCTION_TERMS = `1. रॉ डाटा बैकअप व सुरक्षा (Raw Data Backup): जब तक तैयार प्रोजेक्ट/डाटा आपको नहीं मिल जाता, तब तक रॉ फुटेज की एक बैकअप कॉपी अपने पास सुरक्षित रखें।
2. एल्बम डिजाइन व प्रिंट अप्रूवल (Album Approval): एल्बम प्रिंटिंग से पूर्व डिजाइन अप्रूवल अनिवार्य है। शीट प्रिंट होने के बाद किसी भी प्रकार का स्पेलिंग या फोटो बदलाव नहीं होगा।
3. सॉन्ग सिलेक्शन व एडिटिंग (Songs Selection & Re-edits): टीज़र/हाइलाइट्स व वेडिंग के लिए मनपसंद गाने काम शुरू होने से पूर्व देना अनिवार्य है। प्रोजेक्ट फाइनल रेंडर के बाद कोई बदलाव नहीं किया जाएगा।
4. अग्रिम भुगतान (50% Advance Mandatory): प्रोडक्शन से जुड़े किसी भी कार्य के कुल मूल्य का 50% राशि एडवांस जमा करना अनिवार्य होगा, अन्यथा काम को आगे नहीं बढ़ाया जाएगा।
5. डिलीवरी व पूर्ण भुगतान (Final Delivery & Due Settlement): तैयार मास्टर वीडियो / पेन ड्राइव / एल्बम प्राप्त करने से पूर्व शेष बकाया राशि (Net Final Due) का पूर्ण भुगतान करना अनिवार्य है।`;

export function SettingsPage() {
  const { settings, loading, update } = useSettings();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('films');

  const [filmsTitle, setFilmsTitle] = useState('');
  const [filmsSubtitle, setFilmsSubtitle] = useState('');
  const [filmsAddress, setFilmsAddress] = useState('');
  const [filmsPhone, setFilmsPhone] = useState('');
  const [filmsEmail, setFilmsEmail] = useState('');
  const [filmsInsta, setFilmsInsta] = useState('');
  const [filmsLogoUrl, setFilmsLogoUrl] = useState('');

  const [productionTitle, setProductionTitle] = useState('');
  const [productionSubtitle, setProductionSubtitle] = useState('');
  const [productionAddress, setProductionAddress] = useState('');
  const [productionPhone, setProductionPhone] = useState('');
  const [productionEmail, setProductionEmail] = useState('');
  const [productionInsta, setProductionInsta] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [productionLogoUrl, setProductionLogoUrl] = useState('');
  const [productionTerms, setProductionTerms] = useState(DEFAULT_PRODUCTION_TERMS);

  const [studioName, setStudioName] = useState('');
  const [studioSubtitle, setStudioSubtitle] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [headOfficeAddress, setHeadOfficeAddress] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [studioEmail, setStudioEmail] = useState('');

  const [upiId, setUpiId] = useState('');
  const [masterPin, setMasterPin] = useState('');

  const [stampImageUrl, setStampImageUrl] = useState('');
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [saving, setSaving] = useState(false);

  // Google Drive state
  const { driveMeta, refreshDriveMeta } = useSync();
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [backupFiles, setBackupFiles] = useState<DriveBackupFile[]>([]);
  const [listingFiles, setListingFiles] = useState(false);

  const { triggerRefresh } = useRefresh();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const termsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!settings) return;
    setFilmsTitle(settings.films_title ?? '');
    setFilmsSubtitle(settings.films_subtitle ?? '');
    setFilmsAddress(settings.address ?? '');
    setFilmsPhone(settings.phone ?? '');
    setFilmsEmail(settings.email ?? '');
    setFilmsInsta(settings.films_insta ?? '');
    setFilmsLogoUrl(settings.films_logo_url ?? '');
    setProductionTitle(settings.production_title ?? '');
    setProductionSubtitle(settings.production_subtitle ?? '');
    setProductionAddress(settings.address ?? '');
    setProductionPhone(settings.phone ?? '');
    setProductionEmail(settings.email ?? '');
    setProductionInsta(settings.production_insta ?? '');
    setBankName(settings.bank_name ?? '');
    setBankDetails(settings.bank_details ?? '');
    setWhatsappNumber(settings.whatsapp_number ?? '');
    setProductionLogoUrl(settings.production_logo_url ?? '');
    setProductionTerms(settings.production_terms || DEFAULT_PRODUCTION_TERMS);
    setStampImageUrl(settings.stamp_image_url ?? '');
    setTerms(settings.terms_conditions || DEFAULT_TERMS);
    setStudioName(settings.films_title ?? '');
    setStudioSubtitle(settings.films_subtitle ?? '');
    setWhatsapp(settings.whatsapp_number ?? '');
    setAlternatePhone(settings.alternate_phone ?? '');
    setHeadOfficeAddress(settings.address ?? '');
    setBranchAddress(settings.branch_address ?? '');
    setStudioEmail(settings.email ?? '');
    setUpiId(settings.upi_id ?? '');
    setMasterPin(settings.master_pin ?? '');
  }, [settings]);

  useEffect(() => {
    setGoogleClientId(getStoredClientId());
    setDriveFolderId(getStoredFolderId());
  }, []);

  useEffect(() => {
    if (termsRef.current) {
      termsRef.current.style.height = 'auto';
      termsRef.current.style.height = `${termsRef.current.scrollHeight}px`;
    }
  }, [terms]);

  const handleSave = async () => {
    setSaving(true);
    await update({
      films_title: filmsTitle,
      films_subtitle: filmsSubtitle,
      production_title: productionTitle,
      production_subtitle: productionSubtitle,
      address: filmsAddress,
      phone: filmsPhone,
      email: filmsEmail,
      films_insta: filmsInsta,
      production_insta: productionInsta,
      bank_name: bankName,
      bank_details: bankDetails,
      whatsapp_number: whatsappNumber,
      alternate_phone: alternatePhone,
      branch_address: branchAddress,
      upi_id: upiId,
      master_pin: masterPin,
      films_logo_url: filmsLogoUrl,
      production_logo_url: productionLogoUrl,
      production_terms: productionTerms,
      stamp_image_url: stampImageUrl,
      terms_conditions: terms,
    });
    setSaving(false);
    toast('Settings updated successfully!', 'success');
  };

  const handleSignInGoogle = async () => {
    if (!googleClientId.trim()) {
      toast('Enter your Google Client ID first.', 'error');
      return;
    }
    setSigningIn(true);
    try {
      const { profile } = await signInWithGoogle(googleClientId);
      setStoredClientId(googleClientId.trim());
      refreshDriveMeta();
      toast(`Signed in as ${profile.email}`, 'success');
    } catch (e: any) {
      toast(e?.message ?? 'Google sign-in failed.', 'error');
    }
    setSigningIn(false);
  };

  const handleDisconnectGoogle = () => {
    disconnectGoogle();
    refreshDriveMeta();
    setBackupFiles([]);
    toast('Google account disconnected.', 'info');
  };

  const handleSaveFolderId = () => {
    setStoredFolderId(driveFolderId.trim());
    refreshDriveMeta();
    toast('Drive folder ID saved.', 'success');
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const meta = await backupToDrive();
      refreshDriveMeta();
      toast(`Backup complete — ${meta.recordCount} records saved to Google Drive`, 'success');
    } catch (e: any) {
      toast(e?.message ?? 'Backup failed. Check your connection and try again.', 'error');
    }
    setBackingUp(false);
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const meta = await restoreFromDrive();
      refreshDriveMeta();
      toast(`Restore complete — ${meta.recordCount} records loaded from Google Drive`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast(e?.message ?? 'Restore failed. No backup file found.', 'error');
    }
    setRestoring(false);
  };

  const handleListBackups = async () => {
    setListingFiles(true);
    try {
      const files = await listDriveBackups();
      setBackupFiles(files);
      if (files.length === 0) toast('No backup files found on Drive yet.', 'info');
    } catch (e: any) {
      toast(e?.message ?? 'Failed to list Drive backups.', 'error');
    }
    setListingFiles(false);
  };

  if (loading || !settings) {
    return <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>;
  }

  const upiQrUrl = upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=${encodeURIComponent(upiId)}`
    : '';

  const profile = getStoredProfile();
  const hasToken = getStoredToken() !== null;
  const connectedMeta = syncConnectionState(readDriveMeta());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Studio Settings &amp; Configuration</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage branding, logos, stamp &amp; Hindi terms for both units</p>
      </div>

      {/* Studio Profile Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Building2 className="h-4 w-4 text-amber-500" /> Studio Profile
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Studio Name">
            <input value={studioName} onChange={(e) => setStudioName(e.target.value)} placeholder="Bollywood Umang Films" className={inputClass} />
          </Field>
          <Field label="Subtitle / Tagline">
            <input value={studioSubtitle} onChange={(e) => setStudioSubtitle(e.target.value)} placeholder="(A Unit of Bollywood Umang Production)" className={inputClass} />
          </Field>
          <Field label="WhatsApp Number">
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91 9122441332" className={inputClass} />
          </Field>
          <Field label="Alternate Contact Number">
            <input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} placeholder="+91 9876543210" className={inputClass} />
          </Field>
          <Field label="Head Office Address">
            <input value={headOfficeAddress} onChange={(e) => setHeadOfficeAddress(e.target.value)} placeholder="Kamtaul, Darbhanga, Bihar" className={inputClass} />
          </Field>
          <Field label="Branch Office Address">
            <input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} placeholder="Branch office address (if any)" className={inputClass} />
          </Field>
          <Field label="Email Address">
            <input value={studioEmail} onChange={(e) => setStudioEmail(e.target.value)} placeholder="bollywoodumanginfo@gmail.com" className={inputClass} />
          </Field>
          <Field label="Master PIN (4 or 6 digits)">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={masterPin}
              onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Required for sensitive actions"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {/* Dynamic UPI QR Engine */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <QrCode className="h-4 w-4 text-amber-500" /> Dynamic UPI QR Engine
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Enter your UPI ID to generate a dynamic QR code. This QR appears on bills and invoices so clients can scan and pay instantly.
        </p>
        <Field label="UPI ID">
          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@upi" className={inputClass} />
        </Field>
        {upiQrUrl ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <img src={upiQrUrl} alt="UPI QR Code" className="h-44 w-44 rounded-lg" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scan to pay via UPI — <span className="font-medium text-slate-700 dark:text-slate-300">{upiId}</span>
            </p>
            <p className="text-[11px] text-slate-400">QR is generated live from your UPI ID. No static image needed.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-800/40">
            <QrCode className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400">Enter a UPI ID above to preview the QR code</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-slate-900/50">
        <button
          onClick={() => setTab('films')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'films'
              ? 'bg-amber-500 text-slate-900'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
          }`}
        >
          <Camera className="h-4 w-4" />
          <span>Bollywood Umang Films</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === 'films' ? 'bg-slate-900/10 text-slate-700' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>B2C</span>
        </button>
        <button
          onClick={() => setTab('production')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'production'
              ? 'bg-amber-500 text-slate-900'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
          }`}
        >
          <Clapperboard className="h-4 w-4" />
          <span>Bollywood Umang Production</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === 'production' ? 'bg-slate-900/10 text-slate-700' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>B2B</span>
        </button>
      </div>

      {/* Tab 1: Films */}
      {tab === 'films' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Camera className="h-4 w-4 text-amber-500" /> Bollywood Umang Films (B2C — Weddings &amp; Events)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Studio Title">
              <input value={filmsTitle} onChange={(e) => setFilmsTitle(e.target.value)} placeholder="Bollywood Umang Films" className={inputClass} />
            </Field>
            <Field label="Subtitle / Tagline">
              <input value={filmsSubtitle} onChange={(e) => setFilmsSubtitle(e.target.value)} placeholder="(A Unit of Bollywood Umang Production) • Premium Photography & Cinematography Services" className={inputClass} />
            </Field>
            <Field label="Address">
              <input value={filmsAddress} onChange={(e) => setFilmsAddress(e.target.value)} placeholder="Kamtaul, Darbhanga, Bihar" className={inputClass} />
            </Field>
            <Field label="Phone Number">
              <input value={filmsPhone} onChange={(e) => setFilmsPhone(e.target.value)} placeholder="+91 9122441332" className={inputClass} />
            </Field>
            <Field label="Email Address">
              <input value={filmsEmail} onChange={(e) => setFilmsEmail(e.target.value)} placeholder="bollywoodumanginfo@gmail.com" className={inputClass} />
            </Field>
            <Field label="Instagram Handle">
              <input value={filmsInsta} onChange={(e) => setFilmsInsta(e.target.value)} placeholder="@bollywoodumang_films" className={inputClass} />
            </Field>
          </div>
          <ImageUpload
            value={filmsLogoUrl}
            onChange={setFilmsLogoUrl}
            label="Films Logo"
            description="Square format recommended. This logo appears on Films (B2C) bills and booking printouts."
            placeholderIcon={Camera}
          />
        </div>
      )}

      {/* Tab 2: Production */}
      {tab === 'production' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Clapperboard className="h-4 w-4 text-amber-500" /> Bollywood Umang Production (B2B — Video Mixing Lab)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lab Title">
              <input value={productionTitle} onChange={(e) => setProductionTitle(e.target.value)} placeholder="Bollywood Umang Production" className={inputClass} />
            </Field>
            <Field label="Subtitle / Tagline">
              <input value={productionSubtitle} onChange={(e) => setProductionSubtitle(e.target.value)} placeholder="Video Mixing Lab & Post-Production Hub" className={inputClass} />
            </Field>
            <Field label="Address">
              <input value={productionAddress} onChange={(e) => setProductionAddress(e.target.value)} placeholder="Kamtaul, Darbhanga, Bihar" className={inputClass} />
            </Field>
            <Field label="Phone Number">
              <input value={productionPhone} onChange={(e) => setProductionPhone(e.target.value)} placeholder="+91 9122441332" className={inputClass} />
            </Field>
            <Field label="Email Address">
              <input value={productionEmail} onChange={(e) => setProductionEmail(e.target.value)} placeholder="bollywoodumanginfo@gmail.com" className={inputClass} />
            </Field>
            <Field label="Instagram Handle">
              <input value={productionInsta} onChange={(e) => setProductionInsta(e.target.value)} placeholder="@bollywoodumang.production" className={inputClass} />
            </Field>
            <Field label="Bank Name">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bollywood Umang Production" className={inputClass} />
            </Field>
            <Field label="Bank / UPI Payment Details">
              <input value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="Cash / UPI / Bank Transfer" className={inputClass} />
            </Field>
            <Field label="WhatsApp Number (for Lab Order sharing)">
              <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+91 9122441332" className={inputClass} />
            </Field>
          </div>
          <ImageUpload
            value={productionLogoUrl}
            onChange={setProductionLogoUrl}
            label="Production Logo"
            description="Square format recommended. This logo appears on Production (B2B) lab order bills."
            placeholderIcon={Clapperboard}
          />
          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <FileText className="h-4 w-4 text-amber-500" /> Production &amp; Lab Terms &amp; Conditions (नियम व शर्तें)
            </h3>
            <textarea
              value={productionTerms}
              onChange={(e) => setProductionTerms(e.target.value)}
              className={`${textareaClass} min-h-[220px]`}
              style={{ fontFamily: 'Noto Sans Devanagari, sans-serif', lineHeight: '1.6' }}
            />
            <p className="text-xs text-slate-400">These terms appear on B2B Production and Lab work slips only.</p>
          </div>
        </div>
      )}

      {/* Shared Global Settings */}
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Stamp className="h-4 w-4 text-amber-500" /> Official Digital Stamp / Muhar
          </h2>
          <ImageUpload
            value={stampImageUrl}
            onChange={setStampImageUrl}
            label="Official Digital Stamp / Muhar"
            description="This stamp appears on all printed bills and invoices for both Films and Production units."
            rounded="rounded-full"
            placeholderIcon={Stamp}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-white/10 dark:bg-slate-900/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <FileText className="h-4 w-4 text-amber-500" /> Hindi Terms &amp; Conditions
          </h2>
          <textarea
            ref={termsRef}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className={`${textareaClass} min-h-[160px] overflow-hidden`}
            style={{ fontFamily: 'Noto Sans Devanagari, sans-serif', lineHeight: '1.6' }}
          />
          <p className="text-xs text-slate-400">These terms appear on all printed bills and invoices for both Films and Production units.</p>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-semibold text-slate-900 transition-all hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings Configuration'}
      </button>

      {/* Google Drive Account Integration */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Cloud className="h-4 w-4 text-sky-500" /> Google Drive Account Integration
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Connect your Google account to back up studio data directly to Google Drive. Uses OAuth 2.0 with
          <span className="font-mono text-slate-700 dark:text-slate-300"> drive.file </span> scope — only the backup file created by this app is accessible.
        </p>

        {/* Config inputs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Google Client ID (OAuth 2.0)">
            <input
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
              className={inputClass}
            />
          </Field>
          <Field label="Google Drive Folder ID (Optional)">
            <div className="flex gap-2">
              <input
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                className={inputClass}
              />
              <button
                onClick={handleSaveFolderId}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Save
              </button>
            </div>
          </Field>
        </div>

        {/* Connected profile */}
        {hasToken && profile ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              {profile.picture ? (
                <img src={profile.picture} alt="Profile" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500">
                  <User className="h-5 w-5 text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{profile.name}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <ShieldCheck className="h-3 w-3" /> Connected
                  </span>
                </div>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile.email}</p>
              </div>
              <button
                onClick={handleDisconnectGoogle}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <LogOut className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleSignInGoogle}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:shadow-md disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-700"
          >
            <GoogleIcon className="h-5 w-5" />
            {signingIn ? 'Connecting…' : 'Sign in with Google / Connect Email'}
          </button>
        )}

        {/* Connection status */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            {connectedMeta.connected ? (
              <Cloud className="h-5 w-5 text-emerald-500" />
            ) : (
              <CloudOff className="h-5 w-5 text-slate-400" />
            )}
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {connectedMeta.connected ? 'Drive Connected' : 'Drive Disconnected'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {connectedMeta.lastBackupAt
                  ? `Last backup: ${new Date(connectedMeta.lastBackupAt).toLocaleString('en-IN')}`
                  : 'No backup yet'}
              </p>
            </div>
          </div>
          {connectedMeta.connected && (
            <button
              onClick={handleDisconnectGoogle}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Switch Account
            </button>
          )}
        </div>

        {/* Backup metadata */}
        {connectedMeta.lastBackupAt && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/40">
              <HardDrive className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-xs text-slate-400">File size</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {(connectedMeta.sizeBytes / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/40">
              <RefreshCw className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-xs text-slate-400">Records</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{connectedMeta.recordCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/40">
              <Cloud className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-xs text-slate-400">Last restore</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {connectedMeta.lastRestoreAt
                  ? new Date(connectedMeta.lastRestoreAt).toLocaleDateString('en-IN')
                  : 'Never'}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleBackupNow}
            disabled={backingUp || !hasToken}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-sky-500 hover:shadow-lg hover:shadow-sky-500/20 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {backingUp ? 'Uploading…' : 'Backup Now to Google Drive'}
          </button>
          <button
            onClick={() => setShowRestoreConfirm(true)}
            disabled={restoring || !hasToken}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> {restoring ? 'Restoring…' : 'Restore from Google Drive'}
          </button>
        </div>

        {/* List existing backups */}
        {hasToken && (
          <div className="space-y-2">
            <button
              onClick={handleListBackups}
              disabled={listingFiles}
              className="flex items-center gap-2 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
            >
              <FolderOpen className="h-3.5 w-3.5" /> {listingFiles ? 'Listing…' : 'List existing Drive backups'}
            </button>
            {backupFiles.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                {backupFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs dark:bg-slate-800">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                    </div>
                    <span className="text-slate-400">
                      {new Date(f.modifiedTime).toLocaleString('en-IN')} · {(Number(f.size) / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Management Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900/50">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Database className="h-4 w-4 text-amber-500" /> Data Management
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Reset your studio data to a fresh demo set, or clear all records while keeping your settings. Changes apply instantly across all open windows.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowDemoConfirm(true)}
            disabled={loadingDemo}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <FlaskConical className="h-4 w-4" /> {loadingDemo ? 'Loading…' : 'Load Demo Data'}
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={clearing}
            className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
          >
            <Trash2 className="h-4 w-4" /> {clearing ? 'Clearing…' : 'Clear All Data'}
          </button>
        </div>
      </div>

      {/* Restore confirmation modal */}
      <ConfirmDialog
        open={showRestoreConfirm}
        onClose={() => setShowRestoreConfirm(false)}
        onConfirm={handleRestore}
        title="Restore from Google Drive?"
        message="This will overwrite all current local data (Bookings, Lab Orders, Ledger, Payments & Settings) with the contents of the master backup file. This action cannot be undone."
        confirmLabel="Restore & Overwrite"
        danger
      />

      {/* Clear data confirmation */}
      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={async () => {
          setClearing(true);
          (supabase as any).clearAll();
          triggerRefresh();
          setShowClearConfirm(false);
          setClearing(false);
          toast('All data cleared — settings preserved', 'success');
        }}
        title="Clear all data?"
        message="This will permanently delete all bookings, lab orders, ledger entries, and payments. Your studio settings will be kept. This cannot be undone."
        confirmLabel="Clear All Data"
        danger
      />

      {/* Demo data confirmation */}
      <ConfirmDialog
        open={showDemoConfirm}
        onClose={() => setShowDemoConfirm(false)}
        onConfirm={async () => {
          setLoadingDemo(true);
          (supabase as any).resetToDemo();
          triggerRefresh();
          setShowDemoConfirm(false);
          setLoadingDemo(false);
          toast('Demo data loaded successfully', 'success');
        }}
        title="Load demo data?"
        message="This will replace all current data with a fresh set of sample bookings, lab orders, ledger entries, and payments. Your studio settings will be preserved."
        confirmLabel="Load Demo Data"
        danger
      />
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

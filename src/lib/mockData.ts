import type {
  StudioSettings,
  Booking,
  StudioLabOrder,
  PhotographerLedgerEntry,
  Payment,
  EventFunction,
  BookingDeliverables,
  VideoRow,
  AlbumRow,
  LabClientRow,
  Partner,
  DirectTransaction,
  BookingNotification,
  PromoAd,
  Banner,
  Popup,
  Coupon,
  Broadcast,
  MusicProject,
  MusicCue,
  TeaserProject,
  InvitationProject,
} from '@/lib/types';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isoNow(): string {
  return new Date().toISOString();
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export interface MockDB {
  studio_settings: StudioSettings[];
  bookings: Booking[];
  studio_lab_orders: StudioLabOrder[];
  photographer_ledger: PhotographerLedgerEntry[];
  payments: Payment[];
  partners: Partner[];
  direct_transactions: DirectTransaction[];
  booking_notifications: BookingNotification[];
  promo_ads: PromoAd[];
  promo_banners: Banner[];
  promo_popups: Popup[];
  promo_coupons: Coupon[];
  promo_broadcasts: Broadcast[];
  music_projects: MusicProject[];
  music_cues: MusicCue[];
  teaser_projects: TeaserProject[];
  invitation_projects: InvitationProject[];
}

function seedDB(): MockDB {
  const settings: StudioSettings = {
    id: 1,
    films_title: 'Bollywood Umang Films',
    films_subtitle: '(A Unit of Bollywood Umang Production) • Premium Photography & Cinematography Services',
    production_title: 'Bollywood Umang Production',
    production_subtitle: 'Video Mixing Lab & Post-Production Hub',
    address: 'Kamtaul, Darbhanga, Bihar',
    phone: '+91 9122441332',
    email: 'bollywoodumanginfo@gmail.com',
    films_insta: '@bollywoodumang_films',
    production_insta: '@bollywoodumang.production',
    bank_name: 'Bollywood Umang Production',
    bank_details: 'Cash / UPI / Bank Transfer',
    whatsapp_number: '+91 9122441332',
    stamp_image_url: '',
    films_logo_url: '',
    production_logo_url: '',
    terms_conditions:
      '1. अग्रिम भुगतान (Advance Payment): शूट की निर्धारित तिथि से ठीक 7 दिन पूर्व कुल पैकेज राशि का न्यूनतम 50% भुगतान अनिवार्य है।\n2. डेटा सुपुर्दगी (Data Collection): पूर्ण भुगतान कर 30 दिनों के भीतर समस्त डेटा, पेन ड्राइव व एल्बम प्राप्त करना अनिवार्य है।\n3. डेटा सुरक्षा व दायित्व: डिलीवरी तैयार होने के 30 दिनों के बाद डेटा सुरक्षित रखने की कोई जिम्मेदारी स्टूडियो की नहीं होगी।\n4. स्वीकृति (Agreement): बुकिंग अथवा अग्रिम भुगतान करते ही ग्राहक उपर्युक्त सभी शर्तों को पूर्णतः स्वीकार करता है।',
  };

  const events1: EventFunction[] = [
    { name: 'Haldi', date: dateOffset(6), time: '10:00' },
    { name: 'Wedding/Barat', date: dateOffset(7), time: '16:00' },
    { name: 'Reception', date: dateOffset(8), time: '18:00' },
  ];
  const events2: EventFunction[] = [
    { name: 'Pre-Wedding', date: dateOffset(-5), time: '08:00' },
  ];
  const events3: EventFunction[] = [
    { name: 'Reception', date: dateOffset(14), time: '18:00' },
  ];

  const deliv1: BookingDeliverables = {
    album_notes: 'Velvet Matte HD, 40 Sheets, Acrylic 3D Cover',
    video_traditional: true,
    video_highlight: true,
    cinematic_highlight: true,
    cinematic_reel: true,
    cinematic_reel_count: 2,
    cinematic_story: false,
    raw_video: true,
    raw_selected_photos: false,
    raw_all_photos: false,
    raw_edited_photos: false,
  };
  const deliv2: BookingDeliverables = {
    album_notes: '',
    video_traditional: false,
    video_highlight: true,
    cinematic_highlight: true,
    cinematic_reel: true,
    cinematic_reel_count: 1,
    cinematic_story: false,
    raw_video: false,
    raw_selected_photos: true,
    raw_all_photos: false,
    raw_edited_photos: false,
  };
  const deliv3: BookingDeliverables = {
    album_notes: 'Karizma Album, 12×36, 30 Sheets',
    video_traditional: true,
    video_highlight: false,
    cinematic_highlight: false,
    cinematic_reel: false,
    cinematic_reel_count: 1,
    cinematic_story: false,
    raw_video: false,
    raw_selected_photos: false,
    raw_all_photos: true,
    raw_edited_photos: true,
  };
  const deliv4: BookingDeliverables = {
    album_notes: '',
    video_traditional: false,
    video_highlight: false,
    cinematic_highlight: true,
    cinematic_reel: false,
    cinematic_reel_count: 1,
    cinematic_story: false,
    raw_video: false,
    raw_selected_photos: true,
    raw_all_photos: false,
    raw_edited_photos: false,
  };

  const bookings: Booking[] = [
    {
      id: uuid(), booking_no: 'BUF-001', client_name: 'Rajesh Kumar Singh', client_mobile: '+91 98765 43210', client_address: 'Laheriasarai, Darbhanga',
      event_function: 'Haldi, Wedding/Barat, Reception', events: events1, shoot_date: dateOffset(7), shoot_time: '16:00', venue: 'Sanskriti Vihar, Darbhanga', booking_status: 'CONFIRMED',
      base_amount: 0, total_amount: 60000, discount: 5000, advance_paid: 30000, net_due: 25000, deliverables_data: deliv1,
      is_login_allowed: false, client_password: '+91 98765 43210', password_changed: false, work_status: 'pending', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-002', client_name: 'Mohammed Imran Khan', client_mobile: '+91 99887 76655', client_address: 'Kamtaul, Darbhanga',
      event_function: 'Pre-Wedding', events: events2, shoot_date: dateOffset(-3), shoot_time: '08:00', venue: 'Eidgah Maidan, Kamtaul', booking_status: 'COMPLETED',
      base_amount: 0, total_amount: 16000, discount: 0, advance_paid: 16000, net_due: 0, deliverables_data: deliv2,
      is_login_allowed: false, client_password: '+91 99887 76655', password_changed: false, work_status: 'delivered', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-003', client_name: 'Sunita Devi', client_mobile: '+91 91234 56789', client_address: 'Beladungri, Madhubani',
      event_function: 'Reception', events: events3, shoot_date: dateOffset(14), shoot_time: '18:00', venue: 'Town Hall, Madhubani', booking_status: 'CONFIRMED',
      base_amount: 0, total_amount: 28000, discount: 0, advance_paid: 10000, net_due: 18000, deliverables_data: deliv3,
      is_login_allowed: false, client_password: '+91 91234 56789', password_changed: false, work_status: 'pending', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-004', client_name: 'Amit Jha', client_mobile: '+91 90011 22334', client_address: 'Bhagalpur',
      event_function: 'Birthday', events: [{ name: 'Birthday', date: dateOffset(-10), time: '14:00' }], shoot_date: dateOffset(-10), shoot_time: '14:00', venue: 'Home, Bhagalpur', booking_status: 'COMPLETED',
      base_amount: 0, total_amount: 5000, discount: 0, advance_paid: 5000, net_due: 0, deliverables_data: deliv4,
      is_login_allowed: false, client_password: '+91 90011 22334', password_changed: false, work_status: 'delivered', created_at: isoNow(),
    },
  ];

  const videoRows1: VideoRow[] = [
    { video_type: 'Traditional Video', quality: '1080p FHD', qty: 1, rate: 3000, total: 3000 },
    { video_type: 'Teaser/Highlight', quality: '4K', qty: 1, rate: 2000, total: 2000 },
  ];
  const albumRows2: AlbumRow[] = [
    { id: uuid(), album_type: 'Karizma Album', size: '12x36', packaging_type: 'cover', packaging_value: 'Leather', custom_packaging: '', packaging_rate: 1500, packaging_total: 1500, mini_album: false, mini_qty: 0, mini_rate: 0, mini_total: 0, papers: [{ id: uuid(), paper_type: 'Glossy', sheets: 40, rate: 10, total: 400 }], total: 1900 },
  ];
  const videoRows3: VideoRow[] = [
    { video_type: 'Cinematic Video', quality: '4K', qty: 3, rate: 1500, total: 4500 },
  ];
  const videoRows4: VideoRow[] = [
    { video_type: 'Traditional Video', quality: '1080p FHD', qty: 1, rate: 2000, total: 2000 },
  ];

  const partners: Partner[] = [
    { id: uuid(), name: 'Vikash Thakur', mobile: '+91 98000 11111', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Wedding & pre-wedding specialist', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Saurav Anand', mobile: '+91 98000 22222', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Nikah & event coverage', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Deepak Kumar', mobile: '+91 98000 33333', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Drone operator', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Sharma Studio', mobile: '+91 98000 44444', studio_name: 'Sharma Studio', studio_address: 'Laheriasarai, Darbhanga', category: 'Studio Freelancer', status: 'Active', note: 'Video mixing partner', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Smile Photography', mobile: '+91 98000 55555', studio_name: 'Smile Photography', studio_address: 'Kamtaul, Darbhanga', category: 'Studio Freelancer', status: 'Inactive', note: 'Album design — seasonal', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Royal Films', mobile: '+91 98000 66666', studio_name: 'Royal Films', studio_address: 'Madhubani', category: 'Studio Freelancer', status: 'Active', note: 'Color grading & post', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Ravi Equipment Rentals', mobile: '+91 98000 77777', studio_name: '', studio_address: '', category: 'Other', status: 'Active', note: 'Lens & lighting rentals', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
  ];

  const client1: LabClientRow = { id: uuid(), client_name: 'Rajesh Kumar Singh', event_address: 'Sanskriti Vihar, Darbhanga', video_rows: videoRows1, album_rows: [], video_total: 5000, album_total: 0, delivery_status: 'In Design', dispatch_mode: 'By Hand' };
  const client2: LabClientRow = { id: uuid(), client_name: 'Mohammed Imran Khan', event_address: 'Eidgah Maidan, Kamtaul', video_rows: [], album_rows: albumRows2, video_total: 0, album_total: 3000, delivery_status: 'Delivered', dispatch_mode: 'By Hand' };
  const client3: LabClientRow = { id: uuid(), client_name: 'Sunita Devi', event_address: 'Town Hall, Madhubani', video_rows: videoRows3, album_rows: [], video_total: 4500, album_total: 0, delivery_status: 'Ready', dispatch_mode: 'Courier' };
  const client4: LabClientRow = { id: uuid(), client_name: 'Amit Jha', event_address: 'Home, Bhagalpur', video_rows: videoRows4, album_rows: [], video_total: 2000, album_total: 0, delivery_status: 'In Design', dispatch_mode: 'Drive' };

  const studio_lab_orders: StudioLabOrder[] = [
    {
      id: uuid(), order_no: 'BUP-001', partner_id: partners[3].id, partner_name: 'Sharma Studio', studio_name: 'Sharma Studio', studio_mobile: '+91 98000 44444', studio_address: 'Laheriasarai, Darbhanga', project_name: 'Sharma Wedding Edit',
      work_type: 'Video Mixing', clients: [client1], total_album_bill: 0, total_video_bill: 5000, current_order_total: 5000, previous_back_due: 2000, master_total: 7000, advance_paid: 3000, net_final_due: 4000,
      payment_mode: 'UPI / PhonePe / GPay', payment_date: dateOffset(0), payment_note: 'UTR: 123456789',
      order_status: 'Processing', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: videoRows1, album_rows: [], created_at: isoNow(),
    },
    {
      id: uuid(), order_no: 'BUP-002', partner_id: partners[4].id, partner_name: 'Smile Photography', studio_name: 'Smile Photography', studio_mobile: '+91 98000 55555', studio_address: 'Kamtaul, Darbhanga', project_name: 'Album Design - 2 albums',
      work_type: 'Album Design', clients: [client2], total_album_bill: 3000, total_video_bill: 0, current_order_total: 3000, previous_back_due: 0, master_total: 3000, advance_paid: 3000, net_final_due: 0,
      payment_mode: 'Cash', payment_date: dateOffset(-1), payment_note: 'Full payment',
      order_status: 'Ready', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: [], album_rows: albumRows2, created_at: isoNow(),
    },
    {
      id: uuid(), order_no: 'BUP-003', partner_id: partners[5].id, partner_name: 'Royal Films', studio_name: 'Royal Films', studio_mobile: '+91 98000 66666', studio_address: 'Madhubani', project_name: 'Color Grading - 3 videos',
      work_type: 'Video Mixing', clients: [client3], total_album_bill: 0, total_video_bill: 4500, current_order_total: 4500, previous_back_due: 1500, master_total: 6000, advance_paid: 2000, net_final_due: 4000,
      payment_mode: 'Bank Transfer', payment_date: dateOffset(0), payment_note: 'UTR: BANK987654',
      order_status: 'Processing', delivery_mode: 'Parcel/Courier', parcel_tracking_details: 'DTDC: P123456789', video_rows: videoRows3, album_rows: [], created_at: isoNow(),
    },
    {
      id: uuid(), order_no: 'BUP-004', partner_id: partners[4].id, partner_name: 'Smile Photography', studio_name: 'Smile Photography', studio_mobile: '+91 98000 55555', studio_address: 'Kamtaul, Darbhanga', project_name: 'Video Mixing - Reception',
      work_type: 'Video Mixing', clients: [client4], total_album_bill: 0, total_video_bill: 2000, current_order_total: 2000, previous_back_due: 0, master_total: 2000, advance_paid: 0, net_final_due: 2000,
      payment_mode: '', payment_date: '', payment_note: '',
      order_status: 'Processing', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: videoRows4, album_rows: [], created_at: isoNow(),
    },
  ];

  const photographer_ledger: PhotographerLedgerEntry[] = [
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '+91 98000 11111', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Wedding shoot - 1 day', amount: 5000, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '+91 98000 11111', entry_type: 'LAB_WORK_DEBIT', description: 'Album printing - 2 copies', amount: 1500, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '+91 98000 11111', entry_type: 'PAYMENT_SETTLED', description: 'Cash payment', amount: 3500, payment_mode: 'Cash', payment_date: dateOffset(-2), created_at: isoNow() },
    { id: uuid(), photographer_name: 'Saurav Anand', mobile: '+91 98000 22222', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Nikah shoot - 1 day', amount: 3500, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Saurav Anand', mobile: '+91 98000 22222', entry_type: 'PAYMENT_SETTLED', description: 'UPI transfer', amount: 3500, payment_mode: 'UPI', payment_date: dateOffset(-1), created_at: isoNow() },
    { id: uuid(), photographer_name: 'Deepak Kumar', mobile: '+91 98000 33333', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Drone coverage - 1 day', amount: 4000, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Deepak Kumar', mobile: '+91 98000 33333', entry_type: 'LAB_WORK_DEBIT', description: 'Pen drive purchase', amount: 800, payment_mode: '', payment_date: '', created_at: isoNow() },
  ];

  const payments: Payment[] = [
    { id: uuid(), receipt_no: 'RCP-001', source: 'Booking', party_name: 'Rajesh Kumar Singh', party_mobile: '+91 98765 43210', mode: 'UPI', amount: 30000, date: dateOffset(0), note: 'Advance for BUF-001', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-002', source: 'Booking', party_name: 'Mohammed Imran Khan', party_mobile: '+91 99887 76655', mode: 'Cash', amount: 16000, date: dateOffset(-3), note: 'Full payment BUF-002', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-003', source: 'Booking', party_name: 'Sunita Devi', party_mobile: '+91 91234 56789', mode: 'Bank', amount: 10000, date: dateOffset(1), note: 'Advance for BUF-003', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-004', source: 'Lab Order', party_name: 'Sharma Studio', party_mobile: '+91 98000 11111', mode: 'UPI', amount: 3000, date: dateOffset(0), note: 'Advance BUP-001', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-005', source: 'Lab Order', party_name: 'Smile Photography', party_mobile: '+91 98000 22222', mode: 'Cash', amount: 3000, date: dateOffset(-1), note: 'Full payment BUP-002', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-006', source: 'Photographer', party_name: 'Vikash Thakur', party_mobile: '+91 98000 11111', mode: 'Cash', amount: 3500, date: dateOffset(-2), note: 'Settlement', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-007', source: 'Booking', party_name: 'Amit Jha', party_mobile: '+91 90011 22334', mode: 'Cash', amount: 5000, date: dateOffset(-10), note: 'Full payment BUF-004', created_at: isoNow() },
  ];

  const direct_transactions: DirectTransaction[] = [
    { id: uuid(), partner_id: partners[0].id, partner_name: 'Vikash Thakur', partner_mobile: '+91 98000 11111', txn_type: 'Given', amount: 2000, payment_mode: 'Cash', txn_date: dateOffset(-4), note: 'Personal advance', created_at: isoNow() },
    { id: uuid(), partner_id: partners[3].id, partner_name: 'Sharma Studio', partner_mobile: '+91 98000 44444', txn_type: 'Given', amount: 5000, payment_mode: 'UPI', txn_date: dateOffset(-6), note: 'Machine advance', created_at: isoNow() },
    { id: uuid(), partner_id: partners[0].id, partner_name: 'Vikash Thakur', partner_mobile: '+91 98000 11111', txn_type: 'Received', amount: 1000, payment_mode: 'Cash', txn_date: dateOffset(-2), note: 'Partial advance return', created_at: isoNow() },
  ];

  const bookingNotifications: BookingNotification[] = [
    { id: uuid(), booking_id: bookings[0].id, type: 'payment', title: 'Payment Received', message: 'Payment of \u20b930,000 received successfully. Remaining balance: \u20b925,000.', is_read: false, created_at: isoNow() },
    { id: uuid(), booking_id: bookings[2].id, type: 'payment', title: 'Payment Received', message: 'Payment of \u20b910,000 received successfully. Remaining balance: \u20b918,000.', is_read: false, created_at: isoNow() },
  ];

  const promoAds: PromoAd[] = [
    { id: uuid(), title: 'Pre-Wedding Combo Offer', description: 'Book a pre-wedding shoot along with your wedding package and get 20% off on the pre-wedding session.', image_url: '', action_link: '', audience: 'clients', is_active: true, sort_order: 1, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), title: 'Drone Coverage Add-On', description: 'Add aerial drone coverage to any event for stunning cinematic shots. Available as an optional add-on.', image_url: '', action_link: '', audience: 'clients', is_active: true, sort_order: 2, created_at: isoNow(), updated_at: isoNow() },
  ];

  return {
    studio_settings: [settings],
    bookings,
    studio_lab_orders,
    photographer_ledger,
    payments,
    partners,
    direct_transactions,
    booking_notifications: bookingNotifications,
    promo_ads: promoAds,
    promo_banners: [],
    promo_popups: [],
    promo_coupons: [],
    promo_broadcasts: [],
    music_projects: [],
    music_cues: [],
    teaser_projects: [],
    invitation_projects: [],
  };
}

const STORAGE_KEY = 'bup_mock_db_v8';

export function loadDB(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Partial<MockDB>;
      return {
        ...db,
        music_projects: db.music_projects ?? [],
        music_cues: db.music_cues ?? [],
        teaser_projects: db.teaser_projects ?? [],
        invitation_projects: db.invitation_projects ?? [],
      } as MockDB;
    }
  } catch {
    // ignore
  }
  const db = seedDB();
  saveDB(db);
  return db;
}

export function saveDB(db: MockDB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

export function resetDB(): MockDB {
  const db = seedDB();
  saveDB(db);
  return db;
}

export function clearAllData(): MockDB {
  const raw = localStorage.getItem(STORAGE_KEY);
  let settings: StudioSettings | undefined;
  if (raw) {
    try {
      const existing = JSON.parse(raw) as MockDB;
      settings = existing.studio_settings?.[0];
    } catch {
      // ignore
    }
  }
  const empty: MockDB = {
    studio_settings: settings ? [settings] : seedDB().studio_settings,
    bookings: [],
    studio_lab_orders: [],
    photographer_ledger: [],
    payments: [],
    partners: [],
    direct_transactions: [],
    booking_notifications: [],
    promo_ads: [],
    promo_banners: [],
    promo_popups: [],
    promo_coupons: [],
    promo_broadcasts: [],
    music_projects: [],
    music_cues: [],
    teaser_projects: [],
    invitation_projects: [],
  };
  saveDB(empty);
  return empty;
}

export function reloadDB(): MockDB {
  return loadDB();
}

export { uuid, isoNow };

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
  ClientSelectionSession,
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
  ledger_entries: any[];
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
  photo_selection_sessions: ClientSelectionSession[];
}

function demoId(prefix: string, fallbackId?: string): string {
  const stamp = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? (globalThis.crypto as Crypto).randomUUID()
    : uuid();
  return `demo-${prefix}-${fallbackId ?? stamp}`;
}

function withDemoFlag<T extends Record<string, any>>(rows: T[] | undefined, demo = true, prefix = 'record'): T[] {
  return (rows ?? []).map((row, index) => {
    const next = { ...row, is_demo: demo, isDemo: demo } as T & { id?: string };
    if (typeof next.id === 'string' && next.id.startsWith('demo-')) {
      return next as T;
    }
    next.id = demoId(prefix, `${index + 1}`);
    return next as T;
  });
}

function strictDemoMatch(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  if (row.isDemo === true || row.is_demo === true) return true;
  const id = String(row.id ?? '');
  const bookingNo = String(row.booking_no ?? '');
  const orderNo = String(row.order_no ?? '');
  const receiptNo = String(row.receipt_no ?? '');
  return id.startsWith('DEMO-') || id.startsWith('demo-') || bookingNo.startsWith('DEMO-') || orderNo.startsWith('DEMO-') || receiptNo.startsWith('DEMO-');
}

function resolveRecordIdentity(row: any): string {
  if (!row || typeof row !== 'object') return '';
  const direct = [row.id, row.booking_no, row.order_no, row.receipt_no, row.client_id, row.partner_id, row.partner_name, row.client_name].find((value) => value !== undefined && value !== null && value !== '');
  return typeof direct === 'string' ? direct : JSON.stringify(row);
}

function isDemoRecord(row: any): boolean {
  return strictDemoMatch(row);
}

function seedDB(): MockDB {
  const settings: StudioSettings = {
    id: 1,
    films_title: 'Bollywood Umang Films',
    films_subtitle: '(A Unit of Bollywood Umang Production) • Premium Photography & Cinematography Services',
    production_title: 'Bollywood Umang Production',
    production_subtitle: 'Video Mixing Lab & Post-Production Hub',
    address: 'Kamtaul, Darbhanga, Bihar',
    phone: '9122441332',
    email: 'bollywoodumanginfo@gmail.com',
    films_insta: '@bollywoodumang_films',
    production_insta: '@bollywoodumang.production',
    bank_name: 'Bollywood Umang Production',
    bank_details: 'Cash / UPI / Bank Transfer',
    whatsapp_number: '9122441332',
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

  const ledgerEntries: any[] = [];

  const bookings: Booking[] = [
    {
      id: uuid(), booking_no: 'BUF-001', client_name: 'Rajesh Kumar Singh', client_mobile: '9876543210', client_address: 'Laheriasarai, Darbhanga',
      event_function: 'Haldi, Wedding/Barat, Reception', events: events1, shoot_date: dateOffset(7), shoot_time: '16:00', venue: 'Sanskriti Vihar, Darbhanga', booking_status: 'CONFIRMED',
      base_amount: 0, total_amount: 60000, discount: 5000, advance_paid: 30000, net_due: 25000, deliverables_data: deliv1,
      is_login_allowed: false, access_pin: '43210'.slice(-4), pin_changed: false, work_status: 'pending', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-002', client_name: 'Mohammed Imran Khan', client_mobile: '9988776655', client_address: 'Kamtaul, Darbhanga',
      event_function: 'Pre-Wedding', events: events2, shoot_date: dateOffset(-3), shoot_time: '08:00', venue: 'Eidgah Maidan, Kamtaul', booking_status: 'COMPLETED',
      base_amount: 0, total_amount: 16000, discount: 0, advance_paid: 16000, net_due: 0, deliverables_data: deliv2,
      is_login_allowed: false, access_pin: '76655'.slice(-4), pin_changed: false, work_status: 'delivered', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-003', client_name: 'Sunita Devi', client_mobile: '9123456789', client_address: 'Beladungri, Madhubani',
      event_function: 'Reception', events: events3, shoot_date: dateOffset(14), shoot_time: '18:00', venue: 'Town Hall, Madhubani', booking_status: 'CONFIRMED',
      base_amount: 0, total_amount: 28000, discount: 0, advance_paid: 10000, net_due: 18000, deliverables_data: deliv3,
      is_login_allowed: false, access_pin: '56789'.slice(-4), pin_changed: false, work_status: 'pending', created_at: isoNow(),
    },
    {
      id: uuid(), booking_no: 'BUF-004', client_name: 'Amit Jha', client_mobile: '9001122334', client_address: 'Bhagalpur',
      event_function: 'Birthday', events: [{ name: 'Birthday', date: dateOffset(-10), time: '14:00' }], shoot_date: dateOffset(-10), shoot_time: '14:00', venue: 'Home, Bhagalpur', booking_status: 'COMPLETED',
      base_amount: 0, total_amount: 5000, discount: 0, advance_paid: 5000, net_due: 0, deliverables_data: deliv4,
      is_login_allowed: false, access_pin: '22334'.slice(-4), pin_changed: false, work_status: 'delivered', created_at: isoNow(),
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
    { id: uuid(), name: 'Vikash Thakur', mobile: '9800011111', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Wedding & pre-wedding specialist', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Saurav Anand', mobile: '9800022222', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Nikah & event coverage', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Deepak Kumar', mobile: '9800033333', studio_name: '', studio_address: '', category: 'Photographer Freelancer', status: 'Active', note: 'Drone operator', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Sharma Studio', mobile: '9800044444', studio_name: 'Sharma Studio', studio_address: 'Laheriasarai, Darbhanga', category: 'Studio Freelancer', status: 'Active', note: 'Video mixing partner', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Smile Photography', mobile: '9800055555', studio_name: 'Smile Photography', studio_address: 'Kamtaul, Darbhanga', category: 'Studio Freelancer', status: 'Inactive', note: 'Album design — seasonal', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Royal Films', mobile: '9800066666', studio_name: 'Royal Films', studio_address: 'Madhubani', category: 'Studio Freelancer', status: 'Active', note: 'Color grading & post', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
    { id: uuid(), name: 'Ravi Equipment Rentals', mobile: '9800077777', studio_name: '', studio_address: '', category: 'Other', status: 'Active', note: 'Lens & lighting rentals', trashed_at: null, created_at: isoNow(), updated_at: isoNow() },
  ];

  const client1: LabClientRow = { id: uuid(), client_name: 'Rajesh Kumar Singh', event_address: 'Sanskriti Vihar, Darbhanga', video_rows: videoRows1, album_rows: [], video_total: 5000, album_total: 0, delivery_status: 'In Design', dispatch_mode: 'By Hand' };
  const client2: LabClientRow = { id: uuid(), client_name: 'Mohammed Imran Khan', event_address: 'Eidgah Maidan, Kamtaul', video_rows: [], album_rows: albumRows2, video_total: 0, album_total: 3000, delivery_status: 'Delivered', dispatch_mode: 'By Hand' };
  const client3: LabClientRow = { id: uuid(), client_name: 'Sunita Devi', event_address: 'Town Hall, Madhubani', video_rows: videoRows3, album_rows: [], video_total: 4500, album_total: 0, delivery_status: 'Ready', dispatch_mode: 'Courier' };
  const client4: LabClientRow = { id: uuid(), client_name: 'Amit Jha', event_address: 'Home, Bhagalpur', video_rows: videoRows4, album_rows: [], video_total: 2000, album_total: 0, delivery_status: 'In Design', dispatch_mode: 'Drive' };

  const studio_lab_orders: StudioLabOrder[] = [
    {
      id: uuid(), order_no: 'BUP-001', partner_id: partners[3].id, partner_name: 'Sharma Studio', studio_name: 'Sharma Studio', studio_mobile: '9800044444', studio_address: 'Laheriasarai, Darbhanga', project_name: 'Sharma Wedding Edit',
      work_type: 'Video Mixing', clients: [client1], total_album_bill: 0, total_video_bill: 5000, current_order_total: 5000, previous_back_due: 2000, master_total: 7000, advance_paid: 3000, net_due: 4000, net_final_due: 4000,
      payment_mode: 'UPI / PhonePe / GPay', payment_date: dateOffset(0), payment_note: 'UTR: 123456789',
      order_status: 'Processing', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: videoRows1, album_rows: [], created_at: isoNow(), access_pin: '44444'.slice(-4), pin_changed: false, is_login_allowed: false,
    },
    {
      id: uuid(), order_no: 'BUP-002', partner_id: partners[4].id, partner_name: 'Smile Photography', studio_name: 'Smile Photography', studio_mobile: '9800055555', studio_address: 'Kamtaul, Darbhanga', project_name: 'Album Design - 2 albums',
      work_type: 'Album Design', clients: [client2], total_album_bill: 3000, total_video_bill: 0, current_order_total: 3000, previous_back_due: 0, master_total: 3000, advance_paid: 3000, net_due: 0, net_final_due: 0,
      payment_mode: 'Cash', payment_date: dateOffset(-1), payment_note: 'Full payment',
      order_status: 'Ready', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: [], album_rows: albumRows2, created_at: isoNow(), access_pin: '55555'.slice(-4), pin_changed: false, is_login_allowed: false,
    },
    {
      id: uuid(), order_no: 'BUP-003', partner_id: partners[5].id, partner_name: 'Royal Films', studio_name: 'Royal Films', studio_mobile: '9800066666', studio_address: 'Madhubani', project_name: 'Color Grading - 3 videos',
      work_type: 'Video Mixing', clients: [client3], total_album_bill: 0, total_video_bill: 4500, current_order_total: 4500, previous_back_due: 1500, master_total: 6000, advance_paid: 2000, net_due: 4000, net_final_due: 4000,
      payment_mode: 'Bank Transfer', payment_date: dateOffset(0), payment_note: 'UTR: BANK987654',
      order_status: 'Processing', delivery_mode: 'Parcel/Courier', parcel_tracking_details: 'DTDC: P123456789', video_rows: videoRows3, album_rows: [], created_at: isoNow(), access_pin: '66666'.slice(-4), pin_changed: false, is_login_allowed: false,
    },
    {
      id: uuid(), order_no: 'BUP-004', partner_id: partners[4].id, partner_name: 'Smile Photography', studio_name: 'Smile Photography', studio_mobile: '9800055555', studio_address: 'Kamtaul, Darbhanga', project_name: 'Video Mixing - Reception',
      work_type: 'Video Mixing', clients: [client4], total_album_bill: 0, total_video_bill: 2000, current_order_total: 2000, previous_back_due: 0, master_total: 2000, advance_paid: 0, net_due: 2000, net_final_due: 2000,
      payment_mode: '', payment_date: '', payment_note: '',
      order_status: 'Processing', delivery_mode: 'By Hand', parcel_tracking_details: '', video_rows: videoRows4, album_rows: [], created_at: isoNow(), access_pin: '55555'.slice(-4), pin_changed: false, is_login_allowed: false,
    },
  ];

  const photographer_ledger: PhotographerLedgerEntry[] = [
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '9800011111', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Wedding shoot - 1 day', amount: 5000, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '9800011111', entry_type: 'LAB_WORK_DEBIT', description: 'Album printing - 2 copies', amount: 1500, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Vikash Thakur', mobile: '9800011111', entry_type: 'PAYMENT_SETTLED', description: 'Cash payment', amount: 3500, payment_mode: 'Cash', payment_date: dateOffset(-2), created_at: isoNow() },
    { id: uuid(), photographer_name: 'Saurav Anand', mobile: '9800022222', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Nikah shoot - 1 day', amount: 3500, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Saurav Anand', mobile: '9800022222', entry_type: 'PAYMENT_SETTLED', description: 'UPI transfer', amount: 3500, payment_mode: 'UPI', payment_date: dateOffset(-1), created_at: isoNow() },
    { id: uuid(), photographer_name: 'Deepak Kumar', mobile: '9800033333', entry_type: 'SHOOT_DUTY_CREDIT', description: 'Drone coverage - 1 day', amount: 4000, payment_mode: '', payment_date: '', created_at: isoNow() },
    { id: uuid(), photographer_name: 'Deepak Kumar', mobile: '9800033333', entry_type: 'LAB_WORK_DEBIT', description: 'Pen drive purchase', amount: 800, payment_mode: '', payment_date: '', created_at: isoNow() },
  ];

  const payments: Payment[] = [
    { id: uuid(), receipt_no: 'RCP-001', source: 'Booking', party_name: 'Rajesh Kumar Singh', party_mobile: '9876543210', mode: 'UPI', amount: 30000, date: dateOffset(0), note: 'Advance for BUF-001', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-002', source: 'Booking', party_name: 'Mohammed Imran Khan', party_mobile: '9988776655', mode: 'Cash', amount: 16000, date: dateOffset(-3), note: 'Full payment BUF-002', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-003', source: 'Booking', party_name: 'Sunita Devi', party_mobile: '9123456789', mode: 'Bank', amount: 10000, date: dateOffset(1), note: 'Advance for BUF-003', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-004', source: 'Lab Order', party_name: 'Sharma Studio', party_mobile: '9800011111', mode: 'UPI', amount: 3000, date: dateOffset(0), note: 'Advance BUP-001', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-005', source: 'Lab Order', party_name: 'Smile Photography', party_mobile: '9800022222', mode: 'Cash', amount: 3000, date: dateOffset(-1), note: 'Full payment BUP-002', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-006', source: 'Photographer', party_name: 'Vikash Thakur', party_mobile: '9800011111', mode: 'Cash', amount: 3500, date: dateOffset(-2), note: 'Settlement', created_at: isoNow() },
    { id: uuid(), receipt_no: 'RCP-007', source: 'Booking', party_name: 'Amit Jha', party_mobile: '9001122334', mode: 'Cash', amount: 5000, date: dateOffset(-10), note: 'Full payment BUF-004', created_at: isoNow() },
  ];

  const direct_transactions: DirectTransaction[] = [
    { id: uuid(), partner_id: partners[0].id, partner_name: 'Vikash Thakur', partner_mobile: '9800011111', txn_type: 'Given', amount: 2000, payment_mode: 'Cash', txn_date: dateOffset(-4), note: 'Personal advance', created_at: isoNow() },
    { id: uuid(), partner_id: partners[3].id, partner_name: 'Sharma Studio', partner_mobile: '9800044444', txn_type: 'Given', amount: 5000, payment_mode: 'UPI', txn_date: dateOffset(-6), note: 'Machine advance', created_at: isoNow() },
    { id: uuid(), partner_id: partners[0].id, partner_name: 'Vikash Thakur', partner_mobile: '9800011111', txn_type: 'Received', amount: 1000, payment_mode: 'Cash', txn_date: dateOffset(-2), note: 'Partial advance return', created_at: isoNow() },
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
    ledger_entries: ledgerEntries,
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
    photo_selection_sessions: [],
  };
}

export function seedDemoDB(): MockDB {
  const db = seedDB();
  const demoBookings = db.bookings.map((booking, index) => ({
    ...booking,
    id: `demo-booking-${index + 1}`,
    booking_no: `DEMO-BUF-${String(index + 1).padStart(3, '0')}`,
    isDemo: true,
    is_demo: true,
  }));
  const demoOrders = db.studio_lab_orders.map((order, index) => ({
    ...order,
    id: `demo-lab-order-${index + 1}`,
    order_no: `DEMO-BUP-${String(index + 1).padStart(3, '0')}`,
    isDemo: true,
    is_demo: true,
  }));

  return {
    ...db,
    studio_settings: db.studio_settings.map((setting) => ({ ...setting, id: 'demo-settings-1' as any, isDemo: true })),
    bookings: demoBookings,
    studio_lab_orders: demoOrders,
    photographer_ledger: db.photographer_ledger.map((row, index) => ({ ...row, id: `demo-ledger-${index + 1}`, isDemo: true, is_demo: true })),
    ledger_entries: db.ledger_entries.map((row, index) => ({ ...row, id: `demo-ledger-entry-${index + 1}`, isDemo: true, is_demo: true })),
    payments: db.payments.map((row, index) => ({ ...row, id: `demo-payment-${index + 1}`, isDemo: true, is_demo: true })),
    partners: db.partners.map((row, index) => ({ ...row, id: `demo-partner-${index + 1}`, isDemo: true, is_demo: true })),
    direct_transactions: db.direct_transactions.map((row, index) => ({ ...row, id: `demo-transaction-${index + 1}`, isDemo: true, is_demo: true })),
    booking_notifications: db.booking_notifications.map((row, index) => ({ ...row, id: `demo-notification-${index + 1}`, isDemo: true, is_demo: true })),
    promo_ads: db.promo_ads.map((row, index) => ({ ...row, id: `demo-promo-ad-${index + 1}`, isDemo: true, is_demo: true })),
    promo_banners: db.promo_banners.map((row, index) => ({ ...row, id: `demo-promo-banner-${index + 1}`, isDemo: true, is_demo: true })),
    promo_popups: db.promo_popups.map((row, index) => ({ ...row, id: `demo-promo-popup-${index + 1}`, isDemo: true, is_demo: true })),
    promo_coupons: db.promo_coupons.map((row, index) => ({ ...row, id: `demo-promo-coupon-${index + 1}`, isDemo: true, is_demo: true })),
    promo_broadcasts: db.promo_broadcasts.map((row, index) => ({ ...row, id: `demo-promo-broadcast-${index + 1}`, isDemo: true, is_demo: true })),
    music_projects: db.music_projects.map((row, index) => ({ ...row, id: `demo-music-project-${index + 1}`, isDemo: true, is_demo: true })),
    music_cues: db.music_cues.map((row, index) => ({ ...row, id: `demo-music-cue-${index + 1}`, isDemo: true, is_demo: true })),
    teaser_projects: db.teaser_projects.map((row, index) => ({ ...row, id: `demo-teaser-project-${index + 1}`, isDemo: true, is_demo: true })),
    invitation_projects: db.invitation_projects.map((row, index) => ({ ...row, id: `demo-invitation-project-${index + 1}`, isDemo: true, is_demo: true })),
    photo_selection_sessions: db.photo_selection_sessions.map((row, index) => ({ ...row, id: `demo-photo-selection-${index + 1}`, isDemo: true, is_demo: true })),
  };
}

export function resetDemoData(): MockDB {
  return wipeDemoData();
}

const STORAGE_KEY = 'bup_mock_db_v8';

export function loadDB(): MockDB {
  const fallback = seedDB();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Partial<MockDB>;
      const merged: MockDB = {
        ...fallback,
        ...db,
        studio_settings: Array.isArray(db.studio_settings) && db.studio_settings.length > 0 ? db.studio_settings : fallback.studio_settings,
        bookings: Array.isArray(db.bookings) && db.bookings.length > 0 ? db.bookings : fallback.bookings,
        studio_lab_orders: Array.isArray(db.studio_lab_orders) && db.studio_lab_orders.length > 0 ? db.studio_lab_orders : fallback.studio_lab_orders,
        photographer_ledger: Array.isArray(db.photographer_ledger) && db.photographer_ledger.length > 0 ? db.photographer_ledger : fallback.photographer_ledger,
        ledger_entries: Array.isArray(db.ledger_entries) ? db.ledger_entries : fallback.ledger_entries,
        payments: Array.isArray(db.payments) && db.payments.length > 0 ? db.payments : fallback.payments,
        partners: Array.isArray(db.partners) && db.partners.length > 0 ? db.partners : fallback.partners,
        direct_transactions: Array.isArray(db.direct_transactions) && db.direct_transactions.length > 0 ? db.direct_transactions : fallback.direct_transactions,
        booking_notifications: Array.isArray(db.booking_notifications) && db.booking_notifications.length > 0 ? db.booking_notifications : fallback.booking_notifications,
        promo_ads: Array.isArray(db.promo_ads) && db.promo_ads.length > 0 ? db.promo_ads : fallback.promo_ads,
        promo_banners: Array.isArray(db.promo_banners) ? db.promo_banners : fallback.promo_banners,
        promo_popups: Array.isArray(db.promo_popups) ? db.promo_popups : fallback.promo_popups,
        promo_coupons: Array.isArray(db.promo_coupons) ? db.promo_coupons : fallback.promo_coupons,
        promo_broadcasts: Array.isArray(db.promo_broadcasts) ? db.promo_broadcasts : fallback.promo_broadcasts,
        music_projects: Array.isArray(db.music_projects) ? db.music_projects : fallback.music_projects,
        music_cues: Array.isArray(db.music_cues) ? db.music_cues : fallback.music_cues,
        teaser_projects: Array.isArray(db.teaser_projects) ? db.teaser_projects : fallback.teaser_projects,
        invitation_projects: Array.isArray(db.invitation_projects) ? db.invitation_projects : fallback.invitation_projects,
        photo_selection_sessions: Array.isArray(db.photo_selection_sessions) ? db.photo_selection_sessions : fallback.photo_selection_sessions,
      };
      return merged;
    }
  } catch {
    // ignore
  }
  saveDB(fallback);
  return fallback;
}

export function saveDB(db: MockDB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

export function loadDemoData(): MockDB {
  const current = loadDB();
  const demoSeed = seedDemoDB();
  const mergeLists = <T extends Record<string, any>>(existingList: T[] | undefined, incomingList: T[] | undefined, prefix = 'record'): T[] => {
    const merged = [...(existingList ?? [])];
    const seen = new Set<string>();
    for (const row of merged) {
      const key = resolveRecordIdentity(row);
      if (key) seen.add(key);
    }

    for (const row of incomingList ?? []) {
      const key = resolveRecordIdentity(row);
      if (!key || seen.has(key)) continue;
      const withFlag = {
        ...row,
        id: typeof row.id === 'string' && row.id.startsWith('demo-') ? row.id : demoId(prefix, String(row.id ?? row.booking_no ?? row.order_no ?? row.receipt_no ?? row.client_name ?? 'new')),
        is_demo: true,
        isDemo: true,
      } as T;
      merged.push(withFlag);
      seen.add(key);
    }

    return merged;
  };

  const next: MockDB = {
    ...current,
    studio_settings: current.studio_settings ?? demoSeed.studio_settings,
    bookings: mergeLists(current.bookings, demoSeed.bookings, 'booking'),
    studio_lab_orders: mergeLists(current.studio_lab_orders, demoSeed.studio_lab_orders, 'lab-order'),
    photographer_ledger: mergeLists(current.photographer_ledger, demoSeed.photographer_ledger, 'ledger'),
    ledger_entries: mergeLists(current.ledger_entries, demoSeed.ledger_entries, 'ledger-entry'),
    payments: mergeLists(current.payments, demoSeed.payments, 'payment'),
    partners: mergeLists(current.partners, demoSeed.partners, 'partner'),
    direct_transactions: mergeLists(current.direct_transactions, demoSeed.direct_transactions, 'transaction'),
    booking_notifications: mergeLists(current.booking_notifications, demoSeed.booking_notifications, 'notification'),
    promo_ads: mergeLists(current.promo_ads, demoSeed.promo_ads, 'promo-ad'),
    promo_banners: mergeLists(current.promo_banners, demoSeed.promo_banners, 'promo-banner'),
    promo_popups: mergeLists(current.promo_popups, demoSeed.promo_popups, 'promo-popup'),
    promo_coupons: mergeLists(current.promo_coupons, demoSeed.promo_coupons, 'promo-coupon'),
    promo_broadcasts: mergeLists(current.promo_broadcasts, demoSeed.promo_broadcasts, 'promo-broadcast'),
    music_projects: mergeLists(current.music_projects, demoSeed.music_projects, 'music-project'),
    music_cues: mergeLists(current.music_cues, demoSeed.music_cues, 'music-cue'),
    teaser_projects: mergeLists(current.teaser_projects, demoSeed.teaser_projects, 'teaser-project'),
    invitation_projects: mergeLists(current.invitation_projects, demoSeed.invitation_projects, 'invitation-project'),
    photo_selection_sessions: mergeLists(current.photo_selection_sessions, demoSeed.photo_selection_sessions, 'photo-selection'),
  };

  saveDB(next);
  return next;
}

export function resetDB(): MockDB {
  return loadDemoData();
}

export function wipeDemoData(): MockDB {
  const current = loadDB();
  const next: MockDB = {
    ...current,
    bookings: (current.bookings ?? []).filter((row) => !isDemoRecord(row)),
    studio_lab_orders: (current.studio_lab_orders ?? []).filter((row) => !isDemoRecord(row)),
    photographer_ledger: (current.photographer_ledger ?? []).filter((row) => !isDemoRecord(row)),
    ledger_entries: (current.ledger_entries ?? []).filter((row) => !isDemoRecord(row)),
    payments: (current.payments ?? []).filter((row) => !isDemoRecord(row)),
    partners: (current.partners ?? []).filter((row) => !isDemoRecord(row)),
    direct_transactions: (current.direct_transactions ?? []).filter((row) => !isDemoRecord(row)),
    booking_notifications: (current.booking_notifications ?? []).filter((row) => !isDemoRecord(row)),
    promo_ads: (current.promo_ads ?? []).filter((row) => !isDemoRecord(row)),
    promo_banners: (current.promo_banners ?? []).filter((row) => !isDemoRecord(row)),
    promo_popups: (current.promo_popups ?? []).filter((row) => !isDemoRecord(row)),
    promo_coupons: (current.promo_coupons ?? []).filter((row) => !isDemoRecord(row)),
    promo_broadcasts: (current.promo_broadcasts ?? []).filter((row) => !isDemoRecord(row)),
    music_projects: (current.music_projects ?? []).filter((row) => !isDemoRecord(row)),
    music_cues: (current.music_cues ?? []).filter((row) => !isDemoRecord(row)),
    teaser_projects: (current.teaser_projects ?? []).filter((row) => !isDemoRecord(row)),
    invitation_projects: (current.invitation_projects ?? []).filter((row) => !isDemoRecord(row)),
    photo_selection_sessions: (current.photo_selection_sessions ?? []).filter((row) => !isDemoRecord(row)),
  };
  saveDB(next);
  return next;
}

export function clearAllData(): MockDB {
  const empty: MockDB = {
    studio_settings: [],
    bookings: [],
    studio_lab_orders: [],
    photographer_ledger: [],
    ledger_entries: [],
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
    photo_selection_sessions: [],
  };
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('studio_settings_cache');
    localStorage.removeItem('lab_terms_conditions');
    sessionStorage.removeItem('bup_admin_session');
    sessionStorage.removeItem('bup_client_session');
    sessionStorage.removeItem('bup_partner_session');
  } catch {
    // ignore
  }
  saveDB(empty);
  return empty;
}

export function reloadDB(): MockDB {
  return loadDB();
}

export { uuid, isoNow };

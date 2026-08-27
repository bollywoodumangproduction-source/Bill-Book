export interface StudioSettings {
  id: number;
  films_title: string;
  films_subtitle: string;
  production_title: string;
  production_subtitle: string;
  address: string;
  phone: string;
  email: string;
  films_insta: string;
  production_insta: string;
  bank_name: string;
  bank_details: string;
  whatsapp_number: string;
  alternate_phone?: string;
  branch_address?: string;
  upi_id?: string;
  stamp_image_url: string;
  films_logo_url: string;
  production_logo_url: string;
  production_terms?: string;
  terms_conditions: string;
  master_pin?: string;
}

export interface EventFunction {
  name: string;
  customName?: string;
  date: string;
  time: string;
  start_time?: string;
  end_time?: string;
  end_date_shift?: 'same_date' | 'after_day' | 'next_date';
  venue?: string;
}

export interface BookingPaperRow {
  id: string;
  paper_type: string;
  sheets: string;
  rate: string;
  total: string;
}

export interface BookingAlbumRow {
  id: string;
  album_type: string;
  size: string;
  cover: string;
  cover_rate: string;
  mini_album: boolean;
  mini_qty: string;
  mini_rate: string;
  papers: BookingPaperRow[];
  total: string;
}

export interface BookingVideoRow {
  id: string;
  video_service: string;
  quality: string;
  qty: string;
  rate: string;
  total: string;
}

export interface BookingCustomItem {
  id: string;
  name: string;
  qty: string;
  rate: string;
  amount: string;
}

export interface BookingPaymentDetails {
  payment_mode: string;
  payment_date: string;
  custom_note: string;
  paid_amount: string;
  payment_history?: BookingPaymentInstallment[];
}

export interface BookingPaymentInstallment {
  id: string;
  payment_date: string;
  payment_mode: string;
  custom_note: string;
  paid_amount: string;
}

export interface BookingDeliverables {
  album_rows?: BookingAlbumRow[];
  video_rows?: BookingVideoRow[];
  custom_items?: BookingCustomItem[];
  payment_details?: BookingPaymentDetails;
  raw_video?: boolean;
  raw_selected_photos?: boolean;
  raw_all_photos?: boolean;
  raw_edited_photos?: boolean;
  album_notes?: string;
  video_traditional?: boolean;
  video_highlight?: boolean;
  cinematic_highlight?: boolean;
  cinematic_reel?: boolean;
  cinematic_reel_count?: number;
  cinematic_story?: boolean;
}

export interface Booking {
  id: string;
  booking_no: string;
  client_name: string;
  client_mobile: string;
  client_address: string;
  event_function: string;
  events: EventFunction[];
  shoot_date: string;
  shoot_time: string;
  venue: string;
  booking_status: string;
  base_amount: number;
  total_amount: number;
  discount: number;
  advance_paid: number;
  net_due: number;
  deliverables_data: BookingDeliverables;
  is_login_allowed: boolean;
  client_password: string;
  password_changed: boolean;
  created_at: string;
  archived_at?: string | null;
  deleted_at?: string | null;
}

export interface VideoRow {
  video_type: string;
  quality: string;
  qty: number;
  rate: number;
  total: number;
}

export interface PaperRow {
  id: string;
  paper_type: string;
  sheets: number;
  rate: number;
  total: number;
}

export interface AlbumRow {
  [key: string]: unknown;
  id: string;
  album_type: string;
  size: string;
  packaging?: string;
  packaging_rate: number;
  packaging_total: number;
  mini_album: boolean;
  mini_qty: number;
  mini_rate: number;
  mini_total: number;
  papers: PaperRow[];
  total: number;
}

export interface LabClientRow {
  id: string;
  client_name: string;
  event_address: string;
  video_rows: VideoRow[];
  album_rows: AlbumRow[];
  video_total: number;
  album_total: number;
}

export interface StudioLabOrder {
  id: string;
  order_no: string;
  partner_id: string | null;
  partner_name: string;
  studio_name: string;
  studio_mobile: string;
  studio_address: string;
  project_name: string;
  work_type: string;
  clients: LabClientRow[];
  total_album_bill: number;
  total_video_bill: number;
  current_order_total: number;
  previous_back_due: number;
  master_total: number;
  advance_paid: number;
  net_final_due: number;
  payment_mode: string;
  payment_date: string;
  payment_note: string;
  payment_history?: LabPaymentInstallment[];
  promised_delivery_date?: string;
  order_status: string;
  delivery_mode: string;
  parcel_tracking_details: string;
  video_rows: VideoRow[];
  album_rows: AlbumRow[];
  created_at: string;
  archived_at?: string | null;
  deleted_at?: string | null;
}

export type LedgerEntryType = 'LAB_WORK_DEBIT' | 'SHOOT_DUTY_CREDIT' | 'PAYMENT_SETTLED';

export interface PhotographerLedgerEntry {
  id: string;
  photographer_name: string;
  mobile: string;
  entry_type: LedgerEntryType;
  description: string;
  amount: number;
  payment_mode: string;
  payment_date: string;
  created_at: string;
  deleted_at?: string | null;
}

export type PaymentMode = 'Cash' | 'UPI' | 'Bank';
export type PaymentSource = 'Booking' | 'Lab Order' | 'Photographer';

export interface Payment {
  id: string;
  receipt_no: string;
  source: PaymentSource;
  party_name: string;
  party_mobile: string;
  mode: PaymentMode;
  amount: number;
  date: string;
  note: string;
  created_at: string;
  deleted_at?: string | null;
}

export type PartnerCategory = 'Studio Freelancer' | 'Photographer Freelancer' | 'Other';
export type PartnerStatus = 'Active' | 'On Leave' | 'Inactive' | 'Archived' | 'Trash';

export interface Partner {
  id: string;
  name: string;
  mobile: string;
  studio_name: string;
  studio_address: string;
  category: PartnerCategory;
  status: PartnerStatus;
  note: string;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
  leave_start?: string | null;
  leave_end?: string | null;
}

export interface ShootAssignment {
  id: string;
  booking_id: string;
  partner_id: string;
  function_name: string;
  role: string;
  reporting_time: string;
  created_at: string;
}

export interface LabPaymentInstallment {
  id: string;
  amount: number;
  payment_date: string;
  payment_mode: string;
  note: string;
}

export type DirectTxnType = 'Given' | 'Received';

export interface DirectTransaction {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_mobile: string;
  txn_type: DirectTxnType;
  amount: number;
  payment_mode: string;
  txn_date: string;
  note: string;
  created_at: string;
}

export type PageKey = 'dashboard' | 'bookings' | 'lab' | 'ledger' | 'payments' | 'settings';

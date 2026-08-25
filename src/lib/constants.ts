export const EVENT_FUNCTIONS = [
  'Haldi',
  'Mehndi',
  'Wedding/Barat',
  'Vidai',
  'Reception',
  'Nikah',
  'Walima/Maza',
  'Pre-Wedding',
  'Birthday',
  'Other',
] as const;

export const BOOKING_STATUSES = ['CONFIRMED', 'TENTATIVE', 'COMPLETED'] as const;

export const LAB_VIDEO_TYPES = [
  'Full Traditional Video',
  'Highlight',
  'Teaser',
  'Pre-Wedding',
  'Cinematic',
] as const;

export const LAB_VIDEO_QUALITIES = ['1080p FHD', '4K UHD'] as const;

export const LAB_ALBUM_TYPES = [
  'Karizma',
  'Canvas',
  'Photo Album',
  'Photo Book',
  'Main Wedding Album',
] as const;

export const LAB_ALBUM_COVERS = [
  'Sparkle Cover',
  'Leather Cover',
  'Velvet Cover',
  'Acrylic Cover',
  'Bamboo Box',
  'Normal Box',
  'Bag',
  'Plain',
] as const;

export const LAB_ALBUM_BOXES = [
  'Bamboo Box',
  'Normal Box',
  'Bag',
] as const;

export const LAB_ALBUM_SIZES = ['12x36', '14x40', '12x30', '10x30', '12x24'] as const;

export const LAB_ALBUM_PAPERS = ['Glossy', 'Silk Matte', 'Matt', 'NTR', 'Metallic', 'Transparent', 'Silk'] as const;

export const LAB_ORDER_STATUSES = ['Processing', 'Ready', 'Delivered'] as const;

export const DELIVERY_MODES = ['By Hand', 'Parcel/Courier'] as const;

export const LAB_PAYMENT_MODES = ['Cash', 'UPI / PhonePe / GPay', 'Bank Transfer', 'NetBanking', 'Other'] as const;

export const LEDGER_ENTRY_TYPES = ['LAB_WORK_DEBIT', 'SHOOT_DUTY_CREDIT', 'PAYMENT_SETTLED'] as const;

export const LEDGER_ENTRY_LABELS: Record<string, string> = {
  LAB_WORK_DEBIT: 'Lab Work (Debit)',
  SHOOT_DUTY_CREDIT: 'Shoot Duty (Credit)',
  PAYMENT_SETTLED: 'Payment Settled',
};

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'NetBanking', 'Other'] as const;
export const PAYMENT_SOURCES = ['Booking', 'Lab Order', 'Photographer'] as const;

export const PARTNER_CATEGORIES = ['Studio Freelancer', 'Photographer Freelancer', 'Other'] as const;
export const PARTNER_STATUSES = ['Active', 'Inactive', 'Archived', 'Trash'] as const;
export const DIRECT_TXN_TYPES = ['Given', 'Received'] as const;
export const DIRECT_TXN_MODES = ['Cash', 'UPI', 'Bank Transfer', 'NetBanking', 'Other'] as const;

export const TRASH_RETENTION_DAYS = 90;

export const PARTNER_CATEGORY_LABELS: Record<string, string> = {
  'Studio Freelancer': 'Studio Freelancer',
  'Photographer Freelancer': 'Photographer Freelancer',
  'Other': 'Other',
};

export const REEL_COUNTS = [1, 2, 3, 4, 5] as const;

export const BOOKING_FUNCTION_NAMES = [
  'Haldi',
  'Mehndi',
  'Sangeet',
  'Wedding/Barat',
  'Vidai',
  'Reception',
  'Nikah',
  'Walima',
  'Pre-Wedding',
  'Birthday',
  'Custom',
] as const;

export const BOOKING_ALBUM_TYPES = [
  'Karizma',
  'Canvas',
  'Photo Album',
  'Photo Book',
  'Main Wedding Album',
] as const;

export const BOOKING_ALBUM_SIZES = [
  '12x36',
  '14x40',
  '12x30',
  '10x30',
  '12x24',
] as const;

export const BOOKING_ALBUM_PAPERS = [
  'Glossy',
  'Silk Matte',
  'Matt',
  'NTR',
  'Metallic',
  'Transparent',
  'Silk',
] as const;

export const BOOKING_ALBUM_COVERS = [
  'Sparkle Cover',
  'Leather Cover',
  'Velvet Cover',
  'Acrylic Cover',
  'Bamboo Box',
  'Normal Box',
  'Bag',
  'Plain',
] as const;

export const BOOKING_VIDEO_SERVICES = [
  'Full Traditional Video',
  'Highlight',
  'Teaser',
  'Pre-Wedding',
  'Cinematic',
] as const;

export const BOOKING_VIDEO_FORMATS = ['1080p FHD', '4K UHD'] as const;

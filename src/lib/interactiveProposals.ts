export interface InteractiveProposalEvent {
  name: string;
  coverage: string;
}

export interface InteractivePackageSlide {
  id: string;
  package_name: string;
  price: string;
  badge: string;
  deliverables: string[];
  events: InteractiveProposalEvent[];
  video_urls?: string[];
  /** Backward compatibility for proposals saved before multiple video links. */
  video_embed_url?: string;
  album_pdf_url?: string;
  photo_folder_url?: string;
}

export interface InteractiveSelectedPackage {
  package_id: string;
  package_name: string;
  price: string;
  client_name: string;
  client_phone: string;
  note: string;
  submitted_at: string;
}

export interface InteractiveProposal {
  id: string;
  title: string;
  client_name: string | null;
  client_phone: string | null;
  public_token: string;
  pin: string | null;
  is_locked: boolean;
  status: 'draft' | 'shared' | 'finalized';
  packages_data: InteractivePackageSlide[];
  selected_package: InteractiveSelectedPackage | null;
  created_at: string;
}

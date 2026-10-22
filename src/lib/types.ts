export type Category = "sport" | "music" | "games" | "outdoor" | "make";
export type Visibility = "all" | "accepted";
export type MemberStatus = "requested" | "accepted";

export interface LatLng { lat: number; lng: number }

/** What other people see about someone. */
export interface PublicProfile { display_name: string; avatar_url?: string | null }

export interface MyProfile { display_name: string; avatar_url: string | null; interests: Category[] }

export interface Member {
  user_id: string;
  status: MemberStatus;
  profile?: PublicProfile | null;
}

export interface Pulse {
  id: string;
  host_id: string;
  category: Category;
  title: string;
  need: number;
  starts_at: string;
  ends_at: string;
  visibility: Visibility;
  area_name: string;
  rough_lat: number;
  rough_lng: number;
  created_at: string;
  host?: PublicProfile | null;
  memberships: Member[];
  /** Present only when the server lets this viewer see the exact spot. */
  exact?: { lat: number; lng: number; place_name: string } | null;
  /** Host's contact; present only for the host and accepted people. */
  contact?: Contact | null;
}

export interface Contact { line_id: string | null; phone: string | null; landmark: string | null }
export interface ChatMessage { id: string; pulse_id: string; author_id: string; body: string; created_at: string; author?: PublicProfile | null }

export type PostKind = "update" | "photo" | "checkin";
export interface FeedPost {
  id: string;
  pulse_id: string;
  author_id: string;
  kind: PostKind;
  body: string | null;
  photo_path: string | null;
  created_at: string;
  author?: PublicProfile | null;
  /** demo mode only: an object URL for a photo picked on this device */
  local_photo?: string;
}

export interface NewPulse {
  category: Category;
  title: string;
  need: number;
  startInMin: number;
  durationMin: number;
  visibility: Visibility;
  lat: number;
  lng: number;
  place: string;
  area: string;
  contact: Contact;
}

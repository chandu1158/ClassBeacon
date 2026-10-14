export type UserRole = 'admin' | 'staff' | 'student';

export interface AssignedSection {
  id: number;
  name: string;
  section_code: string;
}

export interface UserProfile {
  id: number;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  department?: string | null;
  year_of_join?: number | null;
  date_of_birth?: string | null;
  address?: string | null;
  beacon_uuid?: string | null;
  active: boolean | number;
  created_at?: string;
  section_id?: number | null;
  section_name?: string | null;
  section_code?: string | null;
  assigned_sections?: AssignedSection[];
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
}

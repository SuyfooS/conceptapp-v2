export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          business_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_ranges: {
        Row: {
          day: string;
          ends_at: string;
          id: string;
          starts_at: string;
          submission_id: string;
        };
        Insert: {
          day: string;
          ends_at: string;
          id?: string;
          starts_at: string;
          submission_id: string;
        };
        Update: {
          day?: string;
          ends_at?: string;
          id?: string;
          starts_at?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_ranges_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "availability_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_submissions: {
        Row: {
          business_id: string;
          id: string;
          note: string | null;
          submitted_at: string;
          updated_at: string;
          user_id: string;
          week_id: string;
        };
        Insert: {
          business_id: string;
          id?: string;
          note?: string | null;
          submitted_at?: string;
          updated_at?: string;
          user_id: string;
          week_id: string;
        };
        Update: {
          business_id?: string;
          id?: string;
          note?: string | null;
          submitted_at?: string;
          updated_at?: string;
          user_id?: string;
          week_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_submissions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_submissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_submissions_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "schedule_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      business_modules: {
        Row: {
          business_id: string;
          enabled: boolean;
          module_key: Database["public"]["Enums"]["module_key"];
          settings: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          enabled?: boolean;
          module_key: Database["public"]["Enums"]["module_key"];
          settings?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          enabled?: boolean;
          module_key?: Database["public"]["Enums"]["module_key"];
          settings?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_modules_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          accent: string;
          address: string | null;
          created_at: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          opening_hours: NonNullable<Json>;
          slug: string;
          template_key: string | null;
          template_version: number | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          accent?: string;
          address?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          opening_hours?: NonNullable<Json>;
          slug: string;
          template_key?: string | null;
          template_version?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          accent?: string;
          address?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          opening_hours?: NonNullable<Json>;
          slug?: string;
          template_key?: string | null;
          template_version?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_template_key_fkey";
            columns: ["template_key"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["key"];
          },
        ];
      };
      invites: {
        Row: {
          business_id: string;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          expires_at: string;
          full_name: string | null;
          id: string;
          invited_by: string | null;
          phone: string;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Insert: {
          business_id: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          expires_at?: string;
          full_name?: string | null;
          id?: string;
          invited_by?: string | null;
          phone: string;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Update: {
          business_id?: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          expires_at?: string;
          full_name?: string | null;
          id?: string;
          invited_by?: string | null;
          phone?: string;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_claimed_by_fkey";
            columns: ["claimed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          id: string;
          perms: string[];
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          id?: string;
          perms?: string[];
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          id?: string;
          perms?: string[];
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_staff: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_staff_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          locale: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          locale?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          locale?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      punch_codes: {
        Row: {
          business_id: string;
          code_hash: string;
          created_at: string;
          expires_at: string;
          issued_by: string | null;
        };
        Insert: {
          business_id: string;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          issued_by?: string | null;
        };
        Update: {
          business_id?: string;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          issued_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "punch_codes_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "punch_codes_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_shifts: {
        Row: {
          business_id: string;
          day: string;
          ends_at: string;
          id: string;
          name: string;
          needed: number;
          pattern_key: string | null;
          starts_at: string;
          week_id: string;
        };
        Insert: {
          business_id: string;
          day: string;
          ends_at: string;
          id?: string;
          name: string;
          needed: number;
          pattern_key?: string | null;
          starts_at: string;
          week_id: string;
        };
        Update: {
          business_id?: string;
          day?: string;
          ends_at?: string;
          id?: string;
          name?: string;
          needed?: number;
          pattern_key?: string | null;
          starts_at?: string;
          week_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_shifts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_shifts_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "schedule_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_weeks: {
        Row: {
          availability_due_at: string;
          business_id: string;
          created_at: string;
          id: string;
          schedule_published_at: string | null;
          schedule_saved_at: string | null;
          starts_on: string;
        };
        Insert: {
          availability_due_at: string;
          business_id: string;
          created_at?: string;
          id?: string;
          schedule_published_at?: string | null;
          schedule_saved_at?: string | null;
          starts_on: string;
        };
        Update: {
          availability_due_at?: string;
          business_id?: string;
          created_at?: string;
          id?: string;
          schedule_published_at?: string | null;
          schedule_saved_at?: string | null;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_weeks_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_assignments: {
        Row: {
          business_id: string;
          position_key: string | null;
          shift_id: string;
          user_id: string;
        };
        Insert: {
          business_id: string;
          position_key?: string | null;
          shift_id: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          position_key?: string | null;
          shift_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_assignments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "schedule_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_swaps: {
        Row: {
          business_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          note: string | null;
          requested_by: string;
          shift_id: string;
          status: Database["public"]["Enums"]["swap_status"];
          taken_at: string | null;
          taken_by: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          requested_by: string;
          shift_id: string;
          status?: Database["public"]["Enums"]["swap_status"];
          taken_at?: string | null;
          taken_by?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          requested_by?: string;
          shift_id?: string;
          status?: Database["public"]["Enums"]["swap_status"];
          taken_at?: string | null;
          taken_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shift_swaps_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "schedule_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_taken_by_fkey";
            columns: ["taken_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          created_at: string;
          definition: NonNullable<Json>;
          key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          definition?: NonNullable<Json>;
          key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          definition?: NonNullable<Json>;
          key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      time_breaks: {
        Row: {
          business_id: string;
          created_at: string;
          ended_at: string | null;
          entry_id: string;
          id: string;
          started_at: string;
          unpaid: boolean;
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          ended_at?: string | null;
          entry_id: string;
          id?: string;
          started_at: string;
          unpaid: boolean;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          ended_at?: string | null;
          entry_id?: string;
          id?: string;
          started_at?: string;
          unpaid?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_breaks_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_breaks_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "time_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_breaks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          business_id: string;
          clock_in: string;
          clock_out: string | null;
          created_at: string;
          edited_at: string | null;
          edited_by: string | null;
          id: string;
          note: string | null;
          source: Database["public"]["Enums"]["time_entry_source"];
          user_id: string;
        };
        Insert: {
          business_id: string;
          clock_in: string;
          clock_out?: string | null;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          id?: string;
          note?: string | null;
          source?: Database["public"]["Enums"]["time_entry_source"];
          user_id: string;
        };
        Update: {
          business_id?: string;
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          id?: string;
          note?: string | null;
          source?: Database["public"]["Enums"]["time_entry_source"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_edited_by_fkey";
            columns: ["edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      view_sessions: {
        Row: {
          business_id: string;
          ended_at: string | null;
          expires_at: string;
          id: string;
          role: Database["public"]["Enums"]["member_role"];
          staff_id: string;
          started_at: string;
        };
        Insert: {
          business_id: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["member_role"];
          staff_id: string;
          started_at?: string;
        };
        Update: {
          business_id?: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          staff_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "view_sessions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "view_sessions_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "platform_staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_time_entry: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          new_clock_in: string;
          new_clock_out: string;
          note?: string;
          person: string;
        };
        Returns: string;
      };
      admin_business: { Args: { business_slug: string }; Returns: Json };
      admin_businesses: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accent: string;
          created_at: string;
          id: string;
          members: number;
          name: string;
          open_invites: number;
          slug: string;
          template_key: string;
        }[];
      };
      apply_template: {
        Args: { business: string; template: string };
        Returns: undefined;
      };
      cancel_shift_swap: {
        Args: { actor: string; swap: string };
        Returns: undefined;
      };
      claim_invite: {
        Args: { claimant: string; token_hash: string };
        Returns: string;
      };
      clock_in: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          code_hash?: string;
        };
        Returns: string;
      };
      clock_out: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          code_hash?: string;
        };
        Returns: string;
      };
      correct_time_entry: {
        Args: {
          actor: string;
          at_time?: string;
          entry: string;
          new_clock_in: string;
          new_clock_out?: string;
          note?: string;
        };
        Returns: undefined;
      };
      create_business: {
        Args: {
          accent: string;
          actor: string;
          address: string;
          name: string;
          slug: string;
          staff?: Json;
          template: string;
        };
        Returns: string;
      };
      decide_shift_swap: {
        Args: {
          actor: string;
          approve: boolean;
          at_time?: string;
          swap: string;
        };
        Returns: Database["public"]["Enums"]["swap_status"];
      };
      end_break: {
        Args: { actor: string; at_time?: string; business: string };
        Returns: string;
      };
      end_view_session: { Args: { actor: string }; Returns: string };
      invite_by_token: { Args: { token_hash: string }; Returns: Json };
      issue_invite_link: {
        Args: { actor: string; invite: string; new_token_hash: string };
        Returns: string;
      };
      issue_punch_code: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          code_hash: string;
        };
        Returns: string;
      };
      open_schedule_week: {
        Args: { business: string; due_at: string; week_start: string };
        Returns: string;
      };
      publish_week_schedule: {
        Args: { actor: string; shifts: Json; week: string };
        Returns: number;
      };
      request_shift_swap: {
        Args: { actor: string; at_time?: string; note?: string; shift: string };
        Returns: string;
      };
      save_week_schedule: {
        Args: { actor: string; shifts: Json; week: string };
        Returns: number;
      };
      set_clock_settings: {
        Args: { actor: string; business: string; unpaid_breaks: boolean };
        Returns: undefined;
      };
      start_break: {
        Args: { actor: string; at_time?: string; business: string };
        Returns: string;
      };
      start_view_session: {
        Args: {
          actor: string;
          business: string;
          view_role: Database["public"]["Enums"]["member_role"];
        };
        Returns: string;
      };
      submit_availability: {
        Args: { actor: string; note?: string; ranges: Json; week: string };
        Returns: string;
      };
      take_shift_swap: {
        Args: { actor: string; at_time?: string; swap: string };
        Returns: undefined;
      };
      team_invite: {
        Args: {
          actor: string;
          business: string;
          invite_name: string;
          invite_phone: string;
          invite_role: Database["public"]["Enums"]["member_role"];
          new_token_hash: string;
        };
        Returns: string;
      };
      team_invite_link: {
        Args: { actor: string; invite: string; new_token_hash: string };
        Returns: string;
      };
      undo_clock_out: {
        Args: { actor: string; at_time?: string; entry: string };
        Returns: undefined;
      };
    };
    Enums: {
      member_role: "owner" | "manager" | "worker";
      module_key:
        | "scheduling"
        | "time_clock"
        | "reservations"
        | "storefront"
        | "notifications";
      platform_role: "platform_admin" | "onboarder";
      swap_status: "open" | "taken" | "approved" | "declined" | "cancelled";
      time_entry_source: "punch" | "manager";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      member_role: ["owner", "manager", "worker"],
      module_key: [
        "scheduling",
        "time_clock",
        "reservations",
        "storefront",
        "notifications",
      ],
      platform_role: ["platform_admin", "onboarder"],
      swap_status: ["open", "taken", "approved", "declined", "cancelled"],
      time_entry_source: ["punch", "manager"],
    },
  },
} as const;

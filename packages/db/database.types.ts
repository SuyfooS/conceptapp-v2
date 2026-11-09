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
      business_wording: {
        Row: {
          base_sentence: string;
          business_id: string;
          key: string;
          sentence: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          base_sentence: string;
          business_id: string;
          key: string;
          sentence: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_sentence?: string;
          business_id?: string;
          key?: string;
          sentence?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_wording_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_wording_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          shabbat_city: string | null;
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
          shabbat_city?: string | null;
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
          shabbat_city?: string | null;
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
      clock_stations: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          last_seen_at: string | null;
          name: string;
          stopped_at: string | null;
          stopped_by: string | null;
          token_hash: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last_seen_at?: string | null;
          name: string;
          stopped_at?: string | null;
          stopped_by?: string | null;
          token_hash: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last_seen_at?: string | null;
          name?: string;
          stopped_at?: string | null;
          stopped_by?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clock_stations_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clock_stations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clock_stations_stopped_by_fkey";
            columns: ["stopped_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      department_members: {
        Row: {
          added_at: string;
          business_id: string;
          department_id: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          business_id: string;
          department_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          business_id?: string;
          department_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_members_business_id_user_id_fkey";
            columns: ["business_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["business_id", "user_id"];
          },
          {
            foreignKeyName: "department_members_department_id_business_id_fkey";
            columns: ["department_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      departments: {
        Row: {
          archived_at: string | null;
          business_id: string;
          created_at: string;
          id: string;
          key: string;
          name: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          business_id: string;
          created_at?: string;
          id?: string;
          key: string;
          name: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          business_id?: string;
          created_at?: string;
          id?: string;
          key?: string;
          name?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
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
      list_items: {
        Row: {
          answer: string | null;
          business_id: string;
          checked: boolean | null;
          comment: string | null;
          done: boolean;
          done_at: string | null;
          done_by: string | null;
          given: number | null;
          hint: string | null;
          id: string;
          kind: string;
          label: string;
          list_id: string;
          max_value: number | null;
          min_value: number | null;
          photo_path: string | null;
          position: number;
          reading: number | null;
          requested: number | null;
          required: boolean;
          template_item_id: string | null;
          unit: string | null;
        };
        Insert: {
          answer?: string | null;
          business_id: string;
          checked?: boolean | null;
          comment?: string | null;
          done?: boolean;
          done_at?: string | null;
          done_by?: string | null;
          given?: number | null;
          hint?: string | null;
          id?: string;
          kind: string;
          label: string;
          list_id: string;
          max_value?: number | null;
          min_value?: number | null;
          photo_path?: string | null;
          position: number;
          reading?: number | null;
          requested?: number | null;
          required?: boolean;
          template_item_id?: string | null;
          unit?: string | null;
        };
        Update: {
          answer?: string | null;
          business_id?: string;
          checked?: boolean | null;
          comment?: string | null;
          done?: boolean;
          done_at?: string | null;
          done_by?: string | null;
          given?: number | null;
          hint?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          list_id?: string;
          max_value?: number | null;
          min_value?: number | null;
          photo_path?: string | null;
          position?: number;
          reading?: number | null;
          requested?: number | null;
          required?: boolean;
          template_item_id?: string | null;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "list_items_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_list_id_business_id_fkey";
            columns: ["list_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_items_template_item_id_business_id_fkey";
            columns: ["template_item_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "list_template_items";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      list_passes: {
        Row: {
          business_id: string;
          from_department: string | null;
          id: string;
          list_id: string;
          note: string | null;
          passed_at: string;
          passed_by: string | null;
          to_department: string;
        };
        Insert: {
          business_id: string;
          from_department?: string | null;
          id?: string;
          list_id: string;
          note?: string | null;
          passed_at?: string;
          passed_by?: string | null;
          to_department: string;
        };
        Update: {
          business_id?: string;
          from_department?: string | null;
          id?: string;
          list_id?: string;
          note?: string | null;
          passed_at?: string;
          passed_by?: string | null;
          to_department?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_passes_from_department_business_id_fkey";
            columns: ["from_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_passes_list_id_business_id_fkey";
            columns: ["list_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_passes_passed_by_fkey";
            columns: ["passed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_passes_to_department_business_id_fkey";
            columns: ["to_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      list_people: {
        Row: {
          business_id: string;
          list_id: string;
          user_id: string;
        };
        Insert: {
          business_id: string;
          list_id: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          list_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_people_business_id_user_id_fkey";
            columns: ["business_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["business_id", "user_id"];
          },
          {
            foreignKeyName: "list_people_list_id_business_id_fkey";
            columns: ["list_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      list_schedules: {
        Row: {
          active: boolean;
          anchor: string;
          business_id: string;
          created_at: string;
          days: number[];
          due_offset: number;
          id: string;
          opens_offset: number;
          position: number;
          recipient_department: string | null;
          recipient_kind: string;
          recipient_role: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift: string | null;
          recipient_user: string | null;
          shift_key: string | null;
          starts_on: string;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          anchor?: string;
          business_id: string;
          created_at?: string;
          days: number[];
          due_offset: number;
          id?: string;
          opens_offset: number;
          position?: number;
          recipient_department?: string | null;
          recipient_kind: string;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift?: string | null;
          recipient_user?: string | null;
          shift_key?: string | null;
          starts_on: string;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          anchor?: string;
          business_id?: string;
          created_at?: string;
          days?: number[];
          due_offset?: number;
          id?: string;
          opens_offset?: number;
          position?: number;
          recipient_department?: string | null;
          recipient_kind?: string;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift?: string | null;
          recipient_user?: string | null;
          shift_key?: string | null;
          starts_on?: string;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_schedules_business_id_recipient_user_fkey";
            columns: ["business_id", "recipient_user"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["business_id", "user_id"];
          },
          {
            foreignKeyName: "list_schedules_recipient_department_business_id_fkey";
            columns: ["recipient_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_schedules_template_id_business_id_fkey";
            columns: ["template_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "list_templates";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      list_template_items: {
        Row: {
          business_id: string;
          default_quantity: number | null;
          hint: string | null;
          id: string;
          kind: string;
          label: string;
          max_value: number | null;
          min_value: number | null;
          position: number;
          required: boolean;
          template_id: string;
          unit: string | null;
        };
        Insert: {
          business_id: string;
          default_quantity?: number | null;
          hint?: string | null;
          id?: string;
          kind: string;
          label: string;
          max_value?: number | null;
          min_value?: number | null;
          position: number;
          required?: boolean;
          template_id: string;
          unit?: string | null;
        };
        Update: {
          business_id?: string;
          default_quantity?: number | null;
          hint?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          max_value?: number | null;
          min_value?: number | null;
          position?: number;
          required?: boolean;
          template_id?: string;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "list_template_items_template_id_business_id_fkey";
            columns: ["template_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "list_templates";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      list_templates: {
        Row: {
          archived_at: string | null;
          asks_quantities: boolean;
          business_id: string;
          created_at: string;
          created_by: string | null;
          from_department: string | null;
          id: string;
          key: string | null;
          name: string;
          note: string | null;
          position: number;
          recipient_department: string | null;
          recipient_kind: string | null;
          recipient_role: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          asks_quantities?: boolean;
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          from_department?: string | null;
          id?: string;
          key?: string | null;
          name: string;
          note?: string | null;
          position?: number;
          recipient_department?: string | null;
          recipient_kind?: string | null;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          asks_quantities?: boolean;
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          from_department?: string | null;
          id?: string;
          key?: string | null;
          name?: string;
          note?: string | null;
          position?: number;
          recipient_department?: string | null;
          recipient_kind?: string | null;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          recipient_shift?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "list_templates_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_templates_from_department_business_id_fkey";
            columns: ["from_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_templates_recipient_department_business_id_fkey";
            columns: ["recipient_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "list_templates_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lists: {
        Row: {
          asks_quantities: boolean;
          business_id: string;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          due_at: string | null;
          finished_at: string | null;
          finished_by: string | null;
          from_department: string | null;
          id: string;
          late_at: string | null;
          name: string;
          note: string | null;
          occurs_on: string | null;
          opens_at: string;
          origin: string;
          recipient_department: string | null;
          recipient_kind: string;
          recipient_role: Database["public"]["Enums"]["member_role"] | null;
          reminded_at: string | null;
          schedule_id: string | null;
          sent_by: string | null;
          shift: Json | null;
          shift_id: string | null;
          status: string;
          template_id: string | null;
          updated_at: string;
        };
        Insert: {
          asks_quantities?: boolean;
          business_id: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          due_at?: string | null;
          finished_at?: string | null;
          finished_by?: string | null;
          from_department?: string | null;
          id?: string;
          late_at?: string | null;
          name: string;
          note?: string | null;
          occurs_on?: string | null;
          opens_at: string;
          origin: string;
          recipient_department?: string | null;
          recipient_kind: string;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          reminded_at?: string | null;
          schedule_id?: string | null;
          sent_by?: string | null;
          shift?: Json | null;
          shift_id?: string | null;
          status?: string;
          template_id?: string | null;
          updated_at?: string;
        };
        Update: {
          asks_quantities?: boolean;
          business_id?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          due_at?: string | null;
          finished_at?: string | null;
          finished_by?: string | null;
          from_department?: string | null;
          id?: string;
          late_at?: string | null;
          name?: string;
          note?: string | null;
          occurs_on?: string | null;
          opens_at?: string;
          origin?: string;
          recipient_department?: string | null;
          recipient_kind?: string;
          recipient_role?: Database["public"]["Enums"]["member_role"] | null;
          reminded_at?: string | null;
          schedule_id?: string | null;
          sent_by?: string | null;
          shift?: Json | null;
          shift_id?: string | null;
          status?: string;
          template_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lists_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lists_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lists_finished_by_fkey";
            columns: ["finished_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lists_from_department_business_id_fkey";
            columns: ["from_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "lists_recipient_department_business_id_fkey";
            columns: ["recipient_department", "business_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "lists_schedule_id_business_id_fkey";
            columns: ["schedule_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "list_schedules";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "lists_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lists_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "schedule_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lists_template_id_business_id_fkey";
            columns: ["template_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "list_templates";
            referencedColumns: ["id", "business_id"];
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
      notifications: {
        Row: {
          actor_id: string | null;
          audience_role: Database["public"]["Enums"]["member_role"];
          business_id: string;
          created_at: string;
          dedupe_key: string | null;
          id: string;
          kind: string;
          params: NonNullable<Json>;
          push_after: string | null;
          push_attempts: number;
          push_before: string | null;
          push_state: string;
          pushed_at: string | null;
          read_at: string | null;
          resolved_at: string | null;
          source_module: Database["public"]["Enums"]["module_key"] | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          audience_role?: Database["public"]["Enums"]["member_role"];
          business_id: string;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          kind: string;
          params?: NonNullable<Json>;
          push_after?: string | null;
          push_attempts?: number;
          push_before?: string | null;
          push_state?: string;
          pushed_at?: string | null;
          read_at?: string | null;
          resolved_at?: string | null;
          source_module?: Database["public"]["Enums"]["module_key"] | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          audience_role?: Database["public"]["Enums"]["member_role"];
          business_id?: string;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          kind?: string;
          params?: NonNullable<Json>;
          push_after?: string | null;
          push_attempts?: number;
          push_before?: string | null;
          push_state?: string;
          pushed_at?: string | null;
          read_at?: string | null;
          resolved_at?: string | null;
          source_module?: Database["public"]["Enums"]["module_key"] | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
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
          address_form: string | null;
          avatar_path: string | null;
          bio: string | null;
          cover: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          locale: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address_form?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          cover?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          locale?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address_form?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          cover?: string | null;
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
          short_hash: string | null;
          station_id: string | null;
        };
        Insert: {
          business_id: string;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          issued_by?: string | null;
          short_hash?: string | null;
          station_id?: string | null;
        };
        Update: {
          business_id?: string;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          issued_by?: string | null;
          short_hash?: string | null;
          station_id?: string | null;
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
          {
            foreignKeyName: "punch_codes_station_id_fkey";
            columns: ["station_id"];
            isOneToOne: false;
            referencedRelation: "clock_stations";
            referencedColumns: ["id"];
          },
        ];
      };
      push_deliveries: {
        Row: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          device_id: string;
          id: string;
          next_at: string;
          notification_id: string;
          sent_at: string | null;
          state: string;
        };
        Insert: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          device_id: string;
          id?: string;
          next_at: string;
          notification_id: string;
          sent_at?: string | null;
          state?: string;
        };
        Update: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          device_id?: string;
          id?: string;
          next_at?: string;
          notification_id?: string;
          sent_at?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_deliveries_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "push_subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_deliveries_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth_secret: string;
          created_at: string;
          endpoint: string;
          endpoint_hash: string;
          failing_since: string | null;
          failures: number;
          id: string;
          label: string | null;
          last_fetched_at: string | null;
          last_seen_at: string;
          last_success_at: string | null;
          p256dh: string;
          signed_out: number;
          user_id: string;
        };
        Insert: {
          auth_secret: string;
          created_at?: string;
          endpoint: string;
          endpoint_hash: string;
          failing_since?: string | null;
          failures?: number;
          id?: string;
          label?: string | null;
          last_fetched_at?: string | null;
          last_seen_at?: string;
          last_success_at?: string | null;
          p256dh: string;
          signed_out?: number;
          user_id: string;
        };
        Update: {
          auth_secret?: string;
          created_at?: string;
          endpoint?: string;
          endpoint_hash?: string;
          failing_since?: string | null;
          failures?: number;
          id?: string;
          label?: string | null;
          last_fetched_at?: string | null;
          last_seen_at?: string;
          last_success_at?: string | null;
          p256dh?: string;
          signed_out?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
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
      template_wording: {
        Row: {
          base_sentence: string;
          key: string;
          sentence: string;
          template_key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          base_sentence: string;
          key: string;
          sentence: string;
          template_key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_sentence?: string;
          key?: string;
          sentence?: string;
          template_key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "template_wording_template_key_fkey";
            columns: ["template_key"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "template_wording_updated_by_fkey";
            columns: ["updated_by"];
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
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          edited_at: string | null;
          edited_by: string | null;
          id: string;
          in_proof: string | null;
          in_station: string | null;
          note: string | null;
          out_proof: string | null;
          out_station: string | null;
          source: Database["public"]["Enums"]["time_entry_source"];
          user_id: string;
        };
        Insert: {
          business_id: string;
          clock_in: string;
          clock_out?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          id?: string;
          in_proof?: string | null;
          in_station?: string | null;
          note?: string | null;
          out_proof?: string | null;
          out_station?: string | null;
          source?: Database["public"]["Enums"]["time_entry_source"];
          user_id: string;
        };
        Update: {
          business_id?: string;
          clock_in?: string;
          clock_out?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          id?: string;
          in_proof?: string | null;
          in_station?: string | null;
          note?: string | null;
          out_proof?: string | null;
          out_station?: string | null;
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
            foreignKeyName: "time_entries_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
            foreignKeyName: "time_entries_in_station_fkey";
            columns: ["in_station"];
            isOneToOne: false;
            referencedRelation: "clock_stations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_out_station_fkey";
            columns: ["out_station"];
            isOneToOne: false;
            referencedRelation: "clock_stations";
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
          expired_invites: number;
          id: string;
          members: number;
          name: string;
          open_invites: number;
          slug: string;
          template_key: string;
        }[];
      };
      admin_invite: {
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
      apply_template: {
        Args: { business: string; template: string };
        Returns: undefined;
      };
      approve_station_pairing: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          name: string;
          pairing_hash?: string;
          short_hash?: string;
        };
        Returns: string;
      };
      archive_list_template: {
        Args: { actor: string; template: string };
        Returns: undefined;
      };
      cancel_list: {
        Args: { actor: string; at_time?: string; list: string };
        Returns: undefined;
      };
      cancel_shift_swap: {
        Args: { actor: string; swap: string };
        Returns: undefined;
      };
      cancel_unstarted_list: {
        Args: { actor: string; at_time?: string; list: string };
        Returns: undefined;
      };
      claim_due_pushes: {
        Args: { at_time?: string; max_rows?: number };
        Returns: {
          delivery: string;
          device: string;
          notification: string;
          push_endpoint: string;
          valid_until: string;
          what: string;
        }[];
      };
      claim_invite: {
        Args: { claimant: string; token_hash: string };
        Returns: string;
      };
      clear_profile_bio: {
        Args: { actor: string; business: string; person: string; seen: string };
        Returns: undefined;
      };
      clock_in: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          code_hash?: string;
          short_hash?: string;
          without_code?: boolean;
        };
        Returns: string;
      };
      clock_out: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          code_hash?: string;
          short_hash?: string;
          without_code?: boolean;
        };
        Returns: string;
      };
      confirm_time_entry: {
        Args: { actor: string; at_time?: string; entry: string };
        Returns: undefined;
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
      finish_list: {
        Args: { actor: string; at_time?: string; list: string };
        Returns: undefined;
      };
      finish_pushes: {
        Args: { at_time?: string; outcomes: Json };
        Returns: undefined;
      };
      forget_auth_attempt: {
        Args: { at_time: string; caller: string; kind: string; phone: string };
        Returns: undefined;
      };
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
          short_hash?: string;
        };
        Returns: string;
      };
      issue_station_code: {
        Args: {
          at_time?: string;
          code_hash: string;
          short_hash: string;
          token_hash: string;
        };
        Returns: Json;
      };
      keeps_demo_profile: { Args: { person: string }; Returns: boolean };
      my_open_lists: {
        Args: { actor: string; business: string };
        Returns: number;
      };
      note_auth_attempt: {
        Args: { at_time?: string; caller: string; kind: string; phone: string };
        Returns: number;
      };
      note_punch_attempt: {
        Args: {
          actor: string;
          at_time?: string;
          business: string;
          short_hash: string;
        };
        Returns: boolean;
      };
      note_push_fetch: {
        Args: { actor: string; at_time?: string; push_endpoint?: string };
        Returns: {
          business: string;
          since: string;
        }[];
      };
      note_push_signed_out: {
        Args: { push_endpoint: string };
        Returns: undefined;
      };
      open_schedule_week: {
        Args: { business: string; due_at: string; week_start: string };
        Returns: string;
      };
      own_phone: { Args: Record<PropertyKey, never>; Returns: string };
      publish_week_schedule: {
        Args: { actor: string; shifts: Json; week: string };
        Returns: number;
      };
      punch_code_showing: {
        Args: { actor: string; at_time?: string; business: string };
        Returns: boolean;
      };
      push_allowed: { Args: { person: string }; Returns: boolean };
      read_notifications: {
        Args: { actor: string; business: string; ids?: string[] };
        Returns: number;
      };
      remove_push_subscription: {
        Args: { actor: string; device?: string; push_endpoint?: string };
        Returns: boolean;
      };
      renew_demo_schedules: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      reopen_list: {
        Args: { actor: string; at_time?: string; list: string };
        Returns: undefined;
      };
      request_shift_swap: {
        Args: { actor: string; at_time?: string; note?: string; shift: string };
        Returns: string;
      };
      reset_demo_business: { Args: { business: string }; Returns: undefined };
      reset_demo_businesses: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      restore_list_template: {
        Args: { actor: string; template: string };
        Returns: undefined;
      };
      save_list_template: {
        Args: {
          actor: string;
          business: string;
          seen_version?: number;
          template: Json;
        };
        Returns: Json;
      };
      save_push_subscription: {
        Args: {
          actor: string;
          at_time?: string;
          device_label?: string;
          key_auth: string;
          key_p256dh: string;
          push_endpoint: string;
        };
        Returns: string;
      };
      save_week_schedule: {
        Args: { actor: string; shifts: Json; week: string };
        Returns: number;
      };
      send_list: {
        Args: { actor: string; at_time?: string; business: string; list: Json };
        Returns: string;
      };
      send_test_push: {
        Args: { actor: string; at_time?: string };
        Returns: boolean;
      };
      set_business_details: {
        Args: { actor: string; business: string; patch: Json };
        Returns: undefined;
      };
      set_business_wording: {
        Args: {
          actor: string;
          base: string;
          business: string;
          new_sentence: string;
          word_key: string;
        };
        Returns: string;
      };
      set_clock_station_stopped: {
        Args: {
          actor: string;
          at_time?: string;
          station: string;
          stopped: boolean;
        };
        Returns: undefined;
      };
      set_department_members: {
        Args: {
          actor: string;
          business: string;
          department: string;
          members: string[];
        };
        Returns: undefined;
      };
      set_departments: {
        Args: { actor: string; business: string; departments: Json };
        Returns: undefined;
      };
      set_list_item: {
        Args: { actor: string; at_time?: string; item: string; result: Json };
        Returns: Json;
      };
      set_module_enabled: {
        Args: {
          actor: string;
          business: string;
          enabled: boolean;
          module: Database["public"]["Enums"]["module_key"];
        };
        Returns: undefined;
      };
      set_module_settings: {
        Args: {
          actor: string;
          business: string;
          module: Database["public"]["Enums"]["module_key"];
          patch: Json;
        };
        Returns: undefined;
      };
      set_own_profile: {
        Args: { actor: string; patch: Json };
        Returns: undefined;
      };
      set_template_wording: {
        Args: {
          actor: string;
          base: string;
          new_sentence: string;
          template: string;
          word_key: string;
        };
        Returns: string;
      };
      start_break: {
        Args: { actor: string; at_time?: string; business: string };
        Returns: string;
      };
      start_station_pairing: {
        Args: {
          at_time?: string;
          pairing_hash: string;
          short_hash: string;
          token_hash: string;
        };
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
      station_by_token: { Args: { token_hash: string }; Returns: Json };
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
      team_phones: {
        Args: { business: string };
        Returns: {
          phone: string;
          user_id: string;
        }[];
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
        | "notifications"
        | "lists";
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
        "lists",
      ],
      platform_role: ["platform_admin", "onboarder"],
      swap_status: ["open", "taken", "approved", "declined", "cancelled"],
      time_entry_source: ["punch", "manager"],
    },
  },
} as const;

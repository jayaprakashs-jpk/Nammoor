export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string
          family_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id: string
          family_id: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string
          family_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_path: string | null
          body: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reply_to: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          attachment_path?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to?: string | null
          room_id: string
          sender_id?: string
        }
        Update: {
          attachment_path?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          joined_at: string
          last_read_at: string | null
          muted: boolean
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          kind: Database["public"]["Enums"]["chat_room_kind_t"]
          last_message_at: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          kind?: Database["public"]["Enums"]["chat_room_kind_t"]
          last_message_at?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["chat_room_kind_t"]
          last_message_at?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          native_place: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          native_place?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          native_place?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_invites: {
        Row: {
          claim_person_id: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          family_id: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: Database["public"]["Enums"]["family_role_t"]
          token_hash: string
          use_count: number
        }
        Insert: {
          claim_person_id?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          family_id: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["family_role_t"]
          token_hash: string
          use_count?: number
        }
        Update: {
          claim_person_id?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          family_id?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["family_role_t"]
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invites_family_id_claim_person_id_fkey"
            columns: ["family_id", "claim_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          family_id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["family_role_t"]
          user_id: string
        }
        Insert: {
          family_id: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["family_role_t"]
          user_id: string
        }
        Update: {
          family_id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["family_role_t"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_attempts: {
        Row: {
          at: string
          id: number
          user_id: string
        }
        Insert: {
          at?: string
          id?: never
          user_id: string
        }
        Update: {
          at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      parent_child: {
        Row: {
          child_id: string
          created_at: string
          created_by: string | null
          family_id: string
          kind: Database["public"]["Enums"]["parent_kind_t"]
          parent_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          created_by?: string | null
          family_id: string
          kind?: Database["public"]["Enums"]["parent_kind_t"]
          parent_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string | null
          family_id?: string
          kind?: Database["public"]["Enums"]["parent_kind_t"]
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_child_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_child_family_id_child_id_fkey"
            columns: ["family_id", "child_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "parent_child_family_id_parent_id_fkey"
            columns: ["family_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      person_contact: {
        Row: {
          address_line: string | null
          email: string | null
          family_id: string
          person_id: string
          phone: string | null
          postal_code: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility_t"]
        }
        Insert: {
          address_line?: string | null
          email?: string | null
          family_id: string
          person_id: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_t"]
        }
        Update: {
          address_line?: string | null
          email?: string | null
          family_id?: string
          person_id?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_t"]
        }
        Relationships: [
          {
            foreignKeyName: "person_contact_family_id_person_id_fkey"
            columns: ["family_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      person_education: {
        Row: {
          course: string | null
          created_at: string
          family_id: string
          id: string
          institution: string | null
          level: string
          person_id: string
          year_completed: number | null
        }
        Insert: {
          course?: string | null
          created_at?: string
          family_id: string
          id?: string
          institution?: string | null
          level: string
          person_id: string
          year_completed?: number | null
        }
        Update: {
          course?: string | null
          created_at?: string
          family_id?: string
          id?: string
          institution?: string | null
          level?: string
          person_id?: string
          year_completed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "person_education_family_id_person_id_fkey"
            columns: ["family_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      person_merge_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          drop_person_id: string | null
          drop_snapshot: Json | null
          family_id: string
          id: string
          keep_person_id: string | null
          note: string | null
          requested_by: string
          status: Database["public"]["Enums"]["merge_status_t"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          drop_person_id?: string | null
          drop_snapshot?: Json | null
          family_id: string
          id?: string
          keep_person_id?: string | null
          note?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["merge_status_t"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          drop_person_id?: string | null
          drop_snapshot?: Json | null
          family_id?: string
          id?: string
          keep_person_id?: string | null
          note?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["merge_status_t"]
        }
        Relationships: [
          {
            foreignKeyName: "person_merge_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_merge_requests_family_id_drop_person_id_fkey"
            columns: ["family_id", "drop_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "person_merge_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_merge_requests_family_id_keep_person_id_fkey"
            columns: ["family_id", "keep_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "person_merge_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_occupations: {
        Row: {
          city: string | null
          created_at: string
          end_year: number | null
          family_id: string
          id: string
          is_current: boolean
          organization: string | null
          person_id: string
          start_year: number | null
          title: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          end_year?: number | null
          family_id: string
          id?: string
          is_current?: boolean
          organization?: string | null
          person_id: string
          start_year?: number | null
          title: string
        }
        Update: {
          city?: string | null
          created_at?: string
          end_year?: number | null
          family_id?: string
          id?: string
          is_current?: boolean
          organization?: string | null
          person_id?: string
          start_year?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_occupations_family_id_person_id_fkey"
            columns: ["family_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      person_private_fields: {
        Row: {
          family_id: string
          field: Database["public"]["Enums"]["private_field_t"]
          person_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          family_id: string
          field: Database["public"]["Enums"]["private_field_t"]
          person_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          family_id?: string
          field?: Database["public"]["Enums"]["private_field_t"]
          person_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "person_private_fields_family_id_person_id_fkey"
            columns: ["family_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      persons: {
        Row: {
          birth_date: string | null
          birth_order: number | null
          birth_place: string | null
          birth_precision: Database["public"]["Enums"]["date_precision_t"]
          birth_time: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          current_city: string | null
          death_date: string | null
          death_precision: Database["public"]["Enums"]["date_precision_t"]
          family_id: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_t"]
          history: string | null
          id: string
          initials: string | null
          is_living: boolean
          managed_by: string | null
          name_native: string | null
          native_place: string | null
          nickname: string | null
          photo_path: string | null
          state_code: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          birth_order?: number | null
          birth_place?: string | null
          birth_precision?: Database["public"]["Enums"]["date_precision_t"]
          birth_time?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          current_city?: string | null
          death_date?: string | null
          death_precision?: Database["public"]["Enums"]["date_precision_t"]
          family_id: string
          full_name: string
          gender?: Database["public"]["Enums"]["gender_t"]
          history?: string | null
          id?: string
          initials?: string | null
          is_living?: boolean
          managed_by?: string | null
          name_native?: string | null
          native_place?: string | null
          nickname?: string | null
          photo_path?: string | null
          state_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          birth_order?: number | null
          birth_place?: string | null
          birth_precision?: Database["public"]["Enums"]["date_precision_t"]
          birth_time?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          current_city?: string | null
          death_date?: string | null
          death_precision?: Database["public"]["Enums"]["date_precision_t"]
          family_id?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_t"]
          history?: string | null
          id?: string
          initials?: string | null
          is_living?: boolean
          managed_by?: string | null
          name_native?: string | null
          native_place?: string | null
          nickname?: string | null
          photo_path?: string | null
          state_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_managed_by_fkey"
            columns: ["managed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      private_field_grants: {
        Row: {
          created_at: string
          family_id: string
          field: Database["public"]["Enums"]["private_field_t"]
          granted_by: string
          grantee_id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          field: Database["public"]["Enums"]["private_field_t"]
          granted_by?: string
          grantee_id: string
          person_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          field?: Database["public"]["Enums"]["private_field_t"]
          granted_by?: string
          grantee_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_field_grants_family_id_person_id_fkey"
            columns: ["family_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "private_field_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_field_grants_grantee_id_fkey"
            columns: ["grantee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          phone: string | null
          relation_style: Database["public"]["Enums"]["relation_style_t"]
          ui_language: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id: string
          phone?: string | null
          relation_style?: Database["public"]["Enums"]["relation_style_t"]
          ui_language?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          phone?: string | null
          relation_style?: Database["public"]["Enums"]["relation_style_t"]
          ui_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      unions: {
        Row: {
          created_at: string
          created_by: string | null
          end_reason: Database["public"]["Enums"]["union_end_t"] | null
          ended_on: string | null
          family_id: string
          id: string
          married_on: string | null
          married_precision: Database["public"]["Enums"]["date_precision_t"]
          partner_a: string
          partner_b: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_reason?: Database["public"]["Enums"]["union_end_t"] | null
          ended_on?: string | null
          family_id: string
          id?: string
          married_on?: string | null
          married_precision?: Database["public"]["Enums"]["date_precision_t"]
          partner_a: string
          partner_b: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_reason?: Database["public"]["Enums"]["union_end_t"] | null
          ended_on?: string | null
          family_id?: string
          id?: string
          married_on?: string | null
          married_precision?: Database["public"]["Enums"]["date_precision_t"]
          partner_a?: string
          partner_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "unions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unions_family_id_partner_a_fkey"
            columns: ["family_id", "partner_a"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "unions_family_id_partner_b_fkey"
            columns: ["family_id", "partner_b"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string }
      add_relative: {
        Args: { p_anchor: string; p_person: Json; p_relation: string }
        Returns: string
      }
      create_family: {
        Args: {
          p_name: string
          p_native_place?: string
          p_self_gender?: Database["public"]["Enums"]["gender_t"]
          p_self_name?: string
        }
        Returns: string
      }
      create_group_chat: {
        Args: { p_family_id: string; p_member_ids: string[]; p_name: string }
        Returns: string
      }
      create_invite: {
        Args: {
          p_claim_person_id?: string
          p_email?: string
          p_family_id: string
          p_max_uses?: number
          p_role?: Database["public"]["Enums"]["family_role_t"]
        }
        Returns: string
      }
      export_family: { Args: { p_family_id: string }; Returns: Json }
      family_graph: { Args: { p_family_id: string }; Returns: Json }
      import_family_data: {
        Args: { p_data: Json; p_family_id: string }
        Returns: Json
      }
      invite_preview: {
        Args: { p_code: string }
        Returns: {
          email_locked: boolean
          family_name: string
          invited_by: string
          person_name: string
          role: Database["public"]["Enums"]["family_role_t"]
        }[]
      }
      merge_persons: { Args: { p_request_id: string }; Returns: string }
    }
    Enums: {
      chat_room_kind_t: "family" | "group"
      date_precision_t: "exact" | "month" | "year" | "approx" | "unknown"
      family_role_t: "owner" | "admin" | "editor" | "viewer"
      gender_t: "male" | "female" | "other" | "unknown"
      merge_status_t: "pending" | "approved" | "rejected"
      parent_kind_t: "biological" | "adopted" | "step" | "foster"
      private_field_t: "salary" | "dna"
      relation_style_t: "tamil" | "english_in" | "english_global"
      union_end_t: "divorce" | "death" | "separation"
      visibility_t: "family" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chat_room_kind_t: ["family", "group"],
      date_precision_t: ["exact", "month", "year", "approx", "unknown"],
      family_role_t: ["owner", "admin", "editor", "viewer"],
      gender_t: ["male", "female", "other", "unknown"],
      merge_status_t: ["pending", "approved", "rejected"],
      parent_kind_t: ["biological", "adopted", "step", "foster"],
      private_field_t: ["salary", "dna"],
      relation_style_t: ["tamil", "english_in", "english_global"],
      union_end_t: ["divorce", "death", "separation"],
      visibility_t: ["family", "private"],
    },
  },
} as const


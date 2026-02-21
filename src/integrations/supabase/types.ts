export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      direct_messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          content?: string;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "direct_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "direct_messages_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_splits: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          amount: number;
          percentage: number | null;
          settled: boolean;
          settled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          amount?: number;
          percentage?: number | null;
          settled?: boolean;
          settled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          expense_id?: string;
          user_id?: string;
          amount?: number;
          percentage?: number | null;
          settled?: boolean;
          settled_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "group_expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friend_requests_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_expenses: {
        Row: {
          id: string;
          trip_id: string;
          paid_by: string;
          title: string;
          description: string | null;
          amount: number;
          currency: string;
          category: string;
          split_type: string;
          split_with: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          paid_by: string;
          title: string;
          description?: string | null;
          amount?: number;
          currency?: string;
          category?: string;
          split_type?: string;
          split_with?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          paid_by?: string;
          title?: string;
          description?: string | null;
          amount?: number;
          currency?: string;
          category?: string;
          split_type?: string;
          split_with?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_expenses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_expenses_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activities: {
        Row: {
          category: string | null;
          cost: number | null;
          created_at: string;
          description: string | null;
          end_time: string;
          estimated_steps: number | null;
          id: string;
          itinerary_id: string;
          location_lat: number | null;
          location_lng: number | null;
          location_name: string | null;
          name: string;
          notes: string | null;
          priority: number | null;
          review_score: number | null;
          start_time: string;
          status: string;
        };
        Insert: {
          category?: string | null;
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          end_time: string;
          estimated_steps?: number | null;
          id?: string;
          itinerary_id: string;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name?: string | null;
          name: string;
          notes?: string | null;
          priority?: number | null;
          review_score?: number | null;
          start_time: string;
          status?: string;
        };
        Update: {
          category?: string | null;
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          end_time?: string;
          estimated_steps?: number | null;
          id?: string;
          itinerary_id?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name?: string | null;
          name?: string;
          notes?: string | null;
          priority?: number | null;
          review_score?: number | null;
          start_time?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_votes: {
        Row: {
          activity_id: string;
          created_at: string;
          id: string;
          user_id: string;
          vote: string;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
          vote: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
          vote?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_votes_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      communities: {
        Row: {
          category: string;
          cover_image: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_public: boolean;
          member_count: number;
          name: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          cover_image?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          member_count?: number;
          name: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          cover_image?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          member_count?: number;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_events: {
        Row: {
          community_id: string;
          created_at: string;
          created_by: string;
          description: string | null;
          destination: string | null;
          event_date: string;
          id: string;
          max_attendees: number | null;
          title: string;
        };
        Insert: {
          community_id: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          destination?: string | null;
          event_date: string;
          id?: string;
          max_attendees?: number | null;
          title: string;
        };
        Update: {
          community_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          destination?: string | null;
          event_date?: string;
          id?: string;
          max_attendees?: number | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_events_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      community_memberships: {
        Row: {
          community_id: string;
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          community_id: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          community_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      community_messages: {
        Row: {
          community_id: string;
          content: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          community_id: string;
          content: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          community_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_messages_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      disruption_events: {
        Row: {
          description: string | null;
          detected_at: string;
          event_type: string;
          id: string;
          new_itinerary: Json | null;
          old_itinerary: Json | null;
          replan_applied: boolean | null;
          resolved: boolean | null;
          severity: string | null;
          trip_id: string;
        };
        Insert: {
          description?: string | null;
          detected_at?: string;
          event_type: string;
          id?: string;
          new_itinerary?: Json | null;
          old_itinerary?: Json | null;
          replan_applied?: boolean | null;
          resolved?: boolean | null;
          severity?: string | null;
          trip_id: string;
        };
        Update: {
          description?: string | null;
          detected_at?: string;
          event_type?: string;
          id?: string;
          new_itinerary?: Json | null;
          old_itinerary?: Json | null;
          replan_applied?: boolean | null;
          resolved?: boolean | null;
          severity?: string | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disruption_events_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rsvps: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "community_events";
            referencedColumns: ["id"];
          },
        ];
      };
      itineraries: {
        Row: {
          cost_breakdown: Json | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_published: boolean | null;
          regret_score: number | null;
          trip_id: string;
          updated_at: string;
          variant_id: string | null;
          version: number | null;
        };
        Insert: {
          cost_breakdown?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_published?: boolean | null;
          regret_score?: number | null;
          trip_id: string;
          updated_at?: string;
          variant_id?: string | null;
          version?: number | null;
        };
        Update: {
          cost_breakdown?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_published?: boolean | null;
          regret_score?: number | null;
          trip_id?: string;
          updated_at?: string;
          variant_id?: string | null;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "itineraries_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          message_type: string | null;
          metadata: Json | null;
          sender_id: string;
          trip_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          sender_id: string;
          trip_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          sender_id?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          name: string;
          phone_number: string | null;
          preferences: Json | null;
          travel_history: Json | null;
          travel_personality: Json | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          name?: string;
          phone_number?: string | null;
          preferences?: Json | null;
          travel_history?: Json | null;
          travel_personality?: Json | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          phone_number?: string | null;
          preferences?: Json | null;
          travel_history?: Json | null;
          travel_personality?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      trip_invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string | null;
          id: string;
          invite_code: string;
          max_uses: number | null;
          status: string;
          trip_id: string;
          uses: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          id?: string;
          invite_code?: string;
          max_uses?: number | null;
          status?: string;
          trip_id: string;
          uses?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          id?: string;
          invite_code?: string;
          max_uses?: number | null;
          status?: string;
          trip_id?: string;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_join_requests: {
        Row: {
          created_at: string;
          id: string;
          invite_id: string | null;
          resolved_at: string | null;
          status: string;
          trip_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invite_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invite_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_join_requests_invite_id_fkey";
            columns: ["invite_id"];
            isOneToOne: false;
            referencedRelation: "trip_invites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_join_requests_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_memberships: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          trip_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_memberships_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          budget_total: number | null;
          country: string | null;
          created_at: string;
          currency: string | null;
          destination: string;
          end_date: string;
          id: string;
          image_url: string | null;
          name: string;
          organizer_id: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          budget_total?: number | null;
          country?: string | null;
          created_at?: string;
          currency?: string | null;
          destination: string;
          end_date: string;
          id?: string;
          image_url?: string | null;
          name: string;
          organizer_id: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          budget_total?: number | null;
          country?: string | null;
          created_at?: string;
          currency?: string | null;
          destination?: string;
          end_date?: string;
          id?: string;
          image_url?: string | null;
          name?: string;
          organizer_id?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_trip_id_from_activity: {
        Args: { p_itinerary_id: string };
        Returns: string;
      };
      get_trip_id_from_vote: {
        Args: { p_activity_id: string };
        Returns: string;
      };
      is_community_member: {
        Args: { p_community_id: string };
        Returns: boolean;
      };
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean };
      is_trip_organizer: { Args: { p_trip_id: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;

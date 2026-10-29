/**
 * Khamark Canonical Database Types
 * Generated from supabase/khamark_schema.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string | null;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          profile_image_url: string | null;
          cover_url: string | null;
          address: string | null;
          city: string | null;
          region: string | null;
          date_of_birth: string | null;
          gender: string | null;
          preferred_currency: string;
          language: string;
          role: string;
          is_admin: boolean;
          is_partner: boolean;
          is_blocked: boolean;
          phone_verified: boolean;
          email_verified: boolean;
          auth_provider: string | null;
          push_token: string | null;
          fcm_token: string | null;
          notification_settings: Json;
          shipping_info: Json | null;
          money_exchanger_info: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      tenants: {
        Row: {
          id: string;
          owner_id: string;
          store_name: string;
          store_name_ar: string | null;
          store_name_ku: string | null;
          logo_url: string | null;
          cover_url: string | null;
          description: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          contact_whatsapp: string | null;
          address: string | null;
          city: string | null;
          is_active: boolean;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['tenants']['Row']> & { id: string; owner_id: string };
        Update: Partial<Database['public']['Tables']['tenants']['Row']>;
      };
      parts_base: {
        Row: {
          id: string;
          tenant_id: string | null;
          name: string;
          name_ar: string | null;
          name_ku: string | null;
          part_number: string | null;
          barcode: string | null;
          category: string | null;
          category_ar: string | null;
          category_ku: string | null;
          brand: string | null;
          price_usd: number;
          price_iqd: number | null;
          purchase_price: number | null;
          purchase_price_iqd: number | null;
          compare_at_price: number | null;
          compare_at_price_iqd: number | null;
          vip_price: number | null;
          vip_price_iqd: number | null;
          vip_price_usd: number | null;
          compare_at_price_usd: number | null;
          stock_qty: number;
          initial_stock: number;
          historical_stock_qty: number;
          status: string;
          description: string | null;
          description_ar: string | null;
          description_ku: string | null;
          specifications: Json | null;
          features: string[] | null;
          image_urls: string[] | null;
          variations: Json | null;
          color_variations: Json | null;
          storage_options: Json | null;
          tags: string[] | null;
          is_featured: boolean;
          is_hot: boolean;
          is_new: boolean;
          is_active: boolean;
          price_tiers: Json;
          sort_order: number;
          shipping_cost: number;
          shipping_rates: Json | null;
          compatible_models: string[] | null;
          dimensions: string | null;
          weight: string | null;
          warranty: string | null;
          video_url: string | null;
          sku: string | null;
          condition: string;
          extra_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['parts_base']['Row']> & { name: string };
        Update: Partial<Database['public']['Tables']['parts_base']['Row']>;
      };
      orders: {
        Row: {
          id: string;
          order_number: string | null;
          idempotency_key: string | null;
          tenant_id: string | null;
          user_id: string | null;
          status: string;
          stock_status: string;
          payment_status: string;
          payment_method: string | Json;
          items: Json;
          subtotal_usd: number;
          shipping_usd: number;
          shipping_cost_usd: number;
          tax_usd: number;
          discount_usd: number;
          total_usd: number;
          total_iqd: number | null;
          exchange_rate: number;
          currency: string;
          shipping_address: Json | null;
          shipping_office_info: Json | null;
          money_exchanger_info: Json | null;
          customer_name: string | null;
          customer_phone: string | null;
          notes: string | null;
          qicard_payment_id: string | null;
          extra_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['orders']['Row']>;
        Update: Partial<Database['public']['Tables']['orders']['Row']>;
      };
      devices: {
        Row: {
          id: string;
          uid: string | null;
          device_name: string | null;
          platform: string | null;
          fcm_token: string | null;
          notifications_enabled: boolean;
          is_active: boolean;
          preferences: Json;
          last_active_at: string;
        };
        Insert: Partial<Database['public']['Tables']['devices']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['devices']['Row']>;
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string | null;
          token: string;
          platform: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['push_tokens']['Row']> & { token: string };
        Update: Partial<Database['public']['Tables']['push_tokens']['Row']>;
      };
      live_tracking: {
        Row: {
          id: string;
          order_id: string | null;
          driver_name: string | null;
          driver_phone: string | null;
          active: boolean;
          coords: Json | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['live_tracking']['Row']>;
        Update: Partial<Database['public']['Tables']['live_tracking']['Row']>;
      };
      global_settings: {
        Row: {
          id: string;
          data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['global_settings']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['global_settings']['Row']>;
      };
    };
    Views: {
      parts: {
        Row: Omit<Database['public']['Tables']['parts_base']['Row'], 'purchase_price' | 'purchase_price_iqd'> & {
          purchase_price: number | null;
          purchase_price_iqd: number | null;
        };
      };
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      lookup_login_email: {
        Args: { p_phone: string };
        Returns: string | null;
      };
      create_admin_account: {
        Args: {
          p_display_name?: string | null;
          p_store_name?: string | null;
          p_phone?: string | null;
          p_whatsapp?: string | null;
          p_invite_code?: string | null;
        };
        Returns: Json;
      };
      create_partner_account: {
        Args: {
          p_display_name?: string | null;
          p_phone?: string | null;
        };
        Returns: Json;
      };
      create_customer_order: {
        Args: {
          p_items: Json;
          p_shipping_address?: Json | null;
          p_shipping_office_info?: Json | null;
          p_payment_method?: string | null;
          p_promo_code?: string | null;
          p_notes?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
      delete_user: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      move_part_stock: {
        Args: {
          p_part_id: string;
          p_tenant_id: string;
          p_variation_id: string | null;
          p_delta: number;
        };
        Returns: void;
      };
      cancel_my_order: {
        Args: { p_order_id: string };
        Returns: void;
      };
    };
  };
}

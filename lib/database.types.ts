// Generated Database Types for BistroPOS
// These types represent the Supabase database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      business_subscriptions: {
        Row: {
          id: string
          business_id: string
          plan_id: string
          status: string | null
          current_period_start: string
          current_period_end: string
          next_billing_date: string
          payment_source_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          charge_status: string | null
          charge_retry_count: number | null
          last_charge_attempt: string | null
          retry_count: number | null
          last_retry_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          business_id: string
          plan_id: string
          status?: string | null
          current_period_start: string
          current_period_end: string
          next_billing_date: string
          payment_source_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          charge_status?: string | null
          charge_retry_count?: number | null
          last_charge_attempt?: string | null
          retry_count?: number | null
          last_retry_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          plan_id?: string
          status?: string | null
          current_period_start?: string
          current_period_end?: string
          next_billing_date?: string
          payment_source_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          charge_status?: string | null
          charge_retry_count?: number | null
          last_charge_attempt?: string | null
          retry_count?: number | null
          last_retry_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      businesses: {
        Row: {
          id: string
          public_id: string
          name: string
          owner_id: string | null
          phone: string | null
          address: string | null
          currency: string
          timezone: string
          logo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          public_id?: string
          name: string
          owner_id?: string | null
          phone?: string | null
          address?: string | null
          currency?: string
          timezone?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          public_id?: string
          name?: string
          owner_id?: string | null
          phone?: string | null
          address?: string | null
          currency?: string
          timezone?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cash_movements: {
        Row: {
          id: string
          shift_id: string
          created_by: string
          type: string
          amount: number
          description: string | null
          reference_id: string | null
          reference_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          shift_id: string
          created_by: string
          type: string
          amount: number
          description?: string | null
          reference_id?: string | null
          reference_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          shift_id?: string
          created_by?: string
          type?: string
          amount?: number
          description?: string | null
          reference_id?: string | null
          reference_type?: string | null
          created_at?: string
        }
      }
      cash_shifts: {
        Row: {
          id: string
          business_id: string
          opened_by: string
          opened_at: string
          closed_by: string | null
          closed_at: string | null
          cash_start: number
          cash_end: number | null
          total_sales_cash: number | null
          total_sales_card: number | null
          total_sales_transfer: number | null
          total_expenses: number | null
          total_drops: number | null
          difference: number | null
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          opened_by: string
          opened_at?: string
          closed_by?: string | null
          closed_at?: string | null
          cash_start: number
          cash_end?: number | null
          total_sales_cash?: number | null
          total_sales_card?: number | null
          total_sales_transfer?: number | null
          total_expenses?: number | null
          total_drops?: number | null
          difference?: number | null
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          opened_by?: string
          opened_at?: string
          closed_by?: string | null
          closed_at?: string | null
          cash_start?: number
          cash_end?: number | null
          total_sales_cash?: number | null
          total_sales_card?: number | null
          total_sales_transfer?: number | null
          total_expenses?: number | null
          total_drops?: number | null
          difference?: number | null
          status?: string
          notes?: string | null
          created_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          color: string
          icon: string
          display_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          description?: string | null
          color?: string
          icon?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          description?: string | null
          color?: string
          icon?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      client_transactions: {
        Row: {
          id: string
          client_id: string
          type: string
          amount: number
          note: string | null
          order_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          type: string
          amount: number
          note?: string | null
          order_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          type?: string
          amount?: number
          note?: string | null
          order_id?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          business_id: string
          name: string
          phone: string | null
          email: string | null
          address: string | null
          credit_limit: number
          current_debt: number
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          phone?: string | null
          email?: string | null
          address?: string | null
          credit_limit?: number
          current_debt?: number
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          credit_limit?: number
          current_debt?: number
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      delivery_info: {
        Row: {
          id: string
          order_id: string
          business_id: string
          address: string
          phone: string
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          delivery_fee: number
          delivery_status: string
          estimated_time: string | null
          delivered_at: string | null
          delivery_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          business_id: string
          address: string
          phone: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          delivery_fee?: number
          delivery_status?: string
          estimated_time?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          business_id?: string
          address?: string
          phone?: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          delivery_fee?: number
          delivery_status?: string
          estimated_time?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          created_at?: string
        }
      }
      drivers: {
        Row: {
          id: string
          business_id: string
          name: string
          phone: string | null
          vehicle_info: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          phone?: string | null
          vehicle_info?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          phone?: string | null
          vehicle_info?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          business_id: string
          amount: number
          description: string
          category: string | null
          payment_method: string
          receipt_url: string | null
          expense_date: string
          created_by: string | null
          created_at: string
          recurring_frequency: string | null
          recurring_day_of_month: number | null
          recurring_parent_id: string | null
        }
        Insert: {
          id?: string
          business_id: string
          amount: number
          description: string
          category?: string | null
          payment_method?: string
          receipt_url?: string | null
          expense_date?: string
          created_by?: string | null
          created_at?: string
          recurring_frequency?: string | null
          recurring_day_of_month?: number | null
          recurring_parent_id?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          amount?: number
          description?: string
          category?: string | null
          payment_method?: string
          receipt_url?: string | null
          expense_date?: string
          created_by?: string | null
          created_at?: string
          recurring_frequency?: string | null
          recurring_day_of_month?: number | null
          recurring_parent_id?: string | null
        }
      }
      ingredients: {
        Row: {
          id: string
          business_id: string
          name: string
          unit: string
          cost_per_unit: number
          stock: number
          min_stock: number
          supplier: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          unit?: string
          cost_per_unit?: number
          stock?: number
          min_stock?: number
          supplier?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          unit?: string
          cost_per_unit?: number
          stock?: number
          min_stock?: number
          supplier?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          total_price: number
          notes: string | null
          removed_ingredients: Json
          cooking_term: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price: number
          total_price: number
          notes?: string | null
          removed_ingredients?: Json
          cooking_term?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          notes?: string | null
          removed_ingredients?: Json
          cooking_term?: string | null
          status?: string
          created_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          business_id: string
          table_id: string | null
          client_id: string | null
          waiter_id: string | null
          order_number: number
          display_number: string | null
          order_type: string
          status: string
          payment_method: string
          payment_status: string
          subtotal: number
          discount: number
          discount_type: string | null
          tax: number
          total: number
          amount_paid: number
          change_amount: number
          notes: string | null
          customer_name: string | null
          created_at: string
          completed_at: string | null
          canceled_at: string | null
          canceled_reason: string | null
        }
        Insert: {
          id?: string
          business_id: string
          table_id?: string | null
          client_id?: string | null
          waiter_id?: string | null
          order_number?: number
          display_number?: string | null
          order_type?: string
          status?: string
          payment_method?: string
          payment_status?: string
          subtotal?: number
          discount?: number
          discount_type?: string | null
          tax?: number
          total?: number
          amount_paid?: number
          change_amount?: number
          notes?: string | null
          customer_name?: string | null
          created_at?: string
          completed_at?: string | null
          canceled_at?: string | null
          canceled_reason?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          table_id?: string | null
          client_id?: string | null
          waiter_id?: string | null
          order_number?: number
          display_number?: string | null
          order_type?: string
          status?: string
          payment_method?: string
          payment_status?: string
          subtotal?: number
          discount?: number
          discount_type?: string | null
          tax?: number
          total?: number
          amount_paid?: number
          change_amount?: number
          notes?: string | null
          customer_name?: string | null
          created_at?: string
          completed_at?: string | null
          canceled_at?: string | null
          canceled_reason?: string | null
        }
      }
      product_ingredients: {
        Row: {
          id: string
          product_id: string
          ingredient_id: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          ingredient_id: string
          quantity?: number
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          ingredient_id?: string
          quantity?: number
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          business_id: string
          category_id: string | null
          name: string
          description: string | null
          type: string
          price: number
          cost: number
          stock: number | null
          min_stock: number
          unit: string
          image_url: string | null
          barcode: string | null
          is_active: boolean
          has_customization: boolean
          customizable_options: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          category_id?: string | null
          name: string
          description?: string | null
          type: string
          price?: number
          cost?: number
          stock?: number | null
          min_stock?: number
          unit?: string
          image_url?: string | null
          barcode?: string | null
          is_active?: boolean
          has_customization?: boolean
          customizable_options?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          category_id?: string | null
          name?: string
          description?: string | null
          type?: string
          price?: number
          cost?: number
          stock?: number | null
          min_stock?: number
          unit?: string
          image_url?: string | null
          barcode?: string | null
          is_active?: boolean
          has_customization?: boolean
          customizable_options?: Json
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          phone: string | null
          role: string
          avatar_url: string | null
          business_id: string | null
          offline_prefix: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          phone?: string | null
          role?: string
          avatar_url?: string | null
          business_id?: string | null
          offline_prefix?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          phone?: string | null
          role?: string
          avatar_url?: string | null
          business_id?: string | null
          offline_prefix?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      rooms: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          display_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          created_at?: string
        }
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          description: string | null
          price: number
          currency: string
          interval: string
          features: Json | null
          limitations: Json | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          price: number
          currency?: string
          interval?: string
          features?: Json | null
          limitations?: Json | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price?: number
          currency?: string
          interval?: string
          features?: Json | null
          limitations?: Json | null
          is_active?: boolean | null
          created_at?: string | null
        }
      }
      tables: {
        Row: {
          id: string
          business_id: string
          room_id: string | null
          label: string
          seats: number
          status: string
          current_order_id: string | null
          position_x: number
          position_y: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          room_id?: string | null
          label: string
          seats?: number
          status?: string
          current_order_id?: string | null
          position_x?: number
          position_y?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          room_id?: string | null
          label?: string
          seats?: number
          status?: string
          current_order_id?: string | null
          position_x?: number
          position_y?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_business_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      user_belongs_to_business: {
        Args: {
          business_uuid: string
        }
        Returns: boolean
      }
      get_low_stock_products: {
        Args: {
          p_business_id?: string
        }
        Returns: {
          id: string
          name: string
          type: string
          current_stock: number
          min_stock: number
          unit: string
        }[]
      }
      get_low_stock_ingredients: {
        Args: {
          p_business_id?: string
        }
        Returns: {
          id: string
          name: string
          current_stock: number
          min_stock: number
          unit: string
        }[]
      }
      get_daily_sales_summary: {
        Args: {
          p_date?: string
          p_business_id?: string
        }
        Returns: Json
      }
      calculate_product_cost: {
        Args: {
          p_product_id: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

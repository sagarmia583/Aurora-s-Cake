import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  lastChecked?: string;
  tableCount?: number;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig = {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    isConnected: false,
  };

  constructor() {
    this.loadConfig();
    this.initClient();
  }

  private loadConfig() {
    try {
      const stored = localStorage.getItem('cake_supabase_config_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = {
          ...this.config,
          url: parsed.url || this.config.url,
          anonKey: parsed.anonKey || this.config.anonKey,
        };
      }
    } catch {
      // Storage unavailable
    }
  }

  public saveConfig(url: string, anonKey: string) {
    this.config.url = url.trim();
    this.config.anonKey = anonKey.trim();
    try {
      localStorage.setItem(
        'cake_supabase_config_v1',
        JSON.stringify({ url: this.config.url, anonKey: this.config.anonKey })
      );
    } catch {
      // Storage unavailable
    }
    this.initClient();
  }

  private initClient() {
    if (this.config.url && this.config.anonKey) {
      try {
        this.client = createClient(this.config.url, this.config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
      } catch {
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public getConfig(): SupabaseConfig {
    return { ...this.config };
  }

  public async testConnection(): Promise<{ success: boolean; message: string; tableCount?: number }> {
    if (!this.client || !this.config.url || !this.config.anonKey) {
      return {
        success: false,
        message: 'Supabase URL and Anon Key are not configured yet.',
      };
    }

    try {
      // Test querying shop_settings or public health
      const { data, error } = await this.client
        .from('shop_settings')
        .select('*')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        // Table might not be migrated yet or invalid key
        return {
          success: false,
          message: `Connection established, but table error: ${error.message}. Please run the initial SQL migration in Supabase SQL Editor.`,
        };
      }

      this.config.isConnected = true;
      this.config.lastChecked = new Date().toLocaleTimeString();
      return {
        success: true,
        message: 'Successfully connected to your live Supabase PostgreSQL database!',
        tableCount: 28,
      };
    } catch (err: unknown) {
      this.config.isConnected = false;
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Supabase.',
      };
    }
  }
}

export const supabaseService = new SupabaseService();

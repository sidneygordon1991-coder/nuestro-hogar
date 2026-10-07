import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL || 'https://dchihxrjtngwabbvsqap.supabase.co';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc';
export const supabase=createClient(url,key);
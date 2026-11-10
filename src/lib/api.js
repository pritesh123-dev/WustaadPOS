import { realApi } from './realApi';
import { mockApi } from './mockApi';
import { supabaseConfigured } from './supabase';

export const DEMO = import.meta.env.VITE_DEMO === '1';
export const configured = DEMO || supabaseConfigured;
export const api = DEMO ? mockApi : realApi;

// Demo only: lets the automated tests simulate an internet outage.
if (DEMO && typeof window !== 'undefined') window.__wposApi = api;

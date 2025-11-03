
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const BACKEND_URL = "/api";

let supabase;
 
async function initializeSupabase() {
    if (supabase) {
        return supabase;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        if (!response.ok) {
            throw new Error(`Failed to fetch Supabase config: ${response.statusText}`);
        }
        const config = await response.json();
        const supabaseUrl = config.supabaseUrl;
        const supabaseAnonKey = config.supabaseAnonKey;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error("Supabase URL or Anon Key is missing in the configuration.");
        }

        supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                storage: localStorage,
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });
        return supabase;
    } catch (error) {
        console.error("Error initializing Supabase client:", error);
        // Display a user-friendly error message on the page
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = `
                <div style="font-family: sans-serif; text-align: center; padding: 40px;">
                    <h1 style="color: #dc3545;">Error</h1>
                    <p>Could not connect to the application services.</p>
                    <p style="color: #6c757d; font-size: 0.9em;">Please ensure the backend is running and configured correctly.</p>
                </div>
            `;
        }
        return null;
    }
}

export { initializeSupabase };
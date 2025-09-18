import { initializeSupabase } from './auth.js';

const googleSignInBtn = document.getElementById('google-signin-btn');
const githubSignInBtn = document.getElementById('github-signin-btn');
const emailAuthForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const emailSignInBtn = document.getElementById('email-signin-btn');
const emailSignUpBtn = document.getElementById('email-signup-btn');
const messageBox = document.getElementById('message-box');

let supabase;

const showMessage = (text, type = 'info') => {
    messageBox.textContent = text;
    messageBox.className = `mt-4 p-4 rounded-md text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
    messageBox.classList.remove('hidden');
};

const navigateToApp = () => {
    window.location.href = '/';
};

const getRedirectUrl = () => `${window.location.origin}/login/`;

document.addEventListener('DOMContentLoaded', async () => {
    supabase = await initializeSupabase();
    if (!supabase) {
        showMessage('Failed to initialize authentication service.', 'error');
        return;
    }

    // Show provider error if present in URL
    try {
        const url = new URL(window.location.href);
        const urlError = url.searchParams.get('error');
        const urlErrorDesc = url.searchParams.get('error_description');
        if (urlError || urlErrorDesc) {
            showMessage(urlErrorDesc || urlError || 'Authentication failed.', 'error');
        }
    } catch {}

    // Redirect to app only once a valid session exists
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            navigateToApp();
        }
    });

    // Explicitly handle OAuth callback params if present
    const hasOAuthParams = /[?&#](code|access_token)=/.test(window.location.href);
    if (hasOAuthParams) {
        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
            if (error) {
                console.error('OAuth exchange error:', error);
                showMessage(`Authentication failed: ${error.message}`, 'error');
                return;
            } else if (data?.session) {
                navigateToApp();
                return;
            } else {
                // Fallback: retry fetching session briefly
                for (let i = 0; i < 10; i++) {
                    const { data: s } = await supabase.auth.getSession();
                    if (s?.session) {
                        navigateToApp();
                        return;
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
                showMessage('Authentication failed. Please try signing in again.', 'error');
            }
        } catch (e) {
            console.error('OAuth exchange threw:', e);
        }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        navigateToApp();
    }
});

if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: getRedirectUrl() }
        });
        if (error) showMessage(`Google sign-in failed: ${error.message}`, 'error');
    });
}

if (githubSignInBtn) {
    githubSignInBtn.addEventListener('click', async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: { redirectTo: getRedirectUrl(), scopes: 'read:user user:email' }
        });
        if (error) showMessage(`GitHub sign-in failed: ${error.message}`, 'error');
    });
}

const isValidEmail = (value) => /.+@.+\..+/.test(String(value || '').toLowerCase());

if (emailSignInBtn) {
    emailSignInBtn.addEventListener('click', async () => {
        if (!supabase) return;
        const email = (emailInput?.value || '').trim();
        const password = passwordInput?.value || '';
        if (!isValidEmail(email) || password.length < 6) {
            showMessage('Enter a valid email and a password (min 6 chars).', 'error');
            return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showMessage(`Sign in failed: ${error.message}`, 'error');
        } else if (data?.session) {
            navigateToApp();
        } else {
            showMessage('Check your inbox to confirm sign-in.', 'info');
        }
    });
}

if (emailSignUpBtn) {
    emailSignUpBtn.addEventListener('click', async () => {
        if (!supabase) return;
        const email = (emailInput?.value || '').trim();
        const password = passwordInput?.value || '';
        if (!isValidEmail(email) || password.length < 6) {
            showMessage('Enter a valid email and a password (min 6 chars).', 'error');
            return;
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            showMessage(`Sign up failed: ${error.message}`, 'error');
        } else {
            showMessage('Sign up successful. Check your email to confirm your account.', 'info');
        }
    });
}

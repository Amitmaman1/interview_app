import { initializeSupabase } from './auth.js';

const googleSignInBtn = document.getElementById('google-signin-btn');
const messageBox = document.getElementById('message-box');

let supabase;

const showMessage = (text, type = 'info') => {
    messageBox.textContent = text;
    messageBox.className = `mt-4 p-4 rounded-md text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
    messageBox.classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', async () => {
    supabase = await initializeSupabase();
    if (!supabase) {
        showMessage('Failed to initialize authentication service.', 'error');
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
    }
});

googleSignInBtn.addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
    if (error) {
        showMessage(`Google sign-in failed: ${error.message}`, 'error');
    }
});

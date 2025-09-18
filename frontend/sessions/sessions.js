import { initializeSupabase } from '/auth.js';

const BACKEND_URL = '/api';

let supabase;
let user = null;

const sessionList = document.getElementById('session-list');
const navProfileAvatar = document.getElementById('nav-profile-avatar');
const userEmailSpan = document.getElementById('user-email');
const deleteAllBtn = document.getElementById('delete-all-btn');
const messageBox = document.getElementById('message-box');
const sessionDetail = document.getElementById('session-detail');

const confirmModal = document.getElementById('confirm-modal');
const confirmMessageEl = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmConfirmBtn = document.getElementById('confirm-confirm');

document.addEventListener('DOMContentLoaded', async () => {
    supabase = await initializeSupabase();
    if (!supabase) return;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Error getting session:', error);
        return;
    }
    if (!session) {
        window.location.href = '/login.html';
        return;
    }
    user = session.user;
    if (userEmailSpan) userEmailSpan.textContent = user.email || '';
    if (navProfileAvatar) {
        navProfileAvatar.textContent = (user.email || 'U').slice(0, 2).toUpperCase();
        try {
            const prof = await fetchUserProfile(user.id);
            if (prof?.avatar_url) {
                navProfileAvatar.innerHTML = '';
                const img = document.createElement('img');
                img.src = prof.avatar_url;
                img.className = 'h-full w-full object-cover';
                img.alt = 'Avatar';
                navProfileAvatar.appendChild(img);
            }
        } catch {}
    }
    await loadSessions();
});

if (deleteAllBtn) deleteAllBtn.addEventListener('click', async () => {
    const confirmed = await confirmAction({
        message: 'Delete ALL sessions? This will permanently remove all your interview sessions.',
        confirmText: 'Delete All',
        danger: true
    });
    if (!confirmed) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('User not authenticated');
        const response = await fetch(`${BACKEND_URL}/sessions/all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (response.ok) {
            await loadSessions();
            showMessage('All sessions have been deleted.', 'info');
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete sessions.' }));
            showMessage(errorData.error, 'error');
        }
    } catch (e) {
        console.error('Error deleting all sessions:', e);
        showMessage('An error occurred while deleting sessions.', 'error');
    }
});

async function loadSessions() {
    if (!supabase || !user) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('User not authenticated');
        const response = await fetch(`${BACKEND_URL}/sessions`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch sessions');
        const data = await response.json();
        sessionList.innerHTML = '';
        if (!Array.isArray(data) || data.length === 0) {
            sessionList.innerHTML = '<p class="text-sm text-gray-500">No past sessions found.</p>';
            return;
        }
        data.forEach(s => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-3 rounded-md bg-gray-800 border border-gray-700';
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-sm text-indigo-300 hover:text-indigo-200 truncate flex-1';
            const when = new Date(s.created_at).toLocaleString();
            const score = typeof s.final_score !== 'undefined' && s.final_score !== null ? ` - Score: ${s.final_score}` : '';
            link.textContent = `${s.topic} (${s.difficulty}) - ${when}${score}`;
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                await displaySessionDetail(s.id);
            });
            const del = document.createElement('button');
            del.className = 'ml-3 text-red-400 hover:text-red-300';
            del.innerHTML = '&times;';
            del.title = 'Delete session';
            del.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await deleteSession(s.id);
            });
            row.appendChild(link);
            row.appendChild(del);
            sessionList.appendChild(row);
        });
    } catch (e) {
        console.error('Error fetching sessions:', e);
        showMessage('Could not load past sessions.', 'error');
    }
}

async function fetchUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', userId)
        .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
}

async function deleteSession(sessionId) {
    const confirmed = await confirmAction({
        message: 'Delete this session? This will permanently remove the selected session.',
        confirmText: 'Delete',
        danger: true
    });
    if (!confirmed) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('User not authenticated');
        const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (response.ok) {
            await loadSessions();
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete session.' }));
            showMessage(errorData.error, 'error');
        }
    } catch (e) {
        console.error('Error deleting session:', e);
        showMessage('An error occurred while deleting the session.', 'error');
    }
}

async function displaySessionDetail(sessionId) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('User not authenticated');
        const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch session details');
        const data = await response.json();
        renderSessionDetail(data);
    } catch (e) {
        console.error('Failed to load session detail', e);
        showMessage('Could not load the selected session.', 'error');
    }
}

function renderSessionDetail(data) {
    if (!sessionDetail) return;
    sessionDetail.classList.remove('hidden');
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const items = answers.map((a, idx) => `
        <div class="bg-gray-700 p-4 rounded-lg border border-gray-600 space-y-2">
            <h3 class="text-lg font-semibold text-gray-100">Question ${idx + 1}${a.question_text ? `: ${a.question_text}` : ''}</h3>
            <div class="bg-gray-800 p-3 rounded-md border border-gray-700">
                <h4 class="font-medium text-gray-200">Your Answer</h4>
                <p class="text-sm text-gray-100 whitespace-pre-wrap">${a.user_answer || ''}</p>
            </div>
            <div class="bg-blue-900 p-3 rounded-md border border-blue-700">
                <div class="flex items-center justify-between">
                    <h4 class="font-medium text-blue-200">AI Feedback</h4>
                    <span class="text-blue-100">Score: ${a.score}/10</span>
                </div>
                <p class="text-sm text-blue-100 whitespace-pre-wrap">${a.summary || ''}</p>
                <div class="p-2 bg-blue-800 rounded-md mt-2">
                    <h5 class="font-semibold text-blue-200">Corrections and Key Points</h5>
                    <p class="text-sm text-blue-100 whitespace-pre-wrap">${a.corrections || ''}</p>
                </div>
            </div>
        </div>
    `).join('');
    sessionDetail.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-2xl font-bold">${data.topic} (${data.difficulty})</h2>
                    <p class="text-sm text-gray-400">${new Date(data.created_at).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm text-gray-300">Final Score</p>
                    <p class="text-xl font-semibold text-emerald-400">${data.final_score ?? '--'}/10</p>
                </div>
            </div>
            <div class="bg-emerald-900 p-4 rounded-lg border border-emerald-700">
                <h3 class="text-lg font-medium text-emerald-200">Overall Feedback</h3>
                <p class="text-sm text-emerald-100">${data.final_feedback || ''}</p>
            </div>
            <div class="space-y-4">${items}</div>
        </div>
    `;
}

function showMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.className = `mt-4 p-4 rounded-md text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
    messageBox.classList.remove('hidden');
}

function confirmAction({ message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        if (!confirmModal || !confirmMessageEl || !confirmCancelBtn || !confirmConfirmBtn) {
            const fallback = window.confirm(message || 'Are you sure?');
            resolve(fallback);
            return;
        }
        confirmMessageEl.textContent = message || 'Are you sure?';
        confirmConfirmBtn.textContent = confirmText;
        confirmCancelBtn.textContent = cancelText;
        confirmConfirmBtn.classList.toggle('bg-rose-600', danger);
        confirmConfirmBtn.classList.toggle('hover:bg-rose-700', danger);
        confirmConfirmBtn.classList.toggle('bg-indigo-600', !danger);
        confirmConfirmBtn.classList.toggle('hover:bg-indigo-700', !danger);

        const cleanup = () => {
            confirmModal.classList.add('hidden');
            confirmCancelBtn.onclick = null;
            confirmConfirmBtn.onclick = null;
        };

        confirmCancelBtn.onclick = () => { cleanup(); resolve(false); };
        confirmConfirmBtn.onclick = () => { cleanup(); resolve(true); };
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');
    });
}



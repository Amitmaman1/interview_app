import { initializeSupabase } from './js/core/auth.js';

let supabase;
let user = null;

// Backend API URL
const BACKEND_URL = "/api";


let currentSessionQuestions = [];
let totalQuestions = 0;
let currentQuestionIndex = 0;
let sessionAnswers = [];

// DOM Elements
const appContainer = document.getElementById('app-container');
const topNav = document.getElementById('top-nav');
const navHomeBtn = document.getElementById('nav-home-btn');
const navProfileBtn = document.getElementById('nav-profile-btn');
const navProfileAvatar = document.getElementById('nav-profile-avatar');

async function renderNavAvatarFromProfile(userId, fallbackText) {
    if (!navProfileAvatar || !supabase) return;
    try {
        navProfileAvatar.innerHTML = '';
        if (fallbackText) navProfileAvatar.textContent = fallbackText;
        const { data, error } = await supabase
            .from('profiles')
            .select('avatar_url, name')
            .eq('user_id', userId)
            .single();
        if (!error && data?.avatar_url) {
            const img = document.createElement('img');
            img.src = data.avatar_url;
            img.className = 'h-full w-full object-cover';
            img.alt = 'Avatar';
            navProfileAvatar.innerHTML = '';
            navProfileAvatar.appendChild(img);
        }
    } catch {}
}
const loadingIndicator = document.getElementById('loading-indicator');
const sidebar = document.getElementById('sidebar');
const sessionList = document.getElementById('session-list');
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const deleteAllBtn = document.getElementById('delete-all-btn');
// Profile panel elements
const profileNameEl = document.getElementById('profile-name');
const profileEmailEl = document.getElementById('profile-email');
const profileAboutTextarea = document.getElementById('profile-about');
const profileSaveBtn = document.getElementById('profile-save');
const profileAvatarEl = document.getElementById('profile-avatar');
const profileRoleInput = document.getElementById('profile-role');
const profileLocationInput = document.getElementById('profile-location');
const profileYearsInput = document.getElementById('profile-years');
const profileSkillsInput = document.getElementById('profile-skills');
const profileAvgScoreEl = document.getElementById('profile-avg-score');
const avatarFileInput = document.getElementById('avatar-file');
const avatarRemoveBtn = document.getElementById('avatar-remove');
let avatarCropModal = document.getElementById('avatar-crop-modal');
let avatarCropImage = document.getElementById('avatar-crop-image');
let avatarCropCancel = document.getElementById('avatar-crop-cancel');
let avatarCropSave = document.getElementById('avatar-crop-save');
let avatarCrop1x1 = document.getElementById('avatar-crop-1x1');
let avatarCrop4x5 = document.getElementById('avatar-crop-4x5');
let avatarCropFree = document.getElementById('avatar-crop-free');
const simulatorView = document.getElementById('simulator-view');
const profileSection = document.getElementById('profile-section');

const sessionControls = document.getElementById("session-controls");
const startSessionBtn = document.getElementById("start-session-btn");
const topicSelect = document.getElementById("topic-select");
const difficultySelect = document.getElementById("difficulty-select");
const numQuestionsInput = document.getElementById("num-questions");

const questionArea = document.getElementById("question-area");
const currentQuestionNumSpan = document.getElementById("current-question-num");
const totalQuestionsNumSpan = document.getElementById("total-questions-num");
const questionText = document.getElementById("question-text");
const userAnswerTextarea = document.getElementById("user-answer");
const submitBtn = document.getElementById("submit-btn");

const individualFeedback = document.getElementById("individual-feedback");
const feedbackScoreSpan = document.getElementById("feedback-score");
const feedbackSummary = document.getElementById("feedback-summary");
const feedbackCorrections = document.getElementById("feedback-corrections");

const sessionGrade = document.getElementById("session-grade");
const finalScoreSpan = document.getElementById("final-score");
const finalFeedback = document.getElementById("final-feedback");
const startNewSessionBtn = document.getElementById("start-new-session-btn");

const sessionAnswersList = document.getElementById("session-answers-list");
const messageBox = document.getElementById("message-box");
// Confirm modal elements
const confirmModal = document.getElementById('confirm-modal');
const confirmMessageEl = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmConfirmBtn = document.getElementById('confirm-confirm');

// --- Initialization and Auth ---
document.addEventListener('DOMContentLoaded', async () => {
    supabase = await initializeSupabase();
    if (!supabase) {
        // Show login form if Supabase fails to initialize
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('loading-indicator').classList.add('hidden');
        return;
    }

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error("Error getting session:", error);
        // Show login form on error
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('loading-indicator').classList.add('hidden');
        return;
    }

    if (!session) {
        // No session - show login form, hide app
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('top-nav').classList.add('hidden');
        document.getElementById('loading-indicator').classList.add('hidden');
    } else {
        // Has session - hide login form, show app
        user = session.user;
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('top-nav').classList.remove('hidden');
        document.getElementById('loading-indicator').classList.add('hidden');
        
        if (userEmailSpan) userEmailSpan.textContent = '';
        const initials = ((user.email || 'U').trim().slice(0, 2) || 'U').toUpperCase();
        await hydrateProfilePanel(user);
        await renderNavAvatarFromProfile(user.id, initials);
        await loadPastSessions();
        const url = new URL(window.location.href);
        const openSessionId = url.searchParams.get('session');
        if (openSessionId) {
            // Ensure simulator view visible
            simulatorView?.classList.remove('hidden');
            profileSection?.classList.add('hidden');
            await displayPastSession(openSessionId);
        }
    }
});

if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Error signing out:", error);
    } else {
        window.location.href = '/login';
    }
});

if (deleteAllBtn) deleteAllBtn.addEventListener('click', async () => {
    if (!supabase) return;

    const confirmed = await confirmAction({
        message: 'Delete ALL sessions? This will permanently remove all your interview sessions.',
        confirmText: 'Delete All',
        danger: true
    });
    if (!confirmed) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not authenticated");

        const response = await fetch(`${BACKEND_URL}/sessions/all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (response.ok) {
            await loadPastSessions();
            showMessage('All sessions have been deleted.', 'info');
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete sessions.' }));
            showMessage(errorData.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting all sessions:', error);
        showMessage('An error occurred while deleting sessions.', 'error');
    }
});

// --- Data Fetching ---
async function loadPastSessions() {
    if (!supabase || !user) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not authenticated");

        const response = await fetch(`${BACKEND_URL}/sessions`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch sessions');
        }

        const data = await response.json();

        sessionList.innerHTML = '';
        if (data.length === 0) {
            sessionList.innerHTML = '<p class="text-sm text-gray-500">No past sessions found.</p>';
            return;
        }

        data.forEach(session => {
            const sessionEl = document.createElement('div');
            sessionEl.className = 'flex items-center justify-between p-2 rounded-md hover:bg-gray-700 transition-colors';

            const sessionLink = document.createElement('a');
            sessionLink.href = '#';
            sessionLink.className = 'text-sm truncate flex-grow text-gray-100';
            sessionLink.textContent = `${session.topic} (${session.difficulty}) - ${new Date(session.created_at).toLocaleDateString()}`;
            sessionLink.title = `${session.topic} (${session.difficulty}) - ${new Date(session.created_at).toLocaleString()}`;
            sessionLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Ensure simulator view is visible when opening a past session
                if (simulatorView && profileSection) {
                    simulatorView.classList.remove('hidden');
                    profileSection.classList.add('hidden');
                }
                displayPastSession(session.id);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ml-2 text-red-400 hover:text-red-300 flex-shrink-0';
            deleteBtn.innerHTML = '&times;'; // A simple 'x' icon
            deleteBtn.title = 'Delete session';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSession(session.id);
            });

            sessionEl.appendChild(sessionLink);
            sessionEl.appendChild(deleteBtn);
            sessionList.appendChild(sessionEl);
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        showMessage('Could not load past sessions.', 'error');
    }
}

async function displayPastSession(sessionId) {
    if (!supabase) return;
    hideMessage();

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not authenticated");

        const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch session details');
        }

        const data = await response.json();

        // Repopulate the data structures needed for the summary view
        currentSessionQuestions = data.answers.map(a => ({ id: a.question_id, question_text: a.question_text }));
        sessionAnswers = data.answers.map(a => ({
            question_id: a.question_id,
            user_answer: a.user_answer,
            feedback: { score: a.score, summary: a.summary, corrections: a.corrections }
        }));

        // Show the final grade screen and hide other elements
        finalScoreSpan.textContent = data.final_score;
        finalFeedback.textContent = data.final_feedback;
        sessionGrade.classList.remove("hidden");
        questionArea.classList.add("hidden");
        sessionControls.classList.add("hidden");
        individualFeedback.classList.add("hidden");

        displaySessionSummary();
    } catch (error) {
        console.error('Error fetching past session:', error);
        showMessage('Could not load the selected session.', 'error');
    }
}

async function deleteSession(sessionId) {
    if (!supabase) return;

    const confirmed = await confirmAction({
        message: 'Delete this session? This will permanently remove the selected session.',
        confirmText: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not authenticated");

        const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (response.ok) {
            await loadPastSessions();
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to delete session.' }));
            showMessage(errorData.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        showMessage('An error occurred while deleting the session.', 'error');
    }
}

// --- UI Helpers ---
const showMessage = (text, type = "info") => {
    messageBox.textContent = text;
    messageBox.className = `mt-4 p-4 rounded-md text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
    messageBox.classList.remove('hidden');
};

const hideMessage = () => {
    messageBox.classList.add('hidden');
};

const setLoadingState = (isLoading, buttonType) => {
    if (buttonType === "start") {
        startSessionBtn.disabled = isLoading;
        startSessionBtn.textContent = isLoading ? 'Loading...' : 'Start Session';
    } else if (buttonType === "submit") {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Submitting...' : 'Submit Answer';
    }
};

// --- Core Application Logic ---
function shuffleArray(items) {
    const array = items.slice();
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const fetchAndDisplayQuestions = async () => {
    setLoadingState(true, "start");
    hideMessage();
    const topic = topicSelect.value;
    const difficulty = difficultySelect.value;
    const numQuestions = parseInt(numQuestionsInput.value);

    try {
        const response = await fetch(`${BACKEND_URL}/questions?topic=${encodeURIComponent(topic)}&difficulty=${encodeURIComponent(difficulty)}&count=${numQuestions}&_t=${Date.now()}`);
        const questions = await response.json();
        
        if (response.ok && questions.length > 0) {
            const randomized = shuffleArray(questions);
            currentSessionQuestions = randomized.slice(0, numQuestions);
            totalQuestions = questions.length;
            currentQuestionIndex = 0;
            sessionAnswers = [];

            questionArea.classList.remove("hidden");
            individualFeedback.classList.add("hidden");
            sessionGrade.classList.add("hidden");
            sessionControls.classList.add("hidden");
            
            displayQuestion();
        } else {
            showMessage(questions.message || "Could not fetch questions. Please check the backend.", "error");
        }
    } catch (error) {
        console.error("Error fetching questions:", error);
        showMessage("Failed to connect to the backend.", "error");
    } finally {
        setLoadingState(false, "start");
    }
};

const displayQuestion = () => {
    if (currentQuestionIndex < totalQuestions) {
        const currentQuestion = currentSessionQuestions[currentQuestionIndex];
        questionText.textContent = currentQuestion.question_text;
        currentQuestionNumSpan.textContent = currentQuestionIndex + 1;
        totalQuestionsNumSpan.textContent = totalQuestions;
        userAnswerTextarea.value = '';
        userAnswerTextarea.disabled = false;
        submitBtn.style.display = "block";
        submitBtn.textContent = "Submit Answer";
        individualFeedback.classList.add("hidden");
    }
};

const submitFinalSession = async () => {
    setLoadingState(true, "submit");
    hideMessage();

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not authenticated");

        const response = await fetch(`${BACKEND_URL}/submit-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                session_answers: sessionAnswers,
                topic: topicSelect.value,
                difficulty: difficultySelect.value
            })
        });

        const finalGrade = await response.json();
        
        if (response.ok) {
            // await saveSessionToDb(finalGrade); // Removed redundant call
            finalScoreSpan.textContent = finalGrade.final_score;
            finalFeedback.textContent = finalGrade.final_feedback;
            sessionGrade.classList.remove("hidden");
            questionArea.classList.add("hidden");
            displaySessionSummary();
            await loadPastSessions(); // Refresh the sidebar
        } else {
            showMessage(finalGrade.error || "An error occurred while getting the final grade.", "error");
        }
    } catch (error) {
        console.error("Error submitting session:", error);
        showMessage("Failed to connect to the backend or an error occurred.", "error");
    } finally {
        setLoadingState(false, "submit");
    }
};

async function saveSessionToDb(finalGrade) {
    if (!supabase || !user) return;

    const topic = topicSelect.value;
    const difficulty = difficultySelect.value;

    // 1. Create the main session record
    const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
            user_id: user.id,
            topic: topic,
            difficulty: difficulty,
            final_score: finalGrade.overall_score,
            final_feedback: finalGrade.final_feedback
        })
        .select('id')
        .single();

    if (sessionError) {
        console.error('Error saving session:', sessionError);
        showMessage('Failed to save your session. Check console for details.', 'error');
        return;
    }

    const sessionId = sessionData.id;

    // 2. Prepare answer and feedback data
    const answersToInsert = sessionAnswers.map((answer, index) => ({
        session_id: sessionId,
        question_id: currentSessionQuestions[index].id,
        user_answer: answer.user_answer
    }));

    // 3. Insert answers and get their IDs
    const { data: insertedAnswers, error: answersError } = await supabase
        .from('answers')
        .insert(answersToInsert)
        .select('id');

    if (answersError) {
        console.error('Error saving answers:', answersError);
        showMessage('Failed to save your answers. Check console for details.', 'error');
        return;
    }

    // 4. Prepare feedback data linked to the new answer IDs
    const feedbackToInsert = sessionAnswers.map((answer, index) => ({
        answer_id: insertedAnswers[index].id,
        score: answer.feedback.score,
        summary: answer.feedback.summary,
        corrections: answer.feedback.corrections,
        ai_feedback: answer.feedback
    }));

    // 5. Insert feedback
    const { error: feedbackError } = await supabase
        .from('feedback')
        .insert(feedbackToInsert);

    if (feedbackError) {
        console.error('Error saving feedback:', feedbackError);
        showMessage('Failed to save session feedback. Check console for details.', 'error');
    }
}

const displaySessionSummary = () => {
    sessionAnswersList.innerHTML = '';
    sessionAnswers.forEach((sessionAnswer, index) => {
        const questionNumber = index + 1;
        const question = currentSessionQuestions[index];
        const feedback = sessionAnswer.feedback;

        const summaryItem = document.createElement('div');
        summaryItem.className = 'bg-gray-700 p-6 rounded-xl shadow-md border border-gray-600 space-y-4';
        
        summaryItem.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-gray-100">Question ${questionNumber}: ${question.question_text}</h3>
            </div>
            <div class="space-y-2 bg-gray-800 p-4 rounded-lg text-gray-100 border border-gray-700">
                <h4 class="text-lg font-medium text-gray-200">Your Answer</h4>
                <p class="text-sm text-gray-100 whitespace-pre-wrap">${sessionAnswer.user_answer}</p>
            </div>
            <div class="space-y-2 bg-blue-900 p-4 rounded-lg border border-blue-700">
                <div class="flex items-center justify-between">
                    <h4 class="text-lg font-medium text-blue-200">AI Feedback: <span class="font-bold">${feedback.score} / 10</span></h4>
                </div>
                <p class="text-sm text-blue-100 whitespace-pre-wrap">${feedback.summary}</p>
                <div class="p-3 bg-blue-800 rounded-md mt-2">
                    <h5 class="font-semibold text-blue-200">Corrections and Key Points</h5>
                    <p class="text-sm text-blue-100 whitespace-pre-wrap">${feedback.corrections}</p>
                </div>
            </div>
        `;
        
        sessionAnswersList.appendChild(summaryItem);
    });
};

// --- Profile Panel Logic ---
function getLocalProfileKey(userId) {
    return `profile:${userId}`;
}

async function fetchUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('name, about, avatar_url, role, location, years_experience, skills, updated_at')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching profile:', error);
        }
        return data || null;
    } catch (e) {
        console.error('Unexpected profile fetch error:', e);
        return null;
    }
}

async function upsertUserProfile(userId, { name, about, avatar_url, role, location, years_experience, skills }) {
    const payload = { user_id: userId, name, about, avatar_url, role, location, years_experience, skills, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('profiles').upsert(payload).select().single();
    if (error) throw error;
    return data;
}

async function hydrateProfilePanel(currentUser) {
    if (!profileEmailEl || !profileNameEl) return;
    const email = currentUser.email || '';
    const fallbackName = email.includes('@') ? email.split('@')[0] : email;
    const prof = await fetchUserProfile(currentUser.id);
    const displayName = prof?.name || fallbackName;
    const about = prof?.about || '';

    profileNameEl.textContent = displayName;
    profileEmailEl.textContent = email;
    if (profileAboutTextarea) profileAboutTextarea.value = about;
    if (profileRoleInput) profileRoleInput.value = prof?.role || '';
    if (profileLocationInput) profileLocationInput.value = prof?.location || '';
    if (profileYearsInput) profileYearsInput.value = typeof prof?.years_experience === 'number' ? prof.years_experience : '';
    if (profileSkillsInput) profileSkillsInput.value = prof?.skills || '';
    if (profileAvatarEl) {
        profileAvatarEl.innerHTML = '';
        if (prof?.avatar_url) {
            const img = document.createElement('img');
            img.src = prof.avatar_url;
            img.className = 'h-full w-full object-cover';
            img.alt = 'Avatar';
            profileAvatarEl.appendChild(img);
        } else {
            const initials = (displayName || email).trim().slice(0, 2).toUpperCase();
            profileAvatarEl.textContent = initials;
        }
    }

    // Update top-right nav avatar
    if (navProfileAvatar) {
        navProfileAvatar.innerHTML = '';
        if (prof?.avatar_url) {
            const img = document.createElement('img');
            img.src = prof.avatar_url;
            img.className = 'h-full w-full object-cover';
            img.alt = 'Avatar';
            navProfileAvatar.appendChild(img);
        } else {
            const initials = (displayName || email).trim().slice(0, 2).toUpperCase();
            navProfileAvatar.textContent = initials;
        }
    }

    // Do not bind save handler here; it's bound globally below to avoid duplicate listeners

    // Load and render average score
    const avg = await fetchUserAverageScore();
    if (profileAvgScoreEl) profileAvgScoreEl.textContent = isNaN(avg) ? '--' : avg.toFixed(1);
}

// --- Avatar Upload + Crop ---
let cropperInstance = null;

function bindCropperControlsOnce() {
    // Re-query in case modal was injected later
    avatarCropModal = document.getElementById('avatar-crop-modal');
    avatarCropImage = document.getElementById('avatar-crop-image');
    avatarCropCancel = document.getElementById('avatar-crop-cancel');
    avatarCropSave = document.getElementById('avatar-crop-save');
    avatarCrop1x1 = document.getElementById('avatar-crop-1x1');
    avatarCrop4x5 = document.getElementById('avatar-crop-4x5');
    avatarCropFree = document.getElementById('avatar-crop-free');

    if (avatarCropCancel && !avatarCropCancel._bound) {
        avatarCropCancel.addEventListener('click', () => closeAvatarCropper());
        avatarCropCancel._bound = true;
    }
    if (avatarCrop1x1 && !avatarCrop1x1._bound) {
        avatarCrop1x1.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(1));
        avatarCrop1x1._bound = true;
    }
    if (avatarCrop4x5 && !avatarCrop4x5._bound) {
        avatarCrop4x5.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(4 / 5));
        avatarCrop4x5._bound = true;
    }
    if (avatarCropFree && !avatarCropFree._bound) {
        avatarCropFree.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(NaN));
        avatarCropFree._bound = true;
    }
    if (avatarCropSave && !avatarCropSave._bound) {
        avatarCropSave.addEventListener('click', onAvatarCropSave);
        avatarCropSave._bound = true;
    }
}

function openAvatarCropper(file) {
    bindCropperControlsOnce();
    if (!avatarCropModal || !avatarCropImage) return;
    const reader = new FileReader();
    reader.onload = () => {
        avatarCropImage.src = reader.result;
        avatarCropModal.classList.remove('hidden');
        avatarCropModal.classList.add('flex');
        // Use global Cropper from window to be safe in module scope
        cropperInstance = new (window.Cropper || Cropper)(avatarCropImage, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            background: false,
            autoCropArea: 1,
        });
    };
    reader.readAsDataURL(file);
}

async function uploadAvatarBlob(userId, blob) {
    const fileName = `${userId}/${Date.now()}.png`;
    const { data, error } = await supabase.storage.from('avatars').upload(fileName, blob, {
        upsert: true,
        contentType: 'image/png'
    });
    if (error) throw error;
    // Some Supabase setups require bucket path without folder prefix in getPublicUrl
    const uploadedPath = data?.path || fileName;
    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(uploadedPath);
    return publicUrlData.publicUrl;
}

function closeAvatarCropper() {
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    if (avatarCropModal) {
        avatarCropModal.classList.add('hidden');
        avatarCropModal.classList.remove('flex');
    }
}

if (avatarFileInput) {
    avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showMessage('Please select an image file.', 'error');
            return;
        }
        openAvatarCropper(file);
        // reset input so the same file can be chosen again later
        e.target.value = '';
    });
}

if (avatarCropCancel) {
    avatarCropCancel.addEventListener('click', () => {
        closeAvatarCropper();
    });
}

if (avatarCrop1x1 && avatarCrop4x5 && avatarCropFree) {
    avatarCrop1x1.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(1));
    avatarCrop4x5.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(4 / 5));
    avatarCropFree.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(NaN));
}

async function onAvatarCropSave() {
    try {
        if (!cropperInstance) {
            console.warn('Cropper not initialized');
            return;
        }
        if (!user) {
            showMessage('Not signed in.', 'error');
            return;
        }
        const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256, imageSmoothing: true, imageSmoothingQuality: 'high' });
        const blob = await new Promise((resolve) => canvas && canvas.toBlob ? canvas.toBlob(resolve, 'image/png') : resolve(null));
        if (!blob) throw new Error('Failed to produce image');
        const publicUrl = await uploadAvatarBlob(user.id, blob);
        await upsertUserProfile(user.id, { name: profileNameEl.textContent.trim(), about: profileAboutTextarea.value, avatar_url: publicUrl, role: profileRoleInput?.value, location: profileLocationInput?.value, years_experience: profileYearsInput?.value ? Number(profileYearsInput.value) : undefined, skills: profileSkillsInput?.value });
        // Update UI
        profileAvatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = publicUrl;
        img.className = 'h-full w-full object-cover';
        profileAvatarEl.appendChild(img);
        closeAvatarCropper();
        showMessage('Avatar updated successfully.', 'info');
        const avg = await fetchUserAverageScore();
        if (profileAvgScoreEl) profileAvgScoreEl.textContent = isNaN(avg) ? '--' : avg.toFixed(1);
    } catch (err) {
        console.error('Avatar save error', err);
        showMessage('Failed to update avatar.', 'error');
    }
}

// Remove button removed from UI; keep handler disabled

// --- Average score ---
async function fetchUserAverageScore() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NaN;
        const res = await fetch(`${BACKEND_URL}/sessions`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) return NaN;
        const all = await res.json();
        if (!Array.isArray(all) || all.length === 0) return NaN;
        const scores = all.map(s => Number(s.final_score)).filter(n => !isNaN(n));
        if (scores.length === 0) return NaN;
        const sum = scores.reduce((a, b) => a + b, 0);
        return sum / scores.length;
    } catch (e) {
        console.error('Failed calculating avg score', e);
        return NaN;
    }
}

// --- Global Profile Save handler ---
if (profileSaveBtn) {
    profileSaveBtn.addEventListener('click', async () => {
        try {
            if (!user) {
                showMessage('Not signed in.', 'error');
                return;
            }
            const newName = (profileNameEl?.textContent || '').trim();
            const newAbout = profileAboutTextarea ? profileAboutTextarea.value : '';
            const role = profileRoleInput ? profileRoleInput.value : undefined;
            const location = profileLocationInput ? profileLocationInput.value : undefined;
            const years = profileYearsInput && profileYearsInput.value !== '' ? Number(profileYearsInput.value) : undefined;
            const skills = profileSkillsInput ? profileSkillsInput.value : undefined;
            profileSaveBtn.disabled = true;
            profileSaveBtn.textContent = 'Saving...';
            await upsertUserProfile(user.id, { name: newName, about: newAbout, avatar_url: undefined, role, location, years_experience: years, skills });
            profileSaveBtn.textContent = 'Saved';
            setTimeout(() => { profileSaveBtn.textContent = 'Save'; profileSaveBtn.disabled = false; }, 1000);
            // Update initials if no avatar image present
            if (profileAvatarEl && !profileAvatarEl.querySelector('img')) {
                profileAvatarEl.textContent = (newName || (user.email || '')).trim().slice(0, 2).toUpperCase();
            }
            // Update average score after save
            const avg = await fetchUserAverageScore();
            if (profileAvgScoreEl) profileAvgScoreEl.textContent = isNaN(avg) ? '--' : avg.toFixed(1);
        } catch (e) {
            console.error('Profile save failed', e);
            showMessage('Failed to save profile', 'error');
            profileSaveBtn.textContent = 'Save';
            profileSaveBtn.disabled = false;
        }
    });
}

// Click avatar to change image
if (profileAvatarEl && avatarFileInput) {
    profileAvatarEl.addEventListener('click', () => {
        avatarFileInput.click();
    });
    profileAvatarEl.style.cursor = 'pointer';
}

// --- Confirm Modal Helper ---
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

        confirmCancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
        confirmConfirmBtn.onclick = () => {
            cleanup();
            resolve(true);
        };
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');
    });
}

// --- Event Listeners ---
startSessionBtn.addEventListener("click", fetchAndDisplayQuestions);

submitBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    if (submitBtn.textContent === "Submit Answer") {
        setLoadingState(true, "submit");
        hideMessage();

        const userAnswer = userAnswerTextarea.value;
        const currentQuestion = currentSessionQuestions[currentQuestionIndex];
        
        if (!userAnswer.trim()) {
            showMessage("Please provide an answer before submitting.", "error");
            setLoadingState(false, "submit");
            submitBtn.textContent = "Submit Answer"; // Reset text
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated");

            const response = await fetch(`${BACKEND_URL}/submit-answer`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    question_id: currentQuestion.id,
                    user_answer: userAnswer
                })
            });

            if (response.ok) {
                const feedback = await response.json();
                sessionAnswers.push({
                    question_id: currentQuestion.id,
                    user_answer: userAnswer,
                    feedback: feedback
                });
                
                feedbackScoreSpan.textContent = feedback.score;
                feedbackSummary.textContent = feedback.summary;
                feedbackCorrections.textContent = feedback.corrections;
                individualFeedback.classList.remove("hidden");
                userAnswerTextarea.disabled = true;

                if (currentQuestionIndex < totalQuestions - 1) {
                    submitBtn.textContent = "Next Question";
                } else {
                    submitBtn.textContent = "Get Final Grade";
                }
                submitBtn.disabled = false; // Manually re-enable
            } else {
                const errorData = await response.json().catch(() => ({error: "Unknown error"}));
                showMessage(errorData.error || `An error occurred. Status: ${response.status}`, "error");
                setLoadingState(false, "submit"); // Re-enable and reset text
                submitBtn.textContent = "Submit Answer";
            }
        } catch (error) {
            console.error("Error submitting answer:", error);
            showMessage("A network error occurred.", "error");
            setLoadingState(false, "submit"); // Re-enable and reset text
            submitBtn.textContent = "Submit Answer";
        }
    } else if (submitBtn.textContent === "Next Question") {
        currentQuestionIndex++;
        displayQuestion();
    } else if (submitBtn.textContent === "Get Final Grade") {
        submitFinalSession();
    }
});

startNewSessionBtn.addEventListener("click", () => {
    sessionControls.classList.remove("hidden");
    sessionGrade.classList.add("hidden");
    individualFeedback.classList.add("hidden"); // Hide individual feedback
});

// --- Navigation Handlers ---
if (navHomeBtn && navProfileBtn && simulatorView && profileSection) {
    navHomeBtn.addEventListener('click', () => {
        // Show simulator/main session controls
        simulatorView.classList.remove('hidden');
        profileSection.classList.add('hidden');
        sessionControls.classList.remove('hidden');
        sessionGrade.classList.add('hidden');
        individualFeedback.classList.add('hidden');
        // Update nav button styles
        navHomeBtn.classList.add('bg-gray-800');
        navHomeBtn.classList.remove('bg-gray-700');
        navProfileBtn.classList.remove('bg-indigo-600');
    });
    navProfileBtn.addEventListener('click', () => {
        simulatorView.classList.add('hidden');
        profileSection.classList.remove('hidden');
        navHomeBtn.classList.remove('bg-gray-800');
        navProfileBtn.classList.add('bg-indigo-600');
    });
}

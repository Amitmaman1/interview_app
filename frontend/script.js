import { initializeSupabase } from './auth.js';

let supabase;
let user = null;

// Backend API URL
const BACKEND_URL = "http://localhost:5000";

let currentSessionQuestions = [];
let totalQuestions = 0;
let currentQuestionIndex = 0;
let sessionAnswers = [];

// DOM Elements
const appContainer = document.getElementById('app-container');
const topNav = document.getElementById('top-nav');
const navHomeBtn = document.getElementById('nav-home-btn');
const navProfileBtn = document.getElementById('nav-profile-btn');
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
    if (!supabase) return;

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error("Error getting session:", error);
        return;
    }

    if (!session) {
        window.location.href = 'login.html';
    } else {
        user = session.user;
        userEmailSpan.textContent = user.email;
        hydrateProfilePanel(user);
        appContainer.classList.remove('hidden');
        topNav.classList.remove('hidden');
        loadingIndicator.classList.add('hidden');
        await loadPastSessions();
    }
});

logoutBtn.addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Error signing out:", error);
    } else {
        window.location.href = 'login.html';
    }
});

deleteAllBtn.addEventListener('click', async () => {
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

function hydrateProfilePanel(currentUser) {
    if (!profileEmailEl || !profileNameEl) return;
    const email = currentUser.email || '';
    const nameFromEmail = email.includes('@') ? email.split('@')[0] : email;
    const profileKey = getLocalProfileKey(currentUser.id);
    let stored = {};
    try {
        stored = JSON.parse(localStorage.getItem(profileKey) || '{}');
    } catch (_) {
        stored = {};
    }
    const displayName = stored.name || nameFromEmail;
    const about = stored.about || '';

    profileNameEl.textContent = displayName;
    profileEmailEl.textContent = email;
    if (profileAboutTextarea) profileAboutTextarea.value = about;
    if (profileAvatarEl) {
        const initials = (displayName || email).trim().slice(0, 2).toUpperCase();
        profileAvatarEl.textContent = initials;
    }

    if (profileSaveBtn) {
        profileSaveBtn.onclick = () => {
            const newAbout = profileAboutTextarea ? profileAboutTextarea.value : '';
            const newName = displayName; // Could be extended to editable later
            const payload = { name: newName, about: newAbout, updatedAt: new Date().toISOString() };
            localStorage.setItem(profileKey, JSON.stringify(payload));
            // Provide quick visual feedback
            profileSaveBtn.textContent = 'Saved';
            profileSaveBtn.disabled = true;
            setTimeout(() => {
                profileSaveBtn.textContent = 'Save';
                profileSaveBtn.disabled = false;
            }, 1200);
        };
    }
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
        simulatorView.classList.remove('hidden');
        profileSection.classList.add('hidden');
        navHomeBtn.classList.add('bg-gray-800');
        navHomeBtn.classList.remove('bg-gray-700');
        navProfileBtn.classList.remove('bg-gray-800');
    });
    navProfileBtn.addEventListener('click', () => {
        simulatorView.classList.add('hidden');
        profileSection.classList.remove('hidden');
        navHomeBtn.classList.remove('bg-gray-800');
        navProfileBtn.classList.add('bg-indigo-600');
    });
}

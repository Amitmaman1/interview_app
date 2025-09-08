// script.js

const userId = localStorage.getItem('devops_user_id') || crypto.randomUUID();
localStorage.setItem('devops_user_id', userId);

// Backend API URL (for local development)
const BACKEND_URL = "http://localhost:5000";

let currentSessionQuestions = [];
let totalQuestions = 0;
let currentQuestionIndex = 0;
let sessionAnswers = [];

// DOM Elements
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

// New DOM element for the session summary list
const sessionAnswersList = document.getElementById("session-answers-list");

const messageBox = document.getElementById("message-box");

// Helper to show messages
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

const fetchAndDisplayQuestions = async () => {
    setLoadingState(true, "start");
    hideMessage();
    const topic = topicSelect.value;
    const difficulty = difficultySelect.value;
    const numQuestions = parseInt(numQuestionsInput.value);

    try {
        const response = await fetch(`${BACKEND_URL}/questions?topic=${topic}&difficulty=${difficulty}&count=${numQuestions}`);
        const questions = await response.json();
        
        if (response.ok && questions.length > 0) {
            currentSessionQuestions = questions;
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

const displaySessionSummary = () => {
    // Clear any previous summary content
    sessionAnswersList.innerHTML = '';

    // Loop through each question and its feedback
    sessionAnswers.forEach((sessionAnswer, index) => {
        const questionNumber = index + 1;
        const question = currentSessionQuestions[index];
        const feedback = sessionAnswer.feedback;

        const summaryItem = document.createElement('div');
        summaryItem.className = 'bg-white p-6 rounded-xl shadow-md border border-gray-200 space-y-4';
        
        // Build the HTML for each summary item
        summaryItem.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-gray-800">Question ${questionNumber}: ${question.question_text}</h3>
            </div>
            <div class="space-y-2 bg-gray-50 p-4 rounded-lg text-gray-800 border border-gray-200">
                <h4 class="text-lg font-medium text-gray-700">Your Answer</h4>
                <p class="text-sm text-gray-800 whitespace-pre-wrap">${sessionAnswer.user_answer}</p>
            </div>
            <div class="space-y-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div class="flex items-center justify-between">
                    <h4 class="text-lg font-medium text-blue-800">AI Feedback: <span class="font-bold">${feedback.score} / 10</span></h4>
                </div>
                <p class="text-sm text-blue-700">${feedback.summary}</p>
                <div class="p-3 bg-blue-100 rounded-md mt-2">
                    <h5 class="font-semibold text-blue-800">Corrections and Key Points</h5>
                    <p class="text-sm text-blue-700 mt-1">${feedback.corrections}</p>
                </div>
            </div>
        `;
        
        sessionAnswersList.appendChild(summaryItem);
    });
};

const submitFinalSession = async () => {
    setLoadingState(true, "submit");
    hideMessage();

    try {
        const response = await fetch(`${BACKEND_URL}/submit-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, session_answers: sessionAnswers })
        });

        const finalGrade = await response.json();
        
        if (response.ok) {
            finalScoreSpan.textContent = finalGrade.overall_score;
            finalFeedback.textContent = finalGrade.final_feedback;
            sessionGrade.classList.remove("hidden");
            questionArea.classList.add("hidden");
            displaySessionSummary(); // Call the new function to display the summary
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


// Event listeners
startSessionBtn.addEventListener("click", fetchAndDisplayQuestions);

submitBtn.addEventListener("click", async (event) => {
    
    // Prevent the default form submission behavior (page reload)
    event.preventDefault();

    console.log("Current button text:", submitBtn.textContent);

    if (submitBtn.textContent === "Submit Answer") {
        setLoadingState(true, "submit");
        hideMessage();

        const userAnswer = userAnswerTextarea.value;
        const currentQuestion = currentSessionQuestions[currentQuestionIndex];
        
        if (!userAnswer.trim()) {
            showMessage("Please provide an answer before submitting.", "error");
            setLoadingState(false, "submit");
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/submit-answer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    question_id: currentQuestion.id,
                    user_answer: userAnswer
                })
            });

            if (response.ok) {
                try {
                    const feedback = await response.json();
                    
                    // Save the full feedback and user's answer
                    sessionAnswers.push({
                        question_id: currentQuestion.id,
                        user_answer: userAnswer,
                        feedback: feedback
                    });
                    
                    // Display individual feedback (without user's answer or correct answer)
                    feedbackScoreSpan.textContent = feedback.score;
                    feedbackSummary.textContent = feedback.summary;
                    feedbackCorrections.textContent = feedback.corrections;
                    individualFeedback.classList.remove("hidden");
                    userAnswerTextarea.disabled = true;

                    // Update button for next step
                    if (currentQuestionIndex < totalQuestions - 1) {
                        submitBtn.textContent = "Next Question";
                    } else {
                        submitBtn.textContent = "Get Final Grade";
                    }

                    // Re-enable the button after a successful API call
                    submitBtn.disabled = false;

                } catch (jsonError) {
                    const rawResponse = await response.text();
                    console.error("Error parsing JSON response:", jsonError);
                    console.error("Raw backend response:", rawResponse);
                    showMessage("Error parsing AI feedback. Check the console for the raw response.", "error");
                    setLoadingState(false, "submit");
                }
            } else {
                const errorData = await response.json().catch(() => ({error: "Unknown error"}));
                showMessage(errorData.error || `An error occurred while getting feedback. Status: ${response.status}`, "error");
                setLoadingState(false, "submit");
            }
        } catch (error) {
            console.error("Error submitting answer:", error);
            showMessage("Failed to connect to the backend or a network error occurred.", "error");
            setLoadingState(false, "submit");
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
});
import pytest
import json
from unittest.mock import patch, MagicMock, Mock
from types import SimpleNamespace
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# -------------------------
# Utility mocks
# -------------------------

def mock_user():
    """Fake authenticated user object like supabase.auth.get_user returns"""
    mock = MagicMock()
    mock.user.id = "test-user-id"
    mock.user.email = "test@example.com"
    return mock


def mock_questions():
    return [
        {"id": 1, "question_text": "What is CI/CD?", "topic": "CI/CD", "difficulty": "Beginner"},
        {"id": 2, "question_text": "Explain Docker.", "topic": "Containers", "difficulty": "Intermediate"},
    ]


def mock_ai_feedback():
    return {"score": 8, "summary": "Good answer", "corrections": "None needed"}


def mock_final_feedback():
    return {"overall_score": 7.5, "final_feedback": "Solid performance, improve on Docker."}


# -------------------------
# Tests
# -------------------------

def test_home_route(client):
    """Should serve index.html"""
    with patch("app.send_from_directory") as mock_send:
        mock_send.return_value = "HTML"
        resp = client.get("/")
        assert resp.status_code == 200
        assert b"HTML" in resp.data





def test_get_questions_not_found(client):
    """Should return 404 if no questions found"""
    with patch("app.supabase") as mock_sb:
        mock_exec = MagicMock()
        mock_exec.data = []
        mock_sb.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_exec

        resp = client.get("/questions?topic=X&difficulty=Y&count=1")
        assert resp.status_code == 404


@patch("app.get_user_from_token")
def test_submit_answer_missing_fields(mock_auth, client):
    """Should fail if fields missing"""
    mock_auth.return_value = ({"id": "u"}, None)
    resp = client.post("/submit-answer", json={}, headers={"Authorization": "Bearer t"})
    assert resp.status_code == 400


@patch("app.get_user_from_token")
def test_submit_answer_success(mock_auth, client):
    """Should evaluate answer with Groq"""
    mock_auth.return_value = (mock_user(), None)

    with patch("app.supabase") as mock_sb, patch("app.groq_client") as mock_groq:
        # Mock DB
        mock_q = {"id": 1, "question_text": "What is CI/CD?"}
        mock_exec = MagicMock()
        mock_exec.data = mock_q
        mock_sb.from_.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_exec

        # Mock AI
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps(mock_ai_feedback())
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_groq.chat.completions.create.return_value = mock_resp

        resp = client.post(
            "/submit-answer",
            json={"question_id": 1, "user_answer": "Some answer"},
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "score" in data


@patch("app.get_user_from_token")
def test_submit_session_success(mock_auth, client):
    """Should return final feedback"""
    mock_auth.return_value = (mock_user(), None)

    with patch("app.groq_client") as mock_groq, patch("app.supabase") as mock_sb:
        # Mock Groq client
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps(mock_final_feedback())
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_groq.chat.completions.create.return_value = mock_resp

        # Mock Supabase for session insertion
        mock_session_insert_response = MagicMock()
        mock_session_insert_response.data = [{"id": 123}] # Mock a new session ID
        mock_sb.from_.return_value.insert.return_value.execute.return_value = mock_session_insert_response

        # Mock Supabase for answers insertion
        mock_answers_insert_response = MagicMock()
        mock_answers_insert_response.data = [{"id": 1}, {"id": 2}] # Mock inserted answer IDs
        mock_sb.from_.return_value.insert.return_value.execute.return_value = mock_answers_insert_response

        # Mock Supabase for verification select
        mock_verify_response = MagicMock()
        mock_verify_response.data = [{
            "id": 123,
            "user_id": "test-user-id",
            "topic": "CI/CD",
            "difficulty": "Beginner",
            "final_score": 7.5,
            "final_feedback": "Solid performance, improve on Docker.",
            "answers": [] # Mock empty answers for simplicity in test
        }]
        mock_sb.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_verify_response


        resp = client.post(
            "/submit-session",
            json={
                "session_answers": [
                    {"feedback": {"score": 8}},
                    {"feedback": {"score": 7}},
                ],
                "topic": "CI/CD", # Added topic and difficulty for the test
                "difficulty": "Beginner"
            },
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "id" in data # The backend now returns the full session object
        assert data["final_score"] == 7.5
        assert data["final_feedback"] == "Solid performance, improve on Docker."


@patch("app.get_user_from_token")
def test_delete_all_sessions_success(mock_auth, client):
    """Should delete all sessions for a user"""
    mock_auth.return_value = (mock_user(), None)

    with patch("app.supabase") as mock_sb:
        # Mock the delete operation
        mock_delete_response = MagicMock()
        mock_delete_response.error = None
        mock_sb.from_.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_response

        resp = client.delete("/sessions/all", headers={"Authorization": "Bearer token"})

        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["message"] == "All sessions deleted successfully"


@patch("app.get_user_from_token")
def test_delete_all_sessions_failure(mock_auth, client):
    """Should handle errors during deletion"""
    mock_auth.return_value = (mock_user(), None)

    with patch("app.supabase") as mock_sb:
        # Mock a failed delete operation
        mock_delete_response = MagicMock()
        mock_delete_response.error = MagicMock()
        mock_delete_response.error.message = "Database error"
        mock_sb.from_.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_response

        resp = client.delete("/sessions/all", headers={"Authorization": "Bearer token"})

        assert resp.status_code == 500
        data = json.loads(resp.data)
        assert "error" in data


@pytest.fixture
def mock_supabase():
    # Create mock data with matching topic
    question_data = [{
        "id": 1,
        "question_text": "What is CI/CD?",
        "topic": "CI/CD",  # Changed from 'Containers' to match test expectations
        "difficulty": "easy"
    }]
    
    # Create mock response
    mock = Mock()
    mock_execute = Mock()
    mock_execute.data = question_data
    
    # Setup method chain
    mock.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_execute
    
    # Mock user authentication
    mock_user = SimpleNamespace(
        user={"id": "test-user-id", "email": "test@example.com"}
    )
    mock.auth.get_user.return_value = mock_user
    
    return mock

def test_get_questions_success(client, mock_supabase):
    with patch('app.supabase', mock_supabase):
        response = client.get('/questions?topic=CI/CD&difficulty=easy&count=1')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['topic'] == 'CI/CD'  # This assertion was failing

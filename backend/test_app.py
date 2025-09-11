import pytest
import json
from unittest.mock import patch, MagicMock
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
    mock.user = {"id": "test-user-id", "email": "test@example.com"}
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


def test_get_questions_success(client):
    """Should return questions list"""
    with patch("app.supabase") as mock_sb:
        mock_exec = MagicMock()
        mock_exec.data = mock_questions()
        mock_sb.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_exec

        resp = client.get("/questions?topic=CI/CD&difficulty=Beginner&count=1")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert isinstance(data, list)
        assert data[0]["topic"] == "CI/CD"


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
    mock_auth.return_value = ({"id": "u"}, None)

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
    mock_auth.return_value = ({"id": "u"}, None)

    with patch("app.groq_client") as mock_groq:
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps(mock_final_feedback())
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_groq.chat.completions.create.return_value = mock_resp

        resp = client.post(
            "/submit-session",
            json={
                "session_answers": [
                    {"feedback": {"score": 8}},
                    {"feedback": {"score": 7}},
                ]
            },
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "overall_score" in data
        assert "final_feedback" in data

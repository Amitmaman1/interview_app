import pytest
import json
from unittest.mock import patch, Mock
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture
def mock_supabase():
    mock = Mock()
    # Create a chain of mock returns
    mock.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = Mock(
        data=[{"id": 1, "question_text": "Test Question", "topic": "DevOps", "difficulty": "easy"}]
    )
    return mock

@pytest.fixture
def mock_groq():
    mock = Mock()
    mock.chat.completions.create.return_value = Mock(
        choices=[
            Mock(
                message=Mock(
                    content='{"score": 8, "summary": "Good answer", "corrections": "None"}'
                )
            )
        ]
    )
    return mock

def test_home_route(client):
    """Test that the home route works"""
    with patch('app.send_from_directory') as mock_send:
        mock_send.return_value = "Mock HTML content"
        response = client.get('/')
        assert response.status_code == 200

def test_questions_route_missing_params(client):
    """Test questions route without parameters"""
    with patch('app.supabase') as mock_supabase:
        mock_supabase.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        response = client.get('/questions')
        assert response.status_code == 404

@patch('app.supabase')
def test_questions_route_with_mock(mock_supabase, client):
    """Test questions route with mocked data"""
    mock_questions = [
        {
            "id": 1,
            "question_text": "What is CI/CD?",
            "topic": "CI/CD",
            "difficulty": "Beginner"
        }
    ]
    mock_supabase.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = mock_questions
    response = client.get('/questions?topic=CI/CD&difficulty=Beginner&count=1')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data) == 1
    assert data[0]['topic'] == 'CI/CD'

# -------------------
# Updated tests with mocked get_user_from_token
# -------------------

@patch('app.get_user_from_token')
def test_submit_answer_missing_data(mock_get_user, client):
    """Test submit answer with missing data (mock auth)"""
    # Mock authentication to return a fake user
    mock_get_user.return_value = ({"id": "123"}, None)
    response = client.post('/submit-answer', json={})
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "Missing" in data['error']

@patch('app.get_user_from_token')
def test_submit_session_missing_data(mock_get_user, client):
    """Test submit session with missing data (mock auth)"""
    # Mock authentication to return a fake user
    mock_get_user.return_value = ({"id": "123"}, None)
    response = client.post('/submit-session', json={})
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "Missing" in data['error']

# New tests based on code block suggestions

def test_get_questions(client, mock_supabase):
    with patch('app.supabase', mock_supabase):
        response = client.get('/questions?topic=DevOps&difficulty=easy&count=1')
        assert response.status_code == 200
        assert len(response.json) == 1
        assert 'question_text' in response.json[0]

def test_submit_answer(client, mock_supabase, mock_groq):
    with patch('app.supabase', mock_supabase), patch('app.groq_client', mock_groq):
        response = client.post('/submit-answer', 
            json={
                "question_id": 1,
                "user_answer": "Test answer"
            },
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 200
        assert "score" in response.json

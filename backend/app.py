import os
import json
from flask import Flask, request, jsonify, send_from_directory, Blueprint  # [CHANGED] Added Blueprint import
from flask_cors import CORS
from supabase import create_client, Client
from groq import Groq
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize Flask and CORS
app = Flask(__name__, static_folder='static')
CORS(app)  # [UNCHANGED] Keep global CORS configuration

# [ADDED] Create API blueprint with /api prefix
api_bp = Blueprint('api', __name__, url_prefix='/api')

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY
    )

# Initialize Groq client
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = None

if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

class Session:
    def __init__(self, id, user_id, topic, difficulty, created_at, final_score, final_feedback, answers=None):
        self.id = id
        self.user_id = user_id
        self.topic = topic
        self.difficulty = difficulty
        self.created_at = created_at
        self.final_score = final_score
        self.final_feedback = final_feedback
        self.answers = answers if answers is not None else []

def get_session_by_id(session_id):
    if not supabase:
        return None

    try:
        response = supabase.from_("sessions").select("*").eq("id", session_id).single().execute()
        session_data = response.data

        if session_data:
            answers_response = supabase.from_("answers").select("*").eq("session_id", session_data['id']).execute()
            answers_data = answers_response.data or []

            # Enrich answers with question_text
            try:
                question_ids = [a.get('question_id') for a in answers_data if a.get('question_id') is not None]
                if question_ids:
                    # Fetch all related questions in one call
                    questions_resp = supabase.from_("questions").select("id, question_text").in_("id", question_ids).execute()
                    questions_map = {q['id']: q.get('question_text') for q in (questions_resp.data or [])}
                    for a in answers_data:
                        qid = a.get('question_id')
                        a['question_text'] = questions_map.get(qid)
            except Exception:
                # If enrichment fails, proceed without question_text
                pass

            return Session(
                session_data['id'],
                session_data['user_id'],
                session_data['topic'],
                session_data['difficulty'],
                session_data['created_at'],
                session_data['final_score'],
                session_data['final_feedback'],
                answers_data
            )
        return None
    except Exception as e:
        print(f"Error fetching session by ID: {e}")
        return None

def get_user_from_token(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None, (jsonify({"error": "Missing Authorization header"}), 401)
    
    parts = auth_header.split()
    if parts[0].lower() != 'bearer' or len(parts) != 2:
        return None, (jsonify({"error": "Invalid Authorization header format"}), 401)
        
    token = parts[1]
    
    try:
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return user_response.user, None
        else:
            return None, (jsonify({"error": "Invalid or expired token"}), 401)
    except Exception as e:
        return None, (jsonify({"error": f"Token validation failed: {str(e)}"}), 401)

# [MOVED] Config endpoint moved under /api via blueprint
@api_bp.route("/config")
@app.route("/config")  # [ADDED] Backward-compatible root route
def get_config():
    return jsonify({
        "supabaseUrl": os.environ.get("SUPABASE_URL"),
        "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY")
    })

# [UNCHANGED] Keep static index at root level
@app.route("/")
def serve_frontend():
    return send_from_directory('static', 'index.html')

# [UNCHANGED] Keep static assets at root level
@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory('static', path)

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/sessions", methods=["GET"])
@app.route("/sessions", methods=["GET"])  # [ADDED] Backward-compatible root route
def get_sessions():
    if not supabase:
        return jsonify({"error": "Database not configured"}), 500

    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response

    try:
        response = supabase.from_("sessions").select("*").eq('user_id', user.id).execute()
        return jsonify(response.data), 200
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return jsonify({"error": "Internal server error"}), 500
        

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route('/sessions/<session_id>', methods=['GET'])
@app.route('/sessions/<session_id>', methods=['GET'])  # [ADDED] Backward-compatible root route
def get_single_session(session_id):
    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response

    session = get_session_by_id(session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    
    if str(session.user_id) != str(user.id):
        return jsonify({"error": "Unauthorized access to session"}), 403

    return jsonify(session.__dict__)

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/questions", methods=["GET"])
@app.route("/questions", methods=["GET"])  # [ADDED] Backward-compatible root route
def get_questions():
    if not supabase:
        return jsonify({"error": "Database not configured"}), 500
        
    topic = request.args.get("topic")
    difficulty = request.args.get("difficulty")
    count = int(request.args.get("count", 5))

    try:
        response = supabase.from_("questions") \
            .select("*") \
            .eq("topic", topic) \
            .eq("difficulty", difficulty) \
            .execute()
            
        questions = response.data
        
        if not questions:
            return jsonify({"message": "No questions found for the specified topic and difficulty."} ), 404
        
        import random
        selected_questions = random.sample(questions, min(count, len(questions)))
        return jsonify(selected_questions), 200
        
    except Exception as e:
        print(f"Error fetching questions: {e}")
        return jsonify({"error": "Internal server error"}), 500

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/submit-answer", methods=["POST"])
@app.route("/submit-answer", methods=["POST"])  # [ADDED] Backward-compatible root route
def submit_answer():
    if not supabase or not groq_client:
        return jsonify({"error": "Service not configured"}), 500
    
    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response
        
    data = request.json
    question_id = data.get("question_id")
    user_answer = data.get("user_answer")

    if not all([question_id, user_answer]):
        return jsonify({"error": "Missing question_id or user_answer"}), 400

    try:
        response = supabase.from_('questions').select('*').eq('id', question_id).single().execute()
        question = response.data

        if not question:
            return jsonify({"error": "Question not found"}), 404

        # Updated prompt: score based on quality, not length
        prompt = (
            "You are a DevOps interview assistant. Evaluate this answer as if it "
            "were given in a real-world interview. Focus on the candidate's core "
            "understanding, practical knowledge, and ability to articulate key "
            "concepts concisely.\n\n"
            "Do NOT require a minimum word count. A short but correct answer should "
            "get a high score; a long but confused or incorrect answer should get a low score.\n\n"
            f"Question: {question['question_text']}\n"
            f"User's Answer: {user_answer}\n\n"
            "Provide feedback as a JSON object with this structure:\n"
            '{\"score\": int, \"summary\": \"string\", \"corrections\": \"string\"}\\n' 
            "Score should be from 1 to 10, reflecting a realistic interview grade based on "
            "accuracy, understanding, and practical relevance, regardless of answer length."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a DevOps expert providing interview feedback."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )

        ai_feedback = json.loads(chat_completion.choices[0].message.content)
        return jsonify(ai_feedback), 200

    except Exception as e:
        print(f"Error processing submission: {e}")
        return jsonify({"error": f"An internal server error occurred: {str(e)}"}), 500

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/submit-session", methods=["POST"])
@app.route("/submit-session", methods=["POST"])  # [ADDED] Backward-compatible root route
def submit_session():
    if not groq_client or not supabase:
        print("ERROR: Services not configured")  # Add logging
        return jsonify({"error": "Service not configured"}), 500
        
    user, error_response = get_user_from_token(request)
    if error_response:
        print(f"ERROR: Authentication failed - {error_response}")  # Add logging
        return error_response

    data = request.json
    print(f"Received data: {data}")  # Add logging
    session_answers = data.get("session_answers")
    topic = data.get("topic")
    difficulty = data.get("difficulty")

    if not session_answers:
        print("ERROR: No session answers provided")  # Add logging
        return jsonify({"error": "Missing session_answers"}), 400

    try:
        total_score = sum(item['feedback']['score'] for item in session_answers)
        final_score = round(total_score / len(session_answers), 1)

        # Prepare a clean summary of answers for the prompt
        answers_summary = []
        for item in session_answers:
            answers_summary.append({
                "user_answer": item.get('user_answer'),
                "feedback": {
                    "score": item.get('feedback', {}).get('score'),
                    "summary": item.get('feedback', {}).get('summary')
                }
            })

        prompt = (
            f"You are a DevOps expert providing a final summary for a practice interview session. "
            f"The user's average score was {final_score} out of 10. "
            f"Here is a summary of their answers and the feedback they received:\n"
            f"{json.dumps(answers_summary, indent=2)}\n\n"
            f"Based on this, provide a concise and encouraging overall feedback summary. "
            f"Focus on their strengths and suggest 1-2 key areas for improvement. "
            f"Keep it to a few sentences.\n\n"
            f"Return a JSON object with a single key, \"final_feedback\", which holds your summary as a string."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful DevOps assistant."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )

        feedback_obj = json.loads(chat_completion.choices[0].message.content)
        final_feedback_text = feedback_obj.get("final_feedback", "Could not generate final feedback.")

        print(f"DEBUG: Calculated total_score: {total_score}")
        print(f"DEBUG: Calculated final_score: {final_score}")
        print(f"DEBUG: Generated final_feedback_text: {final_feedback_text}")

        # --- Database Insertion Logic ---
        # 1. Create the session
        print("---", "INSERTING SESSION", " ---")
        session_insert_response = supabase.from_("sessions").insert({
            "user_id": user.id,
            "topic": topic,
            "difficulty": difficulty,
            "final_score": final_score,
            "final_feedback": final_feedback_text
        }).execute()
        print(f"Session insert response: {session_insert_response.data}")

        if not session_insert_response.data:
            raise Exception("Failed to create session in database.")

        new_session_id = session_insert_response.data[0]['id']
        print(f"New session ID: {new_session_id}")
  
        # 2. Prepare and insert all answers
        answers_to_insert = []
        for item in session_answers:
            answers_to_insert.append({
                "session_id": new_session_id,
                "question_id": item.get("question_id"),
                "user_answer": item.get("user_answer"),
                "score": item.get("feedback", {}).get("score"),
                "summary": item.get("feedback", {}).get("summary"),
                "corrections": item.get("feedback", {}).get("corrections")
            })
        
        print("---", "INSERTING ANSWERS", " ---")
        answers_insert_response = supabase.from_("answers").insert(answers_to_insert).execute()
        print(f"Answers insert response: {answers_insert_response.data}")

        # 3. Verify the insert
        print("---", "VERIFYING INSERT", " ---")
        verify_response = supabase.from_("sessions").select("*, answers(*)").eq("id", new_session_id).execute()
        print(f"Verification SELECT response: {verify_response.data}")
        print("---", "END VERIFYING INSERT", " ---")
        
        return jsonify(verify_response.data[0]), 200

    except Exception as e:
        print(f"Error submitting session: {e}")
        return jsonify({"error": "An error occurred while finalizing the session"}), 500





# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/sessions/<session_id>", methods=["DELETE"])
@app.route("/sessions/<session_id>", methods=["DELETE"])  # [ADDED] Backward-compatible root route
def delete_session(session_id):
    """Delete a specific session by ID"""
    if not supabase:
        return jsonify({"error": "Database not configured"}), 500

    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response

    try:
        # Delete the specific session for the given user
        response = supabase.from_("sessions").delete().eq('id', session_id).eq('user_id', user.id).execute()

        # Check for errors in the response
        if hasattr(response, 'error') and response.error:
            raise Exception(response.error.message)

        return jsonify({"message": "Session deleted successfully"}), 200

    except Exception as e:
        print(f"Error deleting session {session_id}: {e}")
        return jsonify({"error": "An error occurred while deleting the session"}), 500

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/sessions/all", methods=["DELETE"])
@app.route("/sessions/all", methods=["DELETE"])  # [ADDED] Backward-compatible root route
def delete_all_sessions():

    if not supabase:
        return jsonify({"error": "Database not configured"}), 500

    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response

    try:
        # This will delete all sessions for the given user.
        # Assumes that RLS is enabled in Supabase for the sessions table
        # or that cascading deletes will handle related data.
        response = supabase.from_("sessions").delete().eq('user_id', user.id).execute()

        # The response for a delete operation might not contain data, 
        # so we check for errors in the response object itself if available
        if hasattr(response, 'error') and response.error:
            raise Exception(response.error.message)

        return jsonify({"message": "All sessions deleted successfully"}), 200

    except Exception as e:
        print(f"Error deleting all sessions: {e}")
        return jsonify({"error": "An error occurred while deleting sessions"}), 500

# [MOVED] API route moved to blueprint with /api prefix
@api_bp.route("/test-connection")
@app.route("/test-connection")  # [ADDED] Backward-compatible root route
def test_connection():
    try:
        response = supabase.from_("sessions").select("count").execute()
        return jsonify({"status": "connected", "data": response.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# [ADDED] Register the API blueprint with the Flask app
app.register_blueprint(api_bp)  # [ADDED] Register the API blueprint with the Flask app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from supabase import create_client, Client
from groq import Groq
from dotenv import load_dotenv


# New: Load environment variables from .env file
load_dotenv() 

# Initialize Flask and CORS
app = Flask(__name__, static_folder='static')
CORS(app)

# Initialize Supabase client only if environment variables are available
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Groq client only if API key is available
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = None

if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

def get_user_from_token(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None, (
            jsonify({"error": "Missing Authorization header"}), 
            401
        )
    
    parts = auth_header.split()
    if parts[0].lower() != 'bearer' or len(parts) != 2:
        return None, (jsonify({"error": "Invalid Authorization header format"}), 401)
        
    token = parts[1]
    
    try:
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return user_response.user, None
        else:
            return None, (
                jsonify({"error": "Invalid or expired token"}),
                401
            )

    except Exception as e:
        return None, (jsonify({"error": f"Token validation failed: {str(e)}"}), 401)


@app.route("/config")
def get_config():
    return jsonify({
        "supabaseUrl": os.environ.get("SUPABASE_URL"),
        "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY")
    })

@app.route("/")
def serve_frontend():
    return send_from_directory('static', 'index.html')

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory('static', path)

@app.route("/questions", methods=["GET"])
def get_questions():
    if not supabase:
        return jsonify({"error": "Database not configured"}), 500
        
    topic = request.args.get("topic")
    difficulty = request.args.get("difficulty")
    count = int(request.args.get("count", 5))  # Convert count to integer

    try:
        # Get all matching questions first
        response = supabase.from_("questions")\
            .select("*")\
            .eq("topic", topic)\
            .eq("difficulty", difficulty)\
            .execute()
            
        questions = response.data
        
        if not questions:
            return (
                jsonify({
                    "message": "No questions found for the specified topic and difficulty."
                }),
                404
            )
        
        # Randomly select 'count' number of questions
        import random
        selected_questions = random.sample(
            questions,
            min(count, len(questions))
        )
        
        return jsonify(selected_questions), 200
        
    except Exception as e:
        print(f"Error fetching questions: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/submit-answer", methods=["POST"])
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
        return jsonify({"error": "Missing question_id, or user_answer"}), 400

    try:
        response = supabase.from_('questions').select('*').eq('id', question_id).single().execute()
        question = response.data

        if not question:
            return jsonify({"error": "Question not found"}), 404

        prompt = (
            f"You are a DevOps interview assistant. Evaluate this answer as if it were "
            f"given in a real-world interview. Focus on the candidate's core understanding, "
            f"practical knowledge, and ability to articulate key concepts concisely. Do not "
            f"expect exhaustive, textbook-level detail. Be lenient with minor omissions if "
            f"the fundamental concept is grasped.\n\n"
            f"Question: {question['question_text']}\n"
            f"User's Answer: {user_answer}\n\n"
            f"Please provide feedback on the user's answer. Your response should be a JSON "
            f"object with the following structure:\n"
            f"{{\"score\": int, \"summary\": \"string\", \"corrections\": \"string\"}}\n"
            f"The score should be from 1 to 10, reflecting a realistic interview grade "
            f"based on accuracy and practical understanding. The summary should evaluate "
            f"the answer's strengths. The corrections should suggest improvements or "
            f"additional points to consider, but avoid penalizing for brevity if the "
            f"answer is otherwise solid."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a DevOps expert providing feedback on interview questions."
                },
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )

        ai_feedback = json.loads(chat_completion.choices[0].message.content)

        # Note: We are not saving the answer here anymore. The frontend will save it after the session is complete.
        # This endpoint is now just for AI evaluation.

        return jsonify(ai_feedback), 200

    except Exception as e:
        print(f"Error processing submission: {e}")
        return jsonify({"error": f"An internal server error occurred: {str(e)}"}), 500

@app.route("/submit-session", methods=["POST"])
def submit_session():
    if not groq_client:
        return jsonify({"error": "Service not configured"}), 500
        
    user, error_response = get_user_from_token(request)
    if error_response:
        return error_response

    data = request.json
    session_answers = data.get("session_answers")

    if not session_answers:
        return jsonify({"error": "Missing session_answers"}), 400

    try:
        total_score = sum(item['feedback']['score'] for item in session_answers)
        overall_score = round(total_score / len(session_answers), 1)

        prompt = (
            f"You are a DevOps expert. The user has completed a practice interview "
            f"session. Their overall performance is an average score of {overall_score} "
            f"out of 10. Their individual answers and feedback were:\n\n"
            f"{json.dumps(session_answers, indent=2)}\n\n"
            f"Provide a short, encouraging summary of their overall performance and "
            f"suggest areas for improvement. Your response should be a JSON object "
            f"with the following keys: 'overall_score' (the calculated score), and "
            f"'final_feedback' (the string summary)."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant."
                },
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )

        final_feedback = json.loads(chat_completion.choices[0].message.content)
        
        return jsonify(final_feedback), 200

    except Exception as e:
        print(f"Error submitting session: {e}")
        return jsonify({"error": "An error occurred while finalizing the session"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)


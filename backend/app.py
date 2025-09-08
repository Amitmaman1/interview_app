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

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Groq client
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

@app.route("/")
def serve_frontend():
    return send_from_directory('static', 'index.html')

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory('static', path)

@app.route("/questions", methods=["GET"])
def get_questions():
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
            return jsonify({"message": "No questions found for the specified topic and difficulty."}), 404
        
        # Randomly select 'count' number of questions
        import random
        selected_questions = random.sample(questions, min(count, len(questions)))
        
        return jsonify(selected_questions), 200
        
    except Exception as e:
        print(f"Error fetching questions: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/submit-answer", methods=["POST"])
def submit_answer():
    data = request.json
    user_id = data.get("user_id")
    question_id = data.get("question_id")
    user_answer = data.get("user_answer")

    if not all([user_id, question_id, user_answer]):
        return jsonify({"error": "Missing user_id, question_id, or user_answer"}), 400

    try:
        response = supabase.from_('questions').select('*').eq('id', question_id).single().execute()
        question = response.data

        if not question:
            return jsonify({"error": "Question not found"}), 404

        prompt = (
            f"You are a DevOps interview assistant. Evaluate this answer based on technical accuracy, completeness, and clarity:\n\n"
            f"Question: {question['question_text']}\n"
            f"User's Answer: {user_answer}\n\n"
            f"Please provide feedback on the user's answer. Your response should be a JSON object with the following structure:\n"
            f'{{"score": int, "summary": "string", "corrections": "string"}}\n'
            f"The score should be from 1 to 10, based on technical accuracy and completeness. The summary should evaluate the answer's strengths. The corrections should suggest improvements or additional points to consider. dont be scared to give more than grade 8"
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a DevOps expert providing feedback on interview questions."},
                {"role": "user", "content": prompt}
            ],
            model="llama3-8b-8192",
            response_format={"type": "json_object"}
        )

        ai_feedback = json.loads(chat_completion.choices[0].message.content)

        # Store the answer
        supabase.from_('answers').insert({
            'user_id': user_id,
            'question_id': question_id,
            'user_answer': user_answer,
            'ai_feedback': ai_feedback
        }).execute()

        return jsonify(ai_feedback), 200

    except Exception as e:
        print(f"Error processing submission: {e}")
        return jsonify({"error": f"An internal server error occurred: {str(e)}"}), 500

@app.route("/submit-session", methods=["POST"])
def submit_session():
    data = request.json
    user_id = data.get("user_id")
    session_answers = data.get("session_answers")

    if not all([user_id, session_answers]):
        return jsonify({"error": "Missing user_id or session_answers"}), 400

    try:
        total_score = sum(item['feedback']['score'] for item in session_answers)
        overall_score = round(total_score / len(session_answers), 1)

        prompt = (
            f"You are a DevOps expert. The user has completed a practice interview session. Their overall performance is an average score of {overall_score} out of 10. "
            f"Their individual answers and feedback were:\n\n"
            f"{json.dumps(session_answers, indent=2)}\n\n"
            f"Provide a short, encouraging summary of their overall performance and suggest areas for improvement. Your response should be a JSON object with the following keys: 'overall_score' (the calculated score), and 'final_feedback' (the string summary)."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            model="llama3-8b-8192",
            response_format={"type": "json_object"}
        )

        final_feedback = json.loads(chat_completion.choices[0].message.content)
        
        return jsonify(final_feedback), 200

    except Exception as e:
        print(f"Error submitting session: {e}")
        return jsonify({"error": "An error occurred while finalizing the session"}), 500

if __name__ == "__main__":
    app.run(debug=True)
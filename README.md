# DevOps Interview Practice App

A web app I built to practice DevOps interview questions. It uses AI to generate questions and provide feedback on your answers. Built with Flask, vanilla JS, and deployed on Kubernetes.



## What it does

- Generates DevOps interview questions using Groq AI
- Scores your answers and gives you feedback
- Tracks your practice sessions over time
- Covers different topics and difficulty levels

## Tech Stack

**Backend**: Flask + Supabase (PostgreSQL) + Groq AI  
**Frontend**: HTML/CSS/JavaScript + Nginx  
**Infrastructure**: Docker, Kubernetes, EKS, ArgoCD

## Quick Start

```bash
# Clone and set up
git clone https://github.com/Amitmaman1/interview_app.git
cd interview_app
cp backend/.env.example backend/.env
# Add your API keys to backend/.env

# Run with Docker
docker compose up -d
```

Visit http://localhost:8080

## Deployment

The app can be deployed several ways:
- **Docker Compose**: For local dev
- **Kubernetes**: Raw manifests in `/kubernetes`
- **Helm**: Chart in `/interview-chart`
- **GitOps**: Via ArgoCD (recommended)

## Project Structure

```
interview_app/
├── backend/              # Flask API
├── frontend/             # Static site + Nginx
├── interview-chart/      # Helm chart
└── kubernetes/           # K8s manifests
```

## API Endpoints

- `POST /api/sessions` - Create practice session
- `POST /api/generate-question` - Get a question
- `POST /api/submit-answer` - Submit answer for scoring
- `GET /api/users/:id/sessions` - Get user history

## Environment Variables

Backend needs these in `.env`:
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_ANON_KEY`
- `GROQ_API_KEY`

## Related Repos

This is part of a 3-repo setup:
- **Infrastructure**: [interview_app-infra](https://github.com/Amitmaman1/interview_app-infra) - Terraform configs for AWS/EKS
- **GitOps**: [interview_app-gitops](https://github.com/Amitmaman1/interview_app-gitops) - ArgoCD application configs

## License

MIT

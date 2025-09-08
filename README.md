DevOps Interview Practice App

web app for practicing devops interview questions

includes flask backend and static frontend containerized with Docker and run together with docker-compose.

how to run:

docker compose up -d

This will:

start the backend on port 5000

serve the frontend on port 8080

open http://localhost:8080

CICD

github actions workflow that builds and pushes images to ecr
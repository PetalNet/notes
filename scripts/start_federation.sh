#!/bin/bash

# Function to kill all child processes on exit
cleanup() {
    echo "Stopping servers..."
    # Kill all child processes in the same process group
    kill 0
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT SIGTERM EXIT

# Start Server A (Alice)
echo "Starting Alice (Server A) on port 5173..."
DATABASE_URL=file:local-a.db ORIGIN=http://localhost:5173 pnpm run dev --port 5173 &

# Start Server B (Bob)
echo "Starting Bob (Server B) on port 5174..."
DATABASE_URL=file:local-b.db ORIGIN=http://localhost:5174 pnpm run dev --port 5174 &

# Wait for both processes to keep the script running
wait

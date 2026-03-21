#!/bin/sh
# Start the app stack and enable Tailscale Funnel on port 5000 so you don't have to run "tailscale funnel 5000" manually.
# Requires: Tailscale installed and logged in on this machine.

set -e
cd "$(dirname "$0")/.."

echo "Starting app stack..."
docker compose up -d

echo "Waiting for app to be ready..."
sleep 5

echo "Enabling Tailscale Funnel on port 5000 (background)..."
sudo tailscale funnel --bg 5000

echo "Done. App is up and Funnel is on. Check 'tailscale funnel status' for the public URL."

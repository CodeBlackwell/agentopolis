default:
    @just --list

# Run the hotel on http://localhost:4242 (auto-kills stale servers)
dev:
    -@lsof -ti :4242 | xargs kill 2>/dev/null
    uv run uvicorn server:app --port 4242

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run python hooks.py attach

# Remove the hotel's hooks
detach:
    uv run python hooks.py detach

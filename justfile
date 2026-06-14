default:
    @just --list

# Run the nation for the BLACKBOX workspace on http://localhost:4242 with hot reload
dev:
    -lsof -ti :4242 | xargs kill -9 2>/dev/null
    @echo "Botapest Nation on http://localhost:4242 (nation: ..)"
    @sleep 1 && open http://localhost:4242 &
    BOTAPEST_ROOT=.. uv run uvicorn botapest.server:app --reload --reload-dir botapest --port 4242 --log-level warning

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run botapest attach

# Remove the city's hooks
detach:
    uv run botapest detach

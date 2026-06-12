default:
    @just --list

# Run the city for ../maisight on http://localhost:4242 (auto-kills stale servers)
dev:
    uv run botapest --repo ../maisight --zone city/maisight.json

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run botapest attach

# Remove the city's hooks
detach:
    uv run botapest detach

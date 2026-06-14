default:
    @just --list

# Run the nation for the BLACKBOX workspace on http://localhost:4242 with hot reload
dev:
    -lsof -ti :4242 | xargs kill -9 2>/dev/null
    @echo "Agentopolis Nation on http://localhost:4242 (nation: ..)"
    @sleep 1 && open http://localhost:4242 &
    exec env AGENTOPOLIS_ROOT=.. .venv/bin/uvicorn agentopolis.server:app --reload --reload-dir agentopolis --port 4242 --log-level warning

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run agentopolis attach

# Remove the city's hooks
detach:
    uv run agentopolis detach

# Regenerate the Homebrew formula from the published PyPI release (run after `uv publish`)
brew-formula version=`grep '^version' pyproject.toml | cut -d'"' -f2`:
    @url=$(curl -s https://pypi.org/pypi/agentopolis/{{version}}/json | python3 -c "import sys,json;print(next(u['url'] for u in json.load(sys.stdin)['urls'] if u['packagetype']=='sdist'))"); \
     sha=$(curl -s https://pypi.org/pypi/agentopolis/{{version}}/json | python3 -c "import sys,json;print(next(u['digests']['sha256'] for u in json.load(sys.stdin)['urls'] if u['packagetype']=='sdist'))"); \
     sed -i '' -E "s|^  url .*|  url \"$url\"|; s|^  sha256 .*|  sha256 \"$sha\"|" packaging/homebrew/agentopolis.rb && \
     cp packaging/homebrew/agentopolis.rb "$(brew --repository)/Library/Taps/codeblackwell/homebrew-tap/Formula/agentopolis.rb" && \
     brew update-python-resources agentopolis && \
     cp "$(brew --repository)/Library/Taps/codeblackwell/homebrew-tap/Formula/agentopolis.rb" packaging/homebrew/agentopolis.rb && \
     echo "formula updated to {{version}} — commit packaging/homebrew/agentopolis.rb and push the tap"

FROM python:3.12-slim

# git: forge clones public repos at request time
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir ".[card]"

# showcase mode: serve the baked BLACKBOX fixtures, no live git on this repo.
# the demo lands on one impressive city; ?nation still opens the full map.
ENV AGENTOPOLIS_SHOWCASE=/app/agentopolis/showcase
ENV AGENTOPOLIS_DEMO_CITY=SPICE
# absolute base for og:image so shared links unfurl with the captured skyline
ENV AGENTOPOLIS_PUBLIC_URL=https://agentopolis.codeblackwell.ai
# funnel counters persist here across rebuilds (compose mounts /data as a volume)
ENV AGENTOPOLIS_STATS_FILE=/data/stats.json
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "agentopolis.server:app", "--host", "0.0.0.0", "--port", "8000"]

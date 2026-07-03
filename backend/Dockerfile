FROM registry.ymdd.tech/library/python:3.12-uv

WORKDIR /app

# Install curl for utility/healthchecks if needed
RUN for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
        if [ -f "$f" ]; then \
            sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/security.ubuntu.com/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/deb.debian.org/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/security.debian.org/mirrors.aliyun.com/g' "$f"; \
        fi; \
    done && \
    apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first to leverage Docker cache
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Copy backend and base_agent modules
COPY backend /app/backend
COPY base_agent /app/base_agent

# Configure Python environment
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend:/app
ENV PORT=5000

EXPOSE 5000

WORKDIR /app/backend

# Run with Gunicorn, setting high timeout (120s+) for SSE (AI agent) compatibility
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "120", "--keep-alive", "5", "run:app"]

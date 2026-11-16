FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
COPY agent.py .

RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONUNBUFFERED=1

CMD ["python", "agent.py"]
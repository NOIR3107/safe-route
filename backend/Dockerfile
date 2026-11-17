FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# docker-start.sh migrates both databases, seeds an empty one, then serves.
CMD ["sh", "docker-start.sh"]

FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy main script
COPY main.py /app/

# Expose WebSocket port
EXPOSE 8000

# Run the WebSocket server
CMD ["python", "main.py"]
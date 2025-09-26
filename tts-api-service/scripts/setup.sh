#!/bin/bash

# Setup script for TTS API development environment

echo "🚀 Setting up TTS API development environment..."

# Create required directories
mkdir -p logs uploads keys ssl

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from example"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building project..."
npm run build

# Setup Git hooks
echo "🪝 Setting up Git hooks..."
npx husky install

# Create demo Google Cloud service account key placeholder
if [ ! -f keys/google-cloud-key.json ]; then
    echo '{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "your-private-key",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}' > keys/google-cloud-key.json
    echo "⚠️  Created placeholder Google Cloud key file - please replace with your actual key"
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your configuration"
echo "2. Replace keys/google-cloud-key.json with your actual Google Cloud service account key"
echo "3. Start Redis: docker run -d -p 6379:6379 redis:alpine"
echo "4. Run the development server: npm run dev"
echo ""
echo "🎉 Happy coding!"
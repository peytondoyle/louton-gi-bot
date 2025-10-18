// This script creates credentials.json from environment variables
// Run this on Replit after setting up Secrets

const fs = require('fs');

// Check if credentials.json already exists
if (fs.existsSync('credentials.json')) {
    console.log('✅ credentials.json already exists');
    process.exit(0);
}

// Check if we're in Replit environment
if (!process.env.REPL_ID) {
    console.log('⚠️  Not running in Replit environment');
    process.exit(0);
}

// Build credentials from environment variables
const credentials = {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID || "your-project-id",
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || "your-key-id",
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || "-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n",
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "service-account@project.iam.gserviceaccount.com",
    client_id: process.env.GOOGLE_CLIENT_ID || "client-id",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'service-account@project.iam.gserviceaccount.com')}`,
    universe_domain: "googleapis.com"
};

// Write credentials.json
try {
    fs.writeFileSync('credentials.json', JSON.stringify(credentials, null, 2));
    console.log('✅ Created credentials.json from environment variables');
    console.log('🔒 This file is in .gitignore and won\'t be committed');
} catch (error) {
    console.error('❌ Failed to create credentials.json:', error);
    process.exit(1);
}
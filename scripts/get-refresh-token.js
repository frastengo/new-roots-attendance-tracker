require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const REDIRECT_URI = 'http://localhost:53682/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') return;

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code received. Check the terminal.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end('Success! You can close this tab and return to the terminal.');
    console.log('\nAdd this line to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    res.end('Token exchange failed. Check the terminal.');
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(53682, () => {
  console.log('\nOpen this URL in your browser and approve access:\n');
  console.log(authUrl);
  console.log('\nWaiting for you to approve...\n');
});

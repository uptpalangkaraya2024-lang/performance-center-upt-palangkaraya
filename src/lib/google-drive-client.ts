// Shared, server-only Google auth for both Drive (folder/file discovery,
// downloading .xlsx bytes) and Sheets (reading native Google Sheet values).
// Never import this from a Client Component — it reads GOOGLE_PRIVATE_KEY,
// which must never reach the browser.
import "server-only";
import { google } from "googleapis";

interface GoogleClients {
  drive: ReturnType<typeof google.drive>;
  sheets: ReturnType<typeof google.sheets>;
}

let cached: GoogleClients | null = null;

export function getGoogleClients(): GoogleClients {
  if (cached) return cached;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY belum diset — lihat .env.example",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      // Listing folder contents and downloading .xlsx file bytes.
      "https://www.googleapis.com/auth/drive.readonly",
      // Reading cell values from a native Google Sheet via the Sheets API
      // (drive.readonly alone doesn't grant this — different API surface).
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });

  cached = {
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
  return cached;
}

// scripts/get-token.ts
import { google } from "googleapis";
import * as fs from "fs";
import * as readline from "readline";

const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf-8"));
const { client_id, client_secret, redirect_uris } = credentials.installed;

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/gmail.modify"],
});

console.log("Open this URL in your browser:\n", authUrl);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("\nPaste the code from the browser here: ", async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log("\nYour tokens:\n", JSON.stringify(tokens, null, 2));
  console.log("\nCopy REFRESH_TOKEN into your .env.local");
  rl.close();
});
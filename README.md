# WhatsApp Backup Interpreter

A login-gated, local-processing web app for viewing WhatsApp chat export backups in a realistic iOS WhatsApp-style chat UI.


## Features

- Import standard WhatsApp **Export chat** ZIP files.
- Parse the exported chat `.txt` file locally in the browser.
- Reconnect exported media files to their matching chat messages.
- Render the conversation in an iOS WhatsApp-style phone preview.
- Display:
  - text messages
  - image messages
  - transparent stickers
  - videos
  - voice memos
  - audio files
  - document attachments
- Hide common WhatsApp-generated boilerplate notices, including end-to-end encryption messages.
- Clean up exported attachment placeholder text such as `<attached: >` and `<Anhang: >`.
- Choose which participant is **you** so incoming and outgoing bubbles align correctly.
- Change the displayed profile picture by clicking the avatar in the chat header.
- Search by message text, sender, or file name.
- Filter by:
  - all messages
  - text
  - images
  - media
- Search for messages from a specific date.
- Show general chat info on the left.
- Show detailed stats on the right:
  - total messages
  - participant count
  - file count
  - total words
  - average words per message
  - image and video counts
  - most messages
  - most words
  - per-participant message and word percentages
- Report issues through a local `mailto:` link.

## Privacy And Security

- Chat backups are processed locally on your own computer.
- The selected ZIP file is read by your browser.
- Usernames are stored as cleartext account metadata.
- No media is uploaded.
- The app does not save imported chat data to browser storage.
- Refreshing or closing the page clears the imported chat from memory.
- Media previews use temporary local browser object URLs.

After installing dependencies, the app itself can be used without internet access.




- email/password auth enabled
- email confirmation disabled
- allowed site URL set to `https://whatsappinterpreter.marfeyx.ch`

## Supported Backups

Supported:

- WhatsApp **Export chat** ZIP files
- Exports with or without media
- Common WhatsApp media files such as images, stickers, videos, audio, voice notes, and documents

Not supported:

- Encrypted WhatsApp database backups
- Android `msgstore.db.crypt*` database files
- iCloud WhatsApp backups

## Requirements

Install these first:

- [Node.js](https://nodejs.org/) version 20 or newer
- npm, included with Node.js

Check your installation:

```powershell
node --version
npm --version
```

## Local Development Tutorial

1. Clone or download this project.

2. Open a terminal in the project folder.

3. Install dependencies:

```powershell
npm install
```

4. Start the local development server:

```powershell
npm run dev
```

5. Open the local URL shown in the terminal. By default it is:

```text
http://127.0.0.1:5173
```

This URL runs on your own computer.

## Production Build Tutorial

Create a production build:

```powershell
npm run build
```

The built files are created in:

```text
dist/
```

Preview the production build locally:

```powershell
npm run preview
```

The preview command will print a local URL in the terminal.

## How To Export A WhatsApp Chat

On your phone:

1. Open WhatsApp.
2. Open the chat you want to export.
3. Open the chat info or menu.
4. Select **Export chat**.
5. Choose **Include media** if you want images, stickers, videos, voice memos, and documents to appear.
6. Save or transfer the exported `.zip` file to your PC.

In the app:

1. Click **Choose WhatsApp export ZIP**.
2. Select the exported ZIP file.
3. Choose your own name from the **My name** dropdown.
4. Click the avatar in the chat header if you want to set a profile picture.
5. Use search, date search, or filters to inspect the chat.

## GitHub Safety

The repository includes `.gitignore` rules for common private data:

- WhatsApp export ZIPs
- exported `.txt` chat files
- images, stickers, videos, audio, voice notes, and documents
- contact cards
- `.env` files
- log files
- `node_modules/`
- `dist/`

Before pushing, you can verify what Git will include:

```powershell
git status --short
```

To check ignored files too:

```powershell
git status --short --ignored
```

Do not commit personal WhatsApp exports, private media, screenshots, or profile pictures.

## Troubleshooting

If no chat appears, confirm the ZIP contains a WhatsApp export `.txt` file.

If media does not appear, export the chat again and choose **Include media**.

If the app does not start, reinstall dependencies:

```powershell
npm install
```

If the build fails, run:

```powershell
npm run build
```

and check the terminal error output.

## Issue Reports

Use the **Report issues** button in the app, or email:

```text
contact.marfeyx@gmail.com
```

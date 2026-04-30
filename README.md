# WhatsApp Backup Interpreter

A local-only web app for viewing WhatsApp chat exports in a realistic WhatsApp-style mobile UI.

The app runs on your own PC. Chat text and media are not uploaded anywhere. The selected ZIP file is read by your browser locally, and imported chat data is kept in memory only.

## What It Does

- Opens WhatsApp "Export chat" ZIP files.
- Parses the exported chat `.txt` file.
- Reconnects included media files to matching chat messages.
- Shows messages in a WhatsApp-style mobile chat view.
- Displays images, video, audio, and document attachments.
- Lets you choose which participant is "you" so messages align correctly.
- Supports search and filters for text, images, media, documents, and system messages.

## Requirements

Install these first:

- [Node.js](https://nodejs.org/) version 20 or newer
- npm, which is included with Node.js

To check whether they are installed, run:

```powershell
node --version
npm --version
```

## How To Run It

Open a terminal in this project folder and run:

```powershell
npm install
npm run dev
```

Then open the local address shown in the terminal. By default it is usually:

```text
http://127.0.0.1:5173
```

This address is local to your own computer.

## How To Export A WhatsApp Chat

On your phone:

1. Open the WhatsApp chat.
2. Open the chat info or menu.
3. Choose **Export chat**.
4. Choose **Include media** if you want images, audio, videos, and documents to appear.
5. Save or send the exported `.zip` file to your PC.

In the app:

1. Click **Choose WhatsApp export ZIP**.
2. Select the exported ZIP file.
3. Choose your own name in the **My name** dropdown.
4. Browse, search, or filter the rendered chat.

## Privacy And Security

- The app does not upload your backup.
- There is no backend server that receives your chat.
- ZIP parsing happens inside your browser.
- Media previews are created from local browser object URLs.
- Imported chat data is not saved to browser storage.
- Refreshing or closing the page clears the imported chat from memory.

If you want to be extra strict, you can disconnect from the internet after running `npm install`. The app itself does not need internet access to parse and display a chat export.

## Build A Production Version

To create a production build:

```powershell
npm run build
```

The built files are created in the `dist` folder.

To preview the production build locally:

```powershell
npm run preview
```

## Supported Input

The first version targets standard WhatsApp chat export ZIP files. It does not read encrypted WhatsApp database backups from Android or iCloud.

Best results come from exports that include media, because WhatsApp places the chat text and referenced media files together in the ZIP.

## Troubleshooting

If no chat appears, make sure the ZIP contains a `.txt` chat export file.

If images or other media do not appear, make sure you exported the chat with media included.

If the app cannot start, confirm that Node.js is installed and then run:

```powershell
npm install
```

again inside the project folder.

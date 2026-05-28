# HLibrary

HLibrary is a local-first HTML management console built with Next.js. It is designed for quickly organizing, previewing, and reading saved HTML reports by project folder.

## Features

- Scan local `.html` files from the workspace root.
- Automatically group files by their top-level project folder.
- Import a single HTML file or import every HTML file inside a folder.
- Rename projects by renaming the backing top-level folder.
- Search by title, path, tags, notes, and extracted text snippet.
- Filter by all files, favorites, archived files, projects, and tags.
- Open an HTML file in a full-page reader view.
- Edit file metadata through a drawer: filename, directory, tags, and notes.
- View and edit raw HTML source.
- Duplicate, archive, favorite, and move files to the local trash.
- Fixed-screen layout with paginated cards and animated view transitions.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Local filesystem APIs
- CSS transitions with reduced-motion support
- lucide-react icons

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

The app scans the parent directory of this project by default. You can override the scan root with:

```bash
HTML_MANAGER_ROOT=/path/to/html/reports npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run start
```

## Local Data

HLibrary stores management metadata in:

```text
.html-manager/catalog.json
```

The trash folder is:

```text
.html-manager/trash
```

These folders are created under the configured HTML workspace root, not inside the app directory unless the app directory is also the configured root.

## Notes

HLibrary is intended for trusted local HTML archives. Previewed HTML is served from local API routes so it can be read inside the app without using `file://` URLs.

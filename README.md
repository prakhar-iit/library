# Library

A reader for my study notes, published with GitHub Pages. It isn't linked from my portfolio and asks search engines not to index it.

Each note is rendered in the browser straight from its markdown file in [study-notes](https://github.com/prakhar-iit/study-notes), so pushing a change there shows up here without rebuilding this site (GitHub's raw file cache can take a few minutes).

## Files

```
index.html   the library page with a card per note
note.html    the reader: note.html?n=<key>
notes.js     the list of notes and their paths in study-notes
reader.js    fetches, renders and decorates a note
reader.css   reader layout and markdown styling
```

## Add a note

1. Add an entry to `NOTES` in `notes.js`, e.g. `sql: { title: "SQL Notes", path: "study/sql.md" }`.
2. Add a card to `index.html` linking to `note.html?n=sql`.
3. Push to `main`.

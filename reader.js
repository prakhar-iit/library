// Renders one note from the study-notes repo: fetch markdown, convert to HTML, then add
// GitHub-style heading anchors, a table of contents, code highlighting and saved checklists.

const params = new URLSearchParams(location.search);
const key = params.get("n");
const note = NOTES[key];
const docEl = document.getElementById("doc");

const rawUrl = (path) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
const blobUrl = (path) => `https://github.com/${REPO}/blob/${BRANCH}/${path}`;

// Same slug rules GitHub uses, so the notes' own "#section" links keep working.
function slugger() {
  const seen = {};
  return (text) => {
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
      .replace(/ /g, "-");
    if (seen[slug] !== undefined) {
      seen[slug] += 1;
      slug = `${slug}-${seen[slug]}`;
    } else {
      seen[slug] = 0;
    }
    return slug;
  };
}

function addHeadingIds() {
  const slug = slugger();
  docEl.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
    h.id = slug(h.textContent);
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.className = "anchor";
    a.setAttribute("aria-label", "Link to this section");
    a.textContent = "#";
    h.prepend(a);
  });
}

// Links to other notes open in the reader; other relative links go to the file on GitHub.
function rewriteLinks() {
  const base = note.path.split("/").slice(0, -1);
  const byPath = Object.fromEntries(Object.entries(NOTES).map(([k, v]) => [v.path, k]));
  docEl.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (href.startsWith("#") || /^[a-z]+:/i.test(href)) {
      if (/^https?:/i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
      return;
    }
    const [file, hash] = href.split("#");
    const parts = [...base];
    for (const seg of file.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg && seg !== ".") parts.push(seg);
    }
    const resolved = parts.join("/");
    if (byPath[resolved]) {
      a.href = `note.html?n=${byPath[resolved]}${hash ? `#${hash}` : ""}`;
    } else {
      a.href = blobUrl(resolved) + (hash ? `#${hash}` : "");
      a.target = "_blank";
      a.rel = "noopener";
    }
  });
}

function buildToc() {
  const toc = document.getElementById("toc");
  const heads = [...docEl.querySelectorAll("h2, h3")].filter(
    (h) => !/^(table of )?contents$/i.test(h.textContent.replace("#", "").trim())
  );
  if (heads.length < 3) {
    document.querySelector(".toc").hidden = true;
    document.querySelector(".reader").classList.add("no-toc");
    return;
  }
  const ul = document.createElement("ul");
  heads.forEach((h) => {
    const li = document.createElement("li");
    li.className = h.tagName === "H3" ? "sub" : "";
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent.replace(/^#/, "");
    a.dataset.target = h.id;
    li.append(a);
    ul.append(li);
  });
  toc.append(ul);

  // On phones the contents list starts collapsed and closes after a pick.
  const details = document.getElementById("toc-details");
  const narrow = matchMedia("(max-width: 900px)");
  if (narrow.matches) details.open = false;
  toc.addEventListener("click", (e) => {
    if (e.target.tagName === "A" && narrow.matches) details.open = false;
  });

  // Highlight the section currently on screen.
  const links = new Map([...toc.querySelectorAll("a")].map((a) => [a.dataset.target, a]));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        toc.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
        const link = links.get(entry.target.id);
        if (link) {
          link.classList.add("active");
          if (!narrow.matches) link.scrollIntoView({ block: "nearest" });
        }
      });
    },
    { rootMargin: "-80px 0px -70% 0px" }
  );
  heads.forEach((h) => observer.observe(h));
}

// Checklists become clickable; ticks are remembered in this browser only.
function enableChecklists() {
  const boxes = [...docEl.querySelectorAll('input[type="checkbox"]')];
  if (!boxes.length) return;
  const storeKey = `ticks:${key}`;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
  } catch (e) {}

  const progress = document.getElementById("progress");
  const update = () => {
    const done = boxes.filter((b) => b.checked).length;
    const pct = Math.round((done / boxes.length) * 100);
    progress.innerHTML = `<span>${done} / ${boxes.length} done</span><div class="bar"><div style="width:${pct}%"></div></div>`;
  };

  boxes.forEach((b, i) => {
    b.disabled = false;
    if (saved[i] !== undefined) b.checked = saved[i];
    b.addEventListener("change", () => {
      saved[i] = b.checked;
      try {
        localStorage.setItem(storeKey, JSON.stringify(saved));
      } catch (e) {}
      update();
    });
  });
  progress.hidden = false;
  update();
}

async function lastUpdated() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(note.path)}&per_page=1`
    );
    if (!res.ok) return;
    const [commit] = await res.json();
    if (!commit) return;
    const date = new Date(commit.commit.committer.date);
    document.getElementById("meta").textContent += ` · Updated ${date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`;
  } catch (e) {}
}

async function render() {
  if (!note) {
    docEl.innerHTML = `<p class="status">That note doesn't exist. <a href="./">Back to the library</a>.</p>`;
    return;
  }
  document.title = `${note.title} · Study Library`;
  document.getElementById("source-link").href = blobUrl(note.path);
  document.getElementById("meta").textContent = note.path;

  let md;
  try {
    const res = await fetch(rawUrl(note.path));
    if (!res.ok) throw new Error(res.status);
    md = await res.text();
  } catch (e) {
    docEl.innerHTML = `<p class="status">Couldn't load this note from GitHub. <a href="${blobUrl(note.path)}">Open it on GitHub</a> instead.</p>`;
    return;
  }

  docEl.innerHTML = DOMPurify.sanitize(marked.parse(md, { gfm: true }), {
    ADD_TAGS: ["details", "summary"],
    ADD_ATTR: ["open"],
  });

  docEl.querySelectorAll("table").forEach((t) => {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    t.replaceWith(wrap);
    wrap.append(t);
  });
  docEl.querySelectorAll("pre code").forEach((el) => hljs.highlightElement(el));

  addHeadingIds();
  rewriteLinks();
  buildToc();
  enableChecklists();
  lastUpdated();

  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
}

const toTop = document.getElementById("to-top");
addEventListener("scroll", () => (toTop.hidden = scrollY < 800), { passive: true });
toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

render();

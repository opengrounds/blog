/* ============================================================
   open:grounds blog — scripts.js

   This file talks to back4app for the post data, then draws
   two "views" inside the page: the list of posts, and a single
   full post. Which one shows is controlled by the URL hash
   (e.g. "#post/abc123"), so links can be shared directly to a
   post and the browser back/forward buttons work normally.

   Loaded with <script src="scripts.js" defer> in the head, so
   it runs after the HTML has been parsed — every element this
   file looks up with querySelector already exists by the time
   it runs.
   ============================================================ */

// ---- back4app connection info ----
// Same app as the rest of open:grounds, just pointed at the
// BlogPost class.
var B4A_ID = 'rIyLxl8dBdYyeGszVuQCldrfXw7jkEL6ZlnzH0Oa';
var B4A_KEY = 'm64FAAIQEPo5itUwfP1A0lzY3mZRbBJVdqN2HXFX';
var B4A_URL = 'https://parseapi.back4app.com/classes/BlogPost';

// Maps the accent name saved on a post to the CSS variable that
// actually holds its color.
var ACCENTS = {
  flame: 'var(--flame)',
  sky: 'var(--sky)',
  grass: 'var(--grass)',
  sun: 'var(--sun)',
  pink: 'var(--pink)',
  ink: 'var(--ink)'
};

// The page's original <title>, so we can restore it whenever
// someone navigates back to the post list.
var DEFAULT_TITLE = document.title;

// All published posts, fetched once when the page loads.
var POSTS = [];

// Which accent color the list is currently filtered to.
// null means "show everything".
var activeFilter = null;

/* ---------------- loading posts ---------------- */

// Fetches every published post from back4app, newest first, then
// kicks off the first render of the page.
async function loadPosts() {
  try {
    var response = await fetch(
      B4A_URL + '?where={"status":"published"}&order=-publishedAt&limit=200',
      {
        headers: {
          'X-Parse-Application-Id': B4A_ID,
          'X-Parse-JavaScript-Key': B4A_KEY
        }
      }
    );
    var data = await response.json();
    POSTS = data.results || [];

    renderHeroMeta();
    renderFilters();
    renderList();

    // handle a direct link straight to a post, e.g. one shared as #post/abc123
    route();
  } catch (error) {
    document.querySelector('#post-list').innerHTML = '<div class="state-msg">error</div>';
  }
}

/* ---------------- hero: post count + surprise me ---------------- */

function renderHeroMeta() {
  var heroMeta = document.querySelector('#hero-meta');

  if (!POSTS.length) {
    heroMeta.innerHTML = '';
    return;
  }

  var count = POSTS.length;
  heroMeta.innerHTML =
    '<span class="hero-count"><strong>' + count + '</strong> post' + (count === 1 ? '' : 's') + ' and counting</span>' +
    '<button class="btn-surprise" onclick="surpriseMe()">🔀 surprise me</button>';
}

// Jumps straight to a random published post.
function surpriseMe() {
  if (!POSTS.length) return;
  var randomIndex = Math.floor(Math.random() * POSTS.length);
  var pick = POSTS[randomIndex];
  window.location.hash = '#post/' + pick.objectId;
}

/* ---------------- accent color filter chips ---------------- */

function renderFilters() {
  var filterRow = document.querySelector('#filter-row');

  // Figure out which accent colors are actually in use, with no
  // duplicates. Anything without a recognized accent falls back
  // to "flame", same as everywhere else in this file.
  var accentsInUse = [];
  POSTS.forEach(function (post) {
    var accentKey = ACCENTS[post.accent] ? post.accent : 'flame';
    if (accentsInUse.indexOf(accentKey) === -1) {
      accentsInUse.push(accentKey);
    }
  });

  // If every post shares the same color, filtering isn't useful — skip it.
  if (accentsInUse.length < 2) {
    filterRow.innerHTML = '';
    return;
  }

  var chipsHtml = accentsInUse.map(function (accentKey) {
    var isActive = activeFilter === accentKey;
    return (
      '<button class="filter-chip" style="background:' + ACCENTS[accentKey] + '" data-a="' + accentKey + '" ' +
      'aria-pressed="' + isActive + '" aria-label="filter by ' + accentKey + '" ' +
      'onclick="setFilter(\'' + accentKey + '\')"></button>'
    );
  }).join('');

  filterRow.innerHTML =
    '<span class="filter-label">filter</span>' +
    '<button class="filter-chip filter-chip--all" aria-pressed="' + (activeFilter === null) + '" onclick="setFilter(null)">all</button>' +
    chipsHtml;
}

// Sets which color the list is filtered to (or clears it with
// null) and redraws the chips + list to match.
function setFilter(accentKey) {
  activeFilter = accentKey;
  renderFilters();
  renderList();
}

/* ---------------- post list ---------------- */

function renderList() {
  var postList = document.querySelector('#post-list');

  if (!POSTS.length) {
    postList.innerHTML = '<div class="state-msg">no posts yet — check back soon.</div>';
    return;
  }

  var postsToShow = POSTS;
  if (activeFilter) {
    postsToShow = POSTS.filter(function (post) {
      var accentKey = ACCENTS[post.accent] ? post.accent : 'flame';
      return accentKey === activeFilter;
    });
  }

  if (!postsToShow.length) {
    postList.innerHTML = '<div class="state-msg">no posts in this color yet.</div>';
    return;
  }

  postList.innerHTML = postsToShow.map(function (post, index) {
    var accent = ACCENTS[post.accent] || ACCENTS.flame;
    return (
      '<a class="post-card enter" style="--i:' + index + '" href="#post/' + post.objectId + '">' +
        '<div class="post-card-accent" style="background:' + accent + '"></div>' +
        '<div class="post-card-body">' +
          '<div class="post-date">' + fmtDate(post.publishedAt) + '<span class="post-readtime">' + readTime(post.body) + '</span></div>' +
          '<div class="post-title">' + esc(post.title || 'untitled') + '</div>' +
          '<div class="post-excerpt">' + esc(post.excerpt || '') + '</div>' +
          '<span class="post-readmore" style="color:' + accent + '">read more →</span>' +
        '</div>' +
      '</a>'
    );
  }).join('');
}

// Rough reading time based on a 200-words-per-minute pace,
// rounded to the nearest minute (minimum of 1).
function readTime(body) {
  var words = (body || '').trim().split(/\s+/).filter(Boolean).length;
  var minutes = Math.max(1, Math.round(words / 200));
  return minutes + ' min read';
}

/* ---------------- routing ---------------- */
// Real full-page navigation via the URL hash, no popup. Reading a
// post changes the page just like clicking any other link would:
// the list is swapped out, the post gets its own view and its own
// shareable URL, and the browser back button takes you home.

function route() {
  var hash = window.location.hash; // e.g. "#post/abc123"
  var match = hash.match(/^#post\/(.+)$/);
  if (match) {
    showPost(match[1]);
  } else {
    showList();
  }
}
window.addEventListener('hashchange', route);

function goHome() {
  window.location.hash = '';
}

function showList() {
  document.querySelector('#view-post').style.display = 'none';
  document.querySelector('#view-list').style.display = 'block';
  document.title = DEFAULT_TITLE;
  window.scrollTo(0, 0);
}

async function showPost(id) {
  var post = POSTS.find(function (candidate) {
    return candidate.objectId === id;
  });

  if (!post) {
    // Not in the loaded list — this happens if someone opens a post
    // link fresh, before the full list has ever been fetched. Go
    // grab that one post directly instead.
    try {
      var response = await fetch(B4A_URL + '/' + id, {
        headers: {
          'X-Parse-Application-Id': B4A_ID,
          'X-Parse-JavaScript-Key': B4A_KEY
        }
      });
      if (response.ok) post = await response.json();
    } catch (error) {
      // fall through to the "not found" state below
    }
  }

  document.querySelector('#view-list').style.display = 'none';
  var postView = document.querySelector('#view-post');
  postView.style.display = 'block';
  window.scrollTo(0, 0);

  if (!post || post.status !== 'published') {
    document.querySelector('#post-accent').style.background = 'var(--stone)';
    document.querySelector('#post-date').textContent = '';
    document.querySelector('#post-title').textContent = 'post not found';
    document.querySelector('#post-body').innerHTML =
      '<p>this post may have been moved or unpublished. <a href="#" onclick="goHome()">back to all posts →</a></p>';
    document.title = DEFAULT_TITLE;
    return;
  }

  var accent = ACCENTS[post.accent] || ACCENTS.flame;
  document.querySelector('#post-accent').style.background = accent;
  document.querySelector('#post-date').textContent =
    fmtDate(post.publishedAt) + (post.author ? ' · ' + post.author : '') + ' · ' + readTime(post.body);
  document.querySelector('#post-title').textContent = post.title || 'untitled';
  document.querySelector('#post-body').innerHTML = renderBody(post.body || '');
  document.title = (post.title || 'post') + ' — opengrounds blog';
}

/* ---------------- tiny markdown-lite renderer ---------------- */
// Shares its "look" with the live preview in the admin panel.
// Supports: a blank line starts a new paragraph, "## " heading,
// "> " quote, "- " list item, **bold**, *italic*, [text](url)
// links, and ![caption](url) photos on their own line.

function renderBody(raw) {
  var lines = raw.replace(/\r\n/g, '\n').split('\n');
  var html = '';
  var inList = false;

  function closeList() {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  }

  function inline(text) {
    text = esc(text);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return text;
  }

  var paragraphLines = [];
  function flushParagraph() {
    if (paragraphLines.length) {
      html += '<p>' + paragraphLines.map(inline).join(' ') + '</p>';
      paragraphLines = [];
    }
  }

  lines.forEach(function (line) {
    var trimmed = line.trim();
    var imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }

    if (imageMatch) {
      flushParagraph();
      closeList();
      var altText = esc(imageMatch[1]);
      var imageSrc = esc(imageMatch[2]);
      html += '<figure><img src="' + imageSrc + '" alt="' + altText + '" loading="lazy">' +
              (imageMatch[1] ? '<figcaption>' + altText + '</figcaption>' : '') + '</figure>';
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      closeList();
      html += '<h2>' + inline(trimmed.slice(3)) + '</h2>';
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      closeList();
      html += '<blockquote>' + inline(trimmed.slice(2)) + '</blockquote>';
      return;
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph();
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += '<li>' + inline(trimmed.slice(2)) + '</li>';
      return;
    }

    closeList();
    paragraphLines.push(trimmed);
  });

  flushParagraph();
  closeList();
  return html;
}

/* ---------------- small helpers ---------------- */

// HTML-escapes a string so post content can never break out of
// the markup it's inserted into.
function esc(value) {
  var replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, function (character) {
    return replacements[character];
  });
}

// Formats a back4app Date object (or a plain ISO string) as
// something like "Jul 14, 2026". Returns an empty string for
// anything it can't parse.
function fmtDate(dateValue) {
  if (!dateValue) return '';
  var isoString = dateValue.iso || dateValue;
  var parsedDate = new Date(isoString);
  if (isNaN(parsedDate)) return '';
  return parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------------- back to top button ---------------- */

function scrollToTop() {
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}

// Show the button once you've scrolled a bit, hide it near the top.
window.addEventListener('scroll', function () {
  document.querySelector('#back-to-top').classList.toggle('show', window.scrollY > 400);
});

/* ---------------- go ---------------- */

loadPosts();
let allBooks = [],
  filteredBooks = [],
  currentIndex = 0,
  viewMode = "all", // "all", "favorites", or "to-read"
  activeTag = null;

let toReadBooks = [],
  filteredToReadBooks = [],
  activeToReadTag = null;

const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

// Suggested tags (optional)
const suggestedTags = ["classic", "fantasy", "nonfiction", "sci-fi", "biography", "mystery"];

// --- FETCH MAIN BOOKS ---
async function fetchBooks() {
  try {
    const res = await fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/review");
    const rawBooks = await res.json();
    const normalizedBooks = rawBooks.map(normalizeBook);
    // Enhance each book with cover + genres
    allBooks = await Promise.all(normalizedBooks.map(enhanceBookWithCoverAndGenres));
    applyFilters();
  } catch (e) {
    console.error("Failed to fetch books:", e);
    document.getElementById("bookCard").innerHTML = `<p style="color:red;">Failed to load books.</p>`;
  }
}

function normalizeBook(book) {
  return {
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    isbn: (book.isbn || "").trim(), // Add this if your sheet has an 'isbn' column
    quote: (book.quote || "").trim(),
    review: (book.review || "").trim(),
    cover: (book.cover || "").trim(),
    rating: parseInt(book.rating || "0"),
    despair: parseInt(book.despair || "0"),
    favorite: (book.favorite || "").toLowerCase(),
    genres: [] // We no longer use manual tags, genres will come from Open Library
  };
}

// --- ENHANCE BOOK WITH COVER AND GENRES (use ISBN if available) ---
async function enhanceBookWithCoverAndGenres(book) {
  if (!book.cover || book.cover === "") {
    book.cover = (await fetchOpenLibraryCover(book.title, book.author, book.isbn)) || placeholderImage;
  }
  // You can add genre fetching here if needed
  return book;
}

// --- ENHANCE TO-READ BOOK (use ISBN if available) ---
async function enhanceToReadBookWithCover(book) {
  book.cover = (await fetchOpenLibraryCover(book.title, book.author, book.isbn)) || placeholderImage;
  return book;
}

async function fetchAndRenderToReadGrid() {
  try {
    const res = await fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/to-read");
    const rawBooks = await res.json();
    const normalized = rawBooks.map(normalizeToReadBook);
    toReadBooks = await Promise.all(normalized.map(enhanceToReadBookWithCover));
    applyToReadFilter();
  } catch (e) {
    console.error("Failed to fetch to-read books:", e);
    document.getElementById("gridView").innerHTML = `<p style="color:red;">Failed to load to-read books.</p>`;
  }
}

function normalizeToReadBook(book) {
  return {
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    notes: (book.notes || "").trim(),
    cover: (book.cover || "").trim(),
    genres: []
  };
}

// --- FETCH OPEN LIBRARY COVER (try ISBN first, then fallback to title+author) ---
async function fetchOpenLibraryCover(title, author, isbn) {
  const keyBase = isbn?.trim() || `${title.toLowerCase()}_${author.toLowerCase()}`;

  const cacheKey = `cover_${keyBase}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  // 1. Try ISBN
  if (isbn) {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    const exists = await imageExists(url);
    if (exists) {
      localStorage.setItem(cacheKey, url);
      return url;
    }
  }

  // 2. Fallback to Open Library search by title + author
  const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  try {
    const res = await fetch(searchUrl);
    const data = await res.json();
    if (data.docs && data.docs.length > 0) {
      const doc = data.docs.find(d => d.cover_i);
      if (doc?.cover_i) {
        const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        localStorage.setItem(cacheKey, url);
        return url;
      }
    }
  } catch (e) {
    console.warn("OpenLibrary search failed", e);
  }

  // 3. Fallback to default
  localStorage.setItem(cacheKey, "null");
  return null;
}

//Fallback helper
async function imageExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// --- WORK KEY + SYNOPSIS FETCH + CACHE ---

function getCacheKeyWorkKey(title, author) {
  return `workkey_${title.toLowerCase()}_${author.toLowerCase()}`;
}
function getCacheKeySynopsis(title, author) {
  return `synopsis_${title.toLowerCase()}_${author.toLowerCase()}`;
}

async function getWorkKey(title, author) {
  const cacheKey = getCacheKeyWorkKey(title, author);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.docs && data.docs.length > 0 && data.docs[0].key) {
      localStorage.setItem(cacheKey, data.docs[0].key);
      return data.docs[0].key;
    } else {
      localStorage.setItem(cacheKey, "null");
      return null;
    }
  } catch (e) {
    console.error("Error fetching work key:", e);
    return null;
  }
}

async function fetchSynopsisByWorkKey(workKey, title, author) {
  if (!workKey) return null;

  const cacheKey = getCacheKeySynopsis(title, author);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`);
    const data = await res.json();
    let description = null;
    if (data.description) {
      if (typeof data.description === "string") description = data.description;
      else if (data.description.value) description = data.description.value;
    }
    if (description) {
      localStorage.setItem(cacheKey, description);
      return description;
    } else {
      localStorage.setItem(cacheKey, "null");
      return null;
    }
  } catch (e) {
    console.error("Error fetching synopsis:", e);
    return null;
  }
}

async function fetchSynopsis(title, author) {
  const workKey = await getWorkKey(title, author);
  return await fetchSynopsisByWorkKey(workKey, title, author);
}

// --- CUSTOM TAGS STORAGE UTILS ---
function getCustomTags(book) {
  const key = `customtags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  const tagsJSON = localStorage.getItem(key);
  return tagsJSON ? JSON.parse(tagsJSON) : [];
}

function saveCustomTags(book, tags) {
  const key = `customtags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(tags));
}

// --- GRID RENDERING ---
function applyFilters() {
  if (viewMode === "favorites") {
    filteredBooks = allBooks.filter(isBookFavorited);
  } else if (viewMode === "to-read") {
    fetchAndRenderToReadGrid();
    return;
  } else {
    filteredBooks = allBooks;
  }

  if (activeTag) {
    filteredBooks = filteredBooks.filter(book => {
      // Check custom tags for filtering
      const customTags = getCustomTags(book).map(t => t.toLowerCase());
      return customTags.includes(activeTag.toLowerCase());
    });
  }

  currentIndex = 0;
  renderGridView();
}

function applyToReadFilter() {
  if (activeToReadTag) {
    filteredToReadBooks = toReadBooks.filter(book => {
      const bookKey = `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
      const customTags = JSON.parse(localStorage.getItem(bookKey)) || [];
      return customTags.some(tag => tag.toLowerCase() === activeToReadTag);
    });
  } else {
    filteredToReadBooks = toReadBooks;
  }
  renderToReadGrid();
}

// --- RENDER GRID (Main + To-Read) ---
function renderGridView() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  filteredBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");
    img.src = book.cover || placeholderImage;
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = placeholderImage;
    };

    item.appendChild(img);
    item.addEventListener("click", () => {
      currentIndex = index;
      renderSingleCard(book);
      document.getElementById("cardOverlay").classList.remove("hidden");
    });

    grid.appendChild(item);
  });
}

function renderToReadGrid() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  if (toReadBooks.length === 0) {
    grid.innerHTML = `<p style="text-align:center;">No to-read books found.</p>`;
    return;
  }

  filteredToReadBooks.forEach((book) => {
    const item = document.createElement("div");
    item.className = "to-read-grid-item";

    const img = document.createElement("img");
    img.src = book.cover || placeholderImage;
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = placeholderImage;
    };

    item.appendChild(img);

    item.addEventListener("click", () => {
      renderToReadCard(book);
      document.getElementById("cardOverlay").classList.remove("hidden");
    });

    grid.appendChild(item);
  });
}

// Main book card popup with integrated custom tag display and add/delete
function renderSingleCard(book) {
  if (!book) return;

  const bookKey = `customTags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  let customTags = JSON.parse(localStorage.getItem(bookKey)) || [];

  // Generate tags HTML
  const tagsHTML = customTags
    .map(tag => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`)
    .join("") +
    `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

  const bookCard = document.getElementById("bookCard");
  const ratingStars = "★".repeat(book.rating).padEnd(5, "☆");

  const key = `favorite_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  const isFavorited = localStorage.getItem(key) === "true";
  const favoriteClass = isFavorited ? "favorite-heart active" : "favorite-heart";
  const coverSrc = book.cover || placeholderImage;

  bookCard.innerHTML = `
    <button id="prevBtn" class="nav-button" aria-label="Previous Book">&#10094;</button>
    <button id="nextBtn" class="nav-button" aria-label="Next Book">&#10095;</button>

    <div class="cover-container">
      <img src="${coverSrc}" alt="Cover of ${book.title}" onerror="this.onerror=null;this.src='${placeholderImage}'" />
    </div>
    <div class="title">${book.title || "Untitled"}</div>
    <div class="author">${book.author || "Unknown"}</div>

    <div class="rating-quote">
      <i data-lucide="quote" class="quote-icon close-quote"></i>
      <span class="quote-text">${book.quote || "No quote available"}</span>
      <i data-lucide="quote" class="quote-icon open-quote"></i>
    </div>

    <div class="rating-despair-box">
      <div class="rating-despair-left">
        <div class="rating" title="Rating">${ratingStars}</div>
      </div>
      <div class="rating-despair-center"></div>
      <div class="rating-despair-right">
        <div class="despair-rating" title="Despair Level">${getDespairIcon(book.despair)}</div>
      </div>
    </div>
    <div class="title-author-review">
      <div class="review">${book.review || ""}</div>
    </div>

    <div class="card-footer">
      <div class="footer-left">
        <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
      </div>
      <div class="footer-center"></div>
      <div class="footer-right">
        <div class="tags">${tagsHTML}</div>
      </div>
    </div>
  `;

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.classList.add("close-btn");
  closeBtn.addEventListener("click", () => {
    document.getElementById("cardOverlay").classList.add("hidden");
  });
  bookCard.appendChild(closeBtn);

  lucide.createIcons();

  // Navigation buttons
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (filteredBooks.length === 0) return;
    currentIndex = (currentIndex - 1 + filteredBooks.length) % filteredBooks.length;
    renderSingleCard(filteredBooks[currentIndex]);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (filteredBooks.length === 0) return;
    currentIndex = (currentIndex + 1) % filteredBooks.length;
    renderSingleCard(filteredBooks[currentIndex]);
  });

  // Toggle favorite
  document.getElementById("favoriteHeart").addEventListener("click", () => {
    const key = `favorite_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
    const isFav = localStorage.getItem(key) === "true";
    localStorage.setItem(key, !isFav);
    renderSingleCard(book);
  });

  // Tag filtering
  bookCard.querySelectorAll(".tag").forEach(tagEl => {
    if (tagEl.classList.contains("add-tag-btn")) return; // skip add button here
    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
      document.getElementById("cardOverlay").classList.add("hidden");
    });
  });

  // Delete tag buttons
  bookCard.querySelectorAll(".delete-tag-btn").forEach(delBtn => {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tagSpan = delBtn.parentElement;
      const tagToRemove = tagSpan.dataset.tag;
      customTags = customTags.filter(t => t.toLowerCase() !== tagToRemove);
      localStorage.setItem(bookKey, JSON.stringify(customTags));
      renderSingleCard(book);
    });
  });

  // Add tag button
  bookCard.querySelector(".add-tag-btn").addEventListener("click", () => {
    showTagInput(book, false);
  });

  attachToolbarHandlers();
}

// To-read card popup (unchanged except for tags if needed)
async function renderToReadCard(book) {
  if (!book) return;

  const bookKey = `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  let customTags = JSON.parse(localStorage.getItem(bookKey)) || [];

  const tagsHTML = customTags
    .map(tag => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`)
    .join("") +
    `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

  const bookCard = document.getElementById("bookCard");

  bookCard.innerHTML = `
    <button id="closeToReadCard" class="close-btn" aria-label="Close">&times;</button>
    <div class="to-read-cover-container">
      <img src="${book.cover || placeholderImage}" alt="Cover of ${book.title}" />
    </div>
    <div class="to-read-title">${book.title || "Untitled"}</div>
    <div class="to-read-author">${book.author || "Unknown"}</div>
    <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>

    <div class="card-footer">
      <div class="footer-right">
        <div class="tags">${tagsHTML}</div>
      </div>
    </div>
  `;

  document.getElementById("closeToReadCard").addEventListener("click", () => {
    document.getElementById("cardOverlay").classList.add("hidden");
  });

  // Tag filtering
  bookCard.querySelectorAll(".tag").forEach(tagEl => {
    if (tagEl.classList.contains("add-tag-btn")) return;
    tagEl.addEventListener("click", () => {
      activeToReadTag = tagEl.dataset.tag.toLowerCase();
      applyToReadFilter();
      document.getElementById("cardOverlay").classList.add("hidden");
    });
  });

  // Delete tag buttons
  bookCard.querySelectorAll(".delete-tag-btn").forEach(delBtn => {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tagSpan = delBtn.parentElement;
      const tagToRemove = tagSpan.dataset.tag;
      customTags = customTags.filter(t => t.toLowerCase() !== tagToRemove);
      localStorage.setItem(bookKey, JSON.stringify(customTags));
      renderToReadCard(book);
    });
  });

  // Add tag button
  bookCard.querySelector(".add-tag-btn").addEventListener("click", () => {
    showTagInput(book, true);
  });

  // Fetch and show synopsis
  const synopsis = await fetchSynopsis(book.title, book.author);
  const synopsisEl = document.getElementById("toReadSynopsis");
  synopsisEl.textContent = synopsis || "No synopsis available.";
}

//Quick-list Render
function renderQuickListCard() {
  fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/to-read")
    .then(res => res.json())
    .then(data => {
      const listItems = data
        .map(book => {
          const title = (book.title || "Untitled").trim();
          const author = (book.author || "Unknown").trim();
          return `<div class="quicklist-item"><strong>${title}</strong><br><em>${author}</em></div>`;
        })
        .join("");

      const bookCard = document.getElementById("bookCard");
      bookCard.innerHTML = `
        <button class="close-btn" id="closeQuickList">&times;</button>
        <div class="quicklist-header">Quick List</div>
        <div class="quicklist-content">${listItems}</div>
      `;

      document.getElementById("cardOverlay").classList.remove("hidden");
      document.getElementById("closeQuickList").onclick = () => {
        document.getElementById("cardOverlay").classList.add("hidden");
      };
    })
    .catch(err => {
      console.error("Error loading quick list", err);
      const bookCard = document.getElementById("bookCard");
      bookCard.innerHTML = `<p style="color:red;">Failed to load quick list.</p>`;
      document.getElementById("cardOverlay").classList.remove("hidden");
    });
}

// --- TOOLBAR ---
function attachToolbarHandlers() {
  document.getElementById("homeBtn").onclick = () => {
    viewMode = "all";
    activeTag = null;
    applyFilters();
  };

  document.getElementById("favoritesBtn").onclick = () => {
    viewMode = viewMode === "favorites" ? "all" : "favorites";
    activeTag = null;
    applyFilters();
  };

 document.getElementById("showReadBtn").onclick = () => {
  renderQuickListCard();
};

  document.getElementById("showToReadBtn").onclick = () => {
    viewMode = "to-read";
    activeToReadTag = null;
    fetchAndRenderToReadGrid();
  };
}

// --- UTILS ---
function isBookFavorited(book) {
  return localStorage.getItem(`favorite_${book.title.toLowerCase()}_${book.author.toLowerCase()}`) === "true";
}

function getDespairIcon(value) {
  const icons = {
    1: "smile",
    2: "meh",
    3: "frown",
    4: "cloud-rain-wind",
    5: "skull"
  };
  return `<i data-lucide="${icons[value] || "help-circle"}"></i>`;
}

// --- TAG INPUT POPUP ---

function showTagInput(book, isToRead = false) {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "tag-input-overlay";

  // Popup container
  const popup = document.createElement("div");
  popup.className = "tag-input-popup";

  const title = document.createElement("h3");
  title.textContent = "Add a Tag";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter tag";
  input.autocomplete = "off";

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "tag-input-buttons";

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";

  buttonContainer.appendChild(addBtn);
  buttonContainer.appendChild(cancelBtn);

  // Optional suggested tags - customize as you like
  const suggestedTags = ["Fiction", "Non-fiction", "Sci-Fi", "Fantasy", "Biography"];
  const suggestionsContainer = document.createElement("div");
suggestionsContainer.className = "tag-suggestions";
suggestedTags.forEach(tag => {
  const tagEl = document.createElement("span");
  tagEl.className = "tag";
  tagEl.textContent = tag;
  tagEl.addEventListener("click", () => {
    input.value = tag;
    input.focus();
  });
  suggestionsContainer.appendChild(tagEl);
});

  popup.appendChild(title);
  popup.appendChild(input);
  popup.appendChild(suggestionsContainer);
  popup.appendChild(buttonContainer);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  input.focus();

  // Determine localStorage key prefix based on book type
  const bookKey = isToRead
    ? `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`
    : `customTags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;

  let customTags = JSON.parse(localStorage.getItem(bookKey)) || [];

  addBtn.addEventListener("click", () => {
    const newTag = input.value.trim();
    if (newTag && !customTags.map(t => t.toLowerCase()).includes(newTag.toLowerCase())) {
      customTags.push(newTag);
      localStorage.setItem(bookKey, JSON.stringify(customTags));
      document.body.removeChild(overlay);
      if (isToRead) renderToReadCard(book);
      else renderSingleCard(book);
    } else {
      alert("Please enter a unique tag.");
    }
  });

  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  // Close on clicking outside popup
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Allow pressing Enter to add tag
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
    else if (e.key === "Escape") cancelBtn.click();
  });
}

// --- INITIALIZE ---
window.onload = () => {
  fetchBooks();
  attachToolbarHandlers();
};

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
    allBooks = await Promise.all(normalizedBooks.map(enhanceBookWithCover));
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
    isbn: (book.isbn || "").replace(/[-\s]/g, "").trim(),
    quote: (book.quote || "").trim(),
    review: (book.review || "").trim(),
    cover: (book.cover || "").trim(),
    rating: parseInt(book.rating || "0"),
    despair: parseInt(book.despair || "0"),
    favorite: (book.favorite || "").toLowerCase(),
    tags: (book.tags || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  };
}

// --- ENHANCE BOOK WITH COVER ---
async function enhanceBookWithCover(book) {
  if (!book.cover || book.cover === "") {
    book.cover = (await fetchOpenLibraryCover(book.title, book.author, book.isbn)) || placeholderImage;
  }
  return book;
}

// --- ENHANCE TO-READ BOOK (use ISBN if available) ---
async function enhanceToReadBookWithCover(book) {
  const cleanIsbn = (book.isbn || "").replace(/[-\s]/g, "").trim();
  book.cover = (await fetchOpenLibraryCover(book.title, book.author, cleanIsbn)) || placeholderImage;
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
    isbn: (book.isbn || "").trim(),
    cover: (book.cover || "").trim()
  };
}

// --- FETCH OPEN LIBRARY COVER (try title+author first, then fallback to ISBN direct) ---
async function fetchOpenLibraryCover(title, author, isbn) {
  const cleanIsbn = isbn?.replace(/[-\s]/g, "").trim();

  const cacheKey = `cover_${title.toLowerCase()}_${author.toLowerCase()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  // 1. Try Open Library search by title + author first
  try {
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
    const res = await fetch(searchUrl);
    const data = await res.json();

    if (data.docs && data.docs.length > 0) {
      // Find a doc with a cover
      const docWithCover = data.docs.find((d) => d.cover_i);
      if (docWithCover?.cover_i) {
        const coverUrl = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
        localStorage.setItem(cacheKey, coverUrl);
        return coverUrl;
      }

      // Try fallback ISBN from search results
      for (const doc of data.docs) {
        if (doc.isbn && doc.isbn.length > 0) {
          for (const fallbackIsbn of doc.isbn) {
            const url = `https://covers.openlibrary.org/b/isbn/${fallbackIsbn}-L.jpg`;
            if (await imageExists(url)) {
              localStorage.setItem(cacheKey, url);
              return url;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("OpenLibrary search failed:", e);
  }

  // 2. If search by title+author fails, try ISBN direct fetch if ISBN exists
  if (cleanIsbn) {
    const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
    if (await imageExists(url)) {
      localStorage.setItem(cacheKey, url);
      return url;
    }
  }

  // 3. If everything fails, cache null and return null (placeholder later)
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
    filteredBooks = filteredBooks.filter((book) => {
      // Check custom tags for filtering
      const customTags = getCustomTags(book).map((t) => t.toLowerCase());
      return customTags.includes(activeTag.toLowerCase());
    });
  }

  currentIndex = 0;
  renderGridView();
}

function applyToReadFilter() {
  if (activeToReadTag) {
    filteredToReadBooks = toReadBooks.filter((book) => {
      const bookKey = `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
      const customTags = JSON.parse(localStorage.getItem(bookKey)) || [];
      return customTags.some((tag) => tag.toLowerCase() === activeToReadTag);
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
  const tagsHTML =
    customTags
      .map(
        (tag) =>
          `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
      )
      .join("") + `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

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
  <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "No quote available"}</div>
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
  <div id="reviewEditable" class="review editable" contenteditable="false" title="Click to edit review">${book.review || ""}</div>
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

  // Toggle favorite save to spreadsheet
  document.getElementById("favoriteHeart").addEventListener("click", async () => {
    const key = `favorite_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
    const isFav = localStorage.getItem(key) === "true";
    localStorage.setItem(key, !isFav ? "true" : "false");
    renderSingleCard(book);
    await saveBookData(book); // ✅ Save updated favorite
  });

  // Tag filtering
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    if (tagEl.classList.contains("add-tag-btn")) return; // skip add button here
    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
      document.getElementById("cardOverlay").classList.add("hidden");
    });
  });

  // Delete tag buttons
  bookCard.querySelectorAll(".delete-tag-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tagSpan = delBtn.parentElement;
      const tagToRemove = tagSpan.dataset.tag;
      customTags = customTags.filter((t) => t.toLowerCase() !== tagToRemove);
      localStorage.setItem(bookKey, JSON.stringify(customTags));
      renderSingleCard(book);
      await saveBookData(book); // ✅ Save updated tags
    });
  });

  // Add tag button
  bookCard.querySelector(".add-tag-btn").addEventListener("click", () => {
    showTagInput(book, false);
  });

  // Setup editable fields for quote and review with autosave
  setupEditableField("quoteEditable", book, "quote");
  setupEditableField("reviewEditable", book, "review");

  attachToolbarHandlers();
}

// To-read card popup (unchanged except for tags if needed)
async function renderToReadCard(book) {
  if (!book) return;

  const bookKey = `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  let customTags = JSON.parse(localStorage.getItem(bookKey)) || [];

  const spreadsheetTagsHTML = (book.tags || [])
    .map((tag) => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}</span>`)
    .join("");

  const customTagsHTML = customTags
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");

  const tagsHTML = spreadsheetTagsHTML + customTagsHTML + `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

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
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    if (tagEl.classList.contains("add-tag-btn")) return;
    tagEl.addEventListener("click", () => {
      activeToReadTag = tagEl.dataset.tag.toLowerCase();
      applyToReadFilter();
      document.getElementById("cardOverlay").classList.add("hidden");
    });
  });

  // Delete tag buttons
  bookCard.querySelectorAll(".delete-tag-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tagSpan = delBtn.parentElement;
      const tagToRemove = tagSpan.dataset.tag;
      customTags = customTags.filter((t) => t.toLowerCase() !== tagToRemove);
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
    .then((res) => res.json())
    .then((data) => {
      const listItems = data
        .map((book) => {
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
    .catch((err) => {
      console.error("Error loading quick list", err);
      const bookCard = document.getElementById("bookCard");
      bookCard.innerHTML = `<p style="color:red;">Failed to load quick list.</p>`;
      document.getElementById("cardOverlay").classList.remove("hidden");
    });
}

// --- TOOLBAR ---
function attachToolbarHandlers() {
  document.getElementById("homeBtn").onclick = () => {
    // Clear failed cover cache
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("cover_") && localStorage.getItem(key) === "null") {
        localStorage.removeItem(key);
      }
    });

    // Show confirmation message
    showToast("Housekeeping performed 🧹🏠");

    // Reset filters and re-fetch
    viewMode = "all";
    activeTag = null;
    fetchBooks();
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
  suggestedTags.forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag";
    tagEl.textContent = tag;
    tagEl.addEventListener("click", () => {
      input.value = tag;
      input.focus();
    });
    suggestionsContainer.appendChild(tagEl);
  });

  // --- Helper to check if image URL is valid ---
  function checkImageValid(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 10 && img.naturalHeight > 10) resolve(true);
        else resolve(false);
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

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

  addBtn.addEventListener("click", async () => {
    const newTag = input.value.trim();
    if (newTag && !customTags.map((t) => t.toLowerCase()).includes(newTag.toLowerCase())) {
      customTags.push(newTag);
      localStorage.setItem(bookKey, JSON.stringify(customTags));
      document.body.removeChild(overlay);
      if (isToRead) {
        renderToReadCard(book);
      } else {
        renderSingleCard(book);
        await saveBookData(book); // ✅ Save updated tags
      }
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
function setupEditableField(elementId, book, fieldName) {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn(`Element with ID "${elementId}" not found.`);
    return;
  }

  // Enable editing on click
  el.addEventListener("click", () => {
    el.contentEditable = "true";
    el.focus();

    // Optional: select all text on focus
    document.execCommand("selectAll", false, null);
  });

  // Handle Enter key: prevent newline and blur to trigger save
  el.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur(); // force save
    }
  });

  // On losing focus, save if content changed
  el.addEventListener("blur", async () => {
    el.contentEditable = "false";
    const newValue = el.textContent.trim();

    console.log(`📝 Blur triggered for "${fieldName}"`);
    console.log("New value:", newValue);
    console.log("Old value:", book[fieldName]);

    if (book[fieldName] !== newValue) {
      if (book[fieldName] !== newValue) {
        book[fieldName] = newValue;
        await saveBookData(book);
      }
      try {
        console.log("📤 Sending updated book data...");
        await saveBookData(book);
        console.log(`✅ Saved ${fieldName} successfully`);
      } catch (err) {
        alert(`❌ Failed to save ${fieldName}.`);
        console.error(err);
      }
    } else {
      console.log(`ℹ️ No changes to ${fieldName}, not saving.`);
    }
  });
}

//OPTIONS preflight request
function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

//housekeeping popup

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100); // Start animation slightly after insertion

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 500); // Remove from DOM after fade out
  }, 3000);
}

async function saveBookData(book) {
  const proxyUrl = "https://vercel-cors-proxy-orpin.vercel.app/api/proxy";
  const googleScriptUrl =
    "https://script.google.com/macros/s/AKfycbzaCvrbc8x-R2ygrXvnetlvY_K_aqozdWYWqt3BSTIxA7tSd-_ZYo2fSV8csoUbshC3/exec";

  const fullUrl = `${proxyUrl}?url=${encodeURIComponent(googleScriptUrl)}`;

  const key = `favorite_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  const isFav = localStorage.getItem(key) === "true";

  const tagKey = `customtags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  const customTags = JSON.parse(localStorage.getItem(tagKey)) || [];

  const payload = {
    type: "read",
    books: [
      {
        title: book.title,
        author: book.author,
        quote: book.quote || "",
        review: book.review || "",
        rating: book.rating || 0,
        despair: book.despair || 0,
        tags: customTags.join(", "),
        favorite: isFav ? "true" : "false",
        isbn: book.isbn || ""
      }
    ]
  };

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa("peepee696969:poopoo420420")}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.result !== "success") {
      throw new Error(result.message || "Backup save failed");
    }

    console.log("✅ Saved book:", payload.books[0]);
  } catch (error) {
    console.error("❌ Proxy error:", error.message);
  }
}

// --- INITIALIZE ---
window.onload = () => {
  fetchBooks();
  attachToolbarHandlers();
};

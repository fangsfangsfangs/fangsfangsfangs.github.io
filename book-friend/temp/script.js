const supabaseUrl = "https://pnpjlsjxlbrihxlkirwj.supabase.co"; 
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGpsc2p4bGJyaWh4bGtpcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODIyNDMsImV4cCI6MjA2NzY1ODI0M30.KP6YZtDGsH6_MtSJF03r2nhmEcXTvpd4Ppb-M3HYkhg";
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

let allBooks = [],
  filteredBooks = [],
  currentIndex = 0,
  viewMode = "all",
  activeTag = null;

let toReadBooks = [],
  filteredToReadBooks = [],
  activeToReadTag = null;

// Suggested tags (optional)
const suggestedTags = ["classic", "fantasy", "nonfiction", "sci-fi", "biography", "mystery"];

//SUPABASE HELPERS
async function addBookToSupabase(book) {
  const { data, error } = await supabase.from("books_read").insert([book]);
  if (error) throw error;
  return data[0];
}

async function updateBookInSupabase(id, updates) {
  const { data, error } = await supabase.from("books_read").update(updates).eq("id", id);
  if (error) throw error;
  return data[0];
}

// --- FETCH MAIN BOOKS ---
async function fetchBooks() {
  try {
    const { data, error } = await supabase.from("books_read").select("*");
    if (error) throw error;

    allBooks = data.map((book) => normalizeBook(book));
    applyFiltersAndRender();
  } catch (error) {
    console.error("Error fetching books:", error);
  }
}

function normalizeBook(book) {
  return {
    id: book.id,
    title: book.title || "",
    author: book.author || "",
    quote: book.quote || "",
    review: book.review || "",
    rating: book.rating || 0,
    despair: book.despair || 0,
    favorite: book.favorite === "y",
    isbn: book.isbn || "",
    tags: (book.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    cover: book.cover || "",
    dateRead: book.date_read || "", // yyyy-mm
    synopsis: book.synopsis || "",
  };
}

function applyFiltersAndRender() {
  // Basic filtering example — show all for now
  filteredBooks = allBooks;
  currentIndex = 0;
  renderGridView();
}

// --- FETCH TO-READ BOOKS ---
async function fetchToReadBooks() {
  try {
    const { data, error } = await supabase.from("books_to_read").select("*");
    if (error) throw error;

    toReadBooks = data.map((book) => normalizeBook(book, true));
    filteredToReadBooks = toReadBooks;
    renderToReadGrid();
  } catch (error) {
    console.error("Error fetching to-read books:", error);
  }
}

function renderToReadGrid() {
  const container = document.getElementById("toReadGrid");
  container.innerHTML = "";

  filteredToReadBooks.forEach((book) => {
    const card = document.createElement("div");
    card.className = "to-read-card";

    card.innerHTML = `
      <h4>${book.title}</h4>
      <p>by ${book.author}</p>
      <img src="${getCoverUrl(book)}" alt="${book.title} cover" />
    `;

    container.appendChild(card);
  });
}

// Read normalization function
function normalizeBook(book, isToRead = false) {
  const base = {
    id: book.id || null, // ✅ keep Supabase ID for edits
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    isbn: (book.isbn || "").replace(/[-\s]/g, "").trim(),
    cover: (book.cover || "").trim()
  };

  if (isToRead) {
    return {
      ...base,
      notes: (book.notes || "").trim()
    };
  } else {
    return {
      ...base,
      quote: (book.quote || "").trim(),
      review: (book.review || "").trim(),
      rating: parseInt(book.rating || "0"),
      despair: parseInt(book.despair || "0"),
      favorite: (book.favorite || "").toLowerCase(), // Supabase expects "true"/"false"
      tags: (book.tags || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
      dateRead: book.dateRead && isValidDateRead(book.dateRead)
        ? book.dateRead.trim()
        : getFallbackDate()
    };
  }
}

function isValidDateRead(dateStr) {
  // Expecting "YYYY-MM", e.g. "2025-07"
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(dateStr);
}

function getFallbackDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

// --- FETCH COVER FROM OPEN LIBRARY ---
async function fetchOpenLibraryCover(title, author, isbn) {
  const cleanIsbn = isbn?.replace(/[-\s]/g, "").trim();
  const cacheKey = `cover_${title.toLowerCase()}_${author.toLowerCase()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    );
    const data = await res.json();

    if (data.docs && data.docs.length > 0) {
      const docWithCover = data.docs.find((d) => d.cover_i);
      if (docWithCover?.cover_i) {
        const coverUrl = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
        localStorage.setItem(cacheKey, coverUrl);
        return coverUrl;
      }

      // Try any ISBN from search
      const allIsbns = data.docs.flatMap((d) => d.isbn || []);
      for (const fallbackIsbn of allIsbns) {
        const url = `https://covers.openlibrary.org/b/isbn/${fallbackIsbn}-L.jpg`;
        if (await imageExists(url)) {
          localStorage.setItem(cacheKey, url);
          return url;
        }
      }
    }
  } catch (e) {
    console.warn("OpenLibrary search failed:", e);
  }

  // Final fallback: direct ISBN fetch
  if (cleanIsbn) {
    const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
    if (await imageExists(url)) {
      localStorage.setItem(cacheKey, url);
      return url;
    }
  }

  localStorage.setItem(cacheKey, "null");
  return null;
}

// --- CHECK IF IMAGE EXISTS (HEAD request) ---
async function imageExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// --- ENHANCE ANY BOOK (read or to-read) WITH COVER ---
const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

async function getCoverUrl(book) {
  // Try Open Library cover first
  const openLibCover = await fetchOpenLibraryCover(book.title, book.author, book.isbn);
  if (openLibCover) return openLibCover;

  // Fallback to Supabase cover URL (assuming `book.cover` is the Supabase cover field)
  if (book.cover && book.cover.trim() !== "") return book.cover.trim();

  // Final fallback: placeholder image
  return placeholderImage;
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
  const cacheKey = getCacheKeySynopsis(title, author);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

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
}

// --- GRID RENDERING ---
function applyFilters() {
  if (viewMode === "favorites") {
    filteredBooks = allBooks.filter(isBookFavorited);
  } else if (viewMode === "to-read") {
    if (toReadBooks.length === 0) {
      fetchAndRenderToReadGrid();
    } else {
      applyToReadFilter();
    }
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
  try {
    if (activeToReadTag) {
      filteredToReadBooks = toReadBooks.filter((book) => {
        const bookKey = `customTagsToRead_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
        const customTags = JSON.parse(localStorage.getItem(bookKey)) || [];
        return customTags.some((tag) => tag.toLowerCase() === activeToReadTag.toLowerCase());
      });
    } else {
      filteredToReadBooks = [...toReadBooks];
    }
    renderToReadGrid();
  } catch (e) {
    console.error("Error applying to-read filter:", e);
    document.getElementById("gridView").innerHTML = `<p style="color:red;">Failed to load to-read books.</p>`;
  }
}

// --- RENDER GRID (Main + To-Read) ---
function renderGridView() {
  const gridContainer = document.getElementById("gridView");
  gridContainer.innerHTML = "";

  filteredBooks.forEach((book, index) => {
    const coverUrl = getCoverUrl(book);
    const card = document.createElement("div");
    card.className = "book-card";
    card.dataset.index = index;

    card.innerHTML = `
      <img src="${coverUrl}" alt="${book.title} cover" class="book-cover" />
      <div class="book-title">${book.title}</div>
      <div class="book-author">${book.author}</div>
    `;

    card.addEventListener("click", () => {
      currentIndex = index;
      renderSingleCard(book);
    });

    gridContainer.appendChild(card);
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

//Book cover helper -- come back to this 
function getCoverUrl(book) {
  if (book.cover) return book.cover;
  if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
  // fallback placeholder
  return "https://via.placeholder.com/128x193?text=No+Cover";
}

// Main book card popup with integrated custom tag display and add/delete
function renderSingleCard(book) {
  if (!book) return;

  const bookKey = `customTags_${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
  let customTags = JSON.parse(localStorage.getItem(bookKey)) || [];

  // Generate tags HTML
  const tagsHTML = customTags
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");

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

   <div class="quote-box">
  <i data-lucide="quote" class="quote-icon close-quote"></i>
  <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "No quote available"}</div>
  <i data-lucide="quote" class="quote-icon open-quote"></i>
</div>

    <div class="rating-header">
      <div class="rating-header-left">
        <div class="rating" title="Rating">${ratingStars}</div>
      </div>
      <div class="rating-header-center"></div>
      <div class="rating-header-right">
        <div class="despair-level" title="Despair Level">${getDespairIcon(book.despair)}</div>
      </div>
    </div>
    <div class="title-author-review">
  <div id="reviewEditable" class="review editable" contenteditable="false" title="Click to edit review">${book.review || ""}</div>
</div>

    <div class="card-footer">
  <div class="card-footer-left">
    <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
     <div class="date-read-container">
      <i data-lucide="calendar-1" class="calendar-icon" title="Edit Date Read" style="cursor:pointer;"></i>
      <div id="dateReadEditable" class="date-read editable" contenteditable="false" title="Click calendar to edit date read">
        ${book.dateRead || "YYYY-MM"}
  </div>
  <div class="card-footer-center">
      </div>
    </div>
  </div>
  <div class="card-footer-right">
    <div class="tags">${tagsHTML}<span class="tag add-tag-btn" title="Add Tag">+</span></div>
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
  const calendarIcon = bookCard.querySelector(".calendar-icon");
  const dateReadDiv = document.getElementById("dateReadEditable");

  calendarIcon.addEventListener("click", () => {
    if (dateReadDiv.contentEditable === "true") {
      // Already editing, ignore
      return;
    }
    dateReadDiv.contentEditable = "true";
    dateReadDiv.classList.add("editing");
    dateReadDiv.focus();

    // Select all text on focus
    document.execCommand("selectAll", false, null);
  });

  // On blur, validate and save new dateRead
  dateReadDiv.addEventListener("blur", async () => {
    dateReadDiv.contentEditable = "false";
    dateReadDiv.classList.remove("editing");

    let newDate = dateReadDiv.textContent.trim();

    // Validate format YYYY-MM (simple regex)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(newDate)) {
      alert("Please enter a valid date in YYYY-MM format.");
      // Reset to previous valid value
      dateReadDiv.textContent = book.dateRead || "YYYY-MM";
      return;
    }

    if (book.dateRead !== newDate) {
      book.dateRead = newDate;
      try {
        await saveBookData(book);
        // Optional: toast or confirmation here
        console.log(`Date Read updated to ${newDate}`);
      } catch (err) {
        alert("Failed to save Date Read.");
        console.error(err);
        // Reset on failure
        dateReadDiv.textContent = book.dateRead || "YYYY-MM";
      }
    }
  });

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
      <div class="card-footer-right">
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
async function renderQuickListCard() {
  try {
    const { data, error } = await supabase
      .from("books_to_read")
      .select("title, author")
      .order("title");

    if (error) throw error;

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
  } catch (err) {
    console.error("Error loading quick list", err);
    const bookCard = document.getElementById("bookCard");
    bookCard.innerHTML = `<p style="color:red;">Failed to load quick list.</p>`;
    document.getElementById("cardOverlay").classList.remove("hidden");
  }
}

// --- TOOLBAR ---
  function attachToolbarHandlers() {
  document.getElementById("logoBtn").addEventListener("click", () => {
    // Clear failed cover cache
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("cover_") && localStorage.getItem(key) === "null") {
        localStorage.removeItem(key);
      }
    });

    // Show confirmation
    showToast("🏠 mousekeeping performed 🧼");

    // Trigger glitter
    rainGlitter(50); // You can increase/decrease the number
  });

  function rainGlitter(count) {
    const overlay = document.getElementById("glitterOverlay");
    overlay.innerHTML = ""; // Clear previous rain

    const emojis = ["🐭", "✨", "☁️", "🌠"]; // You can change this mix

    for (let i = 0; i < count; i++) {
      const drop = document.createElement("div");
      drop.className = "glitter";
      drop.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      drop.style.left = `${Math.random() * 100}vw`;
      drop.style.animationDelay = `${Math.random()}s`;
      drop.style.fontSize = "0.85rem";
      overlay.appendChild(drop);
    }

    // Remove all emoji after they finish falling
    setTimeout(() => {
      overlay.innerHTML = "";
    }, 2000);
  }
// Add-book popup event listeners
  document.getElementById("homeBtn").onclick = () => {
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
  document.getElementById("addBookBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.remove("hidden");
  });

  document.getElementById("closePopupBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.add("hidden");

    document.getElementById("addBookPopup").classList.add("hidden");
  });
   
// Parse and clean tags input
async function addBook() {
  const rawTags = document.getElementById("addTags").value;
  const tagsArray = tagUtils.parseTags(rawTags);

  const newBook = {
    title: document.getElementById("addTitle").value.trim(),
    author: document.getElementById("addAuthor").value.trim(),
    isbn: document.getElementById("addIsbn").value.trim(),
    quote: document.getElementById("addQuote").value.trim(),
    review: document.getElementById("addReview").value.trim(),
    rating: parseInt(document.getElementById("addRating").value) || 0,
    despair: parseInt(document.getElementById("addDespair").value) || 0,
    favorite: addFavoriteHeart && addFavoriteHeart.classList.contains("active") ? "y" : "",
    tags: tagsArray,
    dateRead: document.getElementById("dateReadInput").value || getFallbackDate()
  };

  const enhanced = await enhanceBookWithCover(normalizeBook(newBook));
  allBooks.push(enhanced);

  // Save custom tags to localStorage
  const bookKey = `customTags_${newBook.title.toLowerCase()}_${newBook.author.toLowerCase()}`;

  // Prepare data for backend: convert tags array back to comma string
  const backendPayload = {
    ...enhanced,
    tags: tagsArray.join(", "),
    favorite: newBook.favorite === "y" ? "true" : "false"
  };
  // ... do something with backendPayload, e.g. send it to your backend
}

// --- UTILS ---
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

//  Normalize a raw tags string input into a unique, trimmed, lowercase array
const tagUtils = {
  parseTags(rawTags) {
    if (!rawTags) return [];
    return rawTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t, i, arr) => t && arr.indexOf(t) === i);
  },
  formatTags(tagsArray) {
    if (!Array.isArray(tagsArray)) return "";
    return tagsArray.join(", ");
  }
};

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
  const suggestedTags = ["Fiction", "Non-fiction", "Sci-Fi", "Horror", "Biography", "Thriller"];
  const suggestionsContainer = document.createElement("div");
  suggestionsContainer.className = "tag-suggestions";
  suggestedTags.forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag suggested-tag-btn";
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
      book[fieldName] = newValue;
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
  try {
    const updates = {
      quote: book.quote,
      review: book.review,
      date_read: book.dateRead || getFallbackDate(),
      favorite: book.favorite === "y" ? true : false,
      tags: Array.isArray(book.tags) ? book.tags.join(", ") : "",
      rating: book.rating || 0,
      despair: book.despair || 0,
    };

    const { error } = await supabase
      .from("books_read")
      .update(updates)
      .eq("id", book.id);

    if (error) throw error;
    console.log("✅ Supabase updated:", book.title);
  } catch (error) {
    console.error("❌ Supabase update failed:", error);
  }
}

// --- INITIALIZE ---
window.onload = () => {
  fetchBooks();
  attachToolbarHandlers();

  // Setup favorite heart toggle in Add Book popup
  const addFavoriteHeart = document.getElementById("addFavoriteHeart");
  if (addFavoriteHeart) {
    addFavoriteHeart.addEventListener("click", () => {
      addFavoriteHeart.classList.toggle("active");
    });
  }

  // Show Add Book popup
  document.getElementById("addBookBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.remove("hidden");
  });

  // Close Add Book popup and reset toggle
  document.getElementById("closePopupBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.add("hidden");
    if (addFavoriteHeart) addFavoriteHeart.classList.remove("active");
  });

  // Confirm Add Book, read toggle state and reset it after add
document.getElementById("addBookConfirm").addEventListener("click", async () => {
  const rawTags = document.getElementById("addTags").value;
  const tagsArray = tagUtils.parseTags(rawTags); // Clean tags

  const newBook = {
    title: document.getElementById("addTitle").value.trim(),
    author: document.getElementById("addAuthor").value.trim(),
    isbn: document.getElementById("addIsbn").value.trim(),
    quote: document.getElementById("addQuote").value.trim(),
    review: document.getElementById("addReview").value.trim(),
    rating: parseInt(document.getElementById("addRating").value) || 0,
    despair: parseInt(document.getElementById("addDespair").value) || 0,
    favorite: addFavoriteHeart && addFavoriteHeart.classList.contains("active") ? "y" : "",
    tags: tagsArray,
    dateRead: document.getElementById("dateReadInput").value || getFallbackDate()
  };

  const enhanced = await enhanceBookWithCover(normalizeBook(newBook));

  const backendPayload = {
    ...enhanced,
    tags: tagUtils.formatTags(tagsArray),
    favorite: newBook.favorite === "y" ? "true" : "false"
  };

  try {
    const { data, error } = await supabase.from("books_read").insert([backendPayload]);
    if (error) throw error;

    showToast("✅ Book added!");
    allBooks.push({ ...backendPayload, id: data[0].id });
    applyFilters();
    document.getElementById("addBookPopup").classList.add("hidden");
    if (addFavoriteHeart) addFavoriteHeart.classList.remove("active");
  } catch (e) {
    console.error("❌ Supabase save failed:", e);
    alert("❌ Failed to save new book.");
  }
});
};

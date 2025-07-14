import { showToast, rainGlitter } from "./glitter.js";

const supabaseUrl = "https://pnpjlsjxlbrihxlkirwj.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGpsc2p4bGJyaWh4bGtpcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODIyNDMsImV4cCI6MjA2NzY1ODI0M30.KP6YZtDGsH6_MtSJF03r2nhmEcXTvpd4Ppb-M3HYkhg";
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
  const { data, error } = await supabase.from("books_read").insert([book]).select().single();

  if (error) throw error;
  return data;
}
//SUPABASE UPDATE
async function updateBookInSupabase(id, updates) {
  const { data, error } = await supabase.from("books_read").update(updates).eq("id", id);

  if (error) {
    console.error("Update error:", error);
  } else {
    console.log("Book updated:", data);
  }
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
function applyFiltersAndRender() {
  // Basic filtering example — show all for now
  filteredBooks = allBooks;
  currentIndex = 0;
  renderGridView();
}
//Fave helper
function isBookFavorited(book) {
  return !!book.favorite;
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
// Read normalization function
function normalizeBook(book, isToRead = false) {
  const base = {
    id: book.id || null,
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
    // Default fallback full date (YYYY-MM-01)
    let normalizedDateRead = getFallbackDate();

    if (book.date_read && /^\d{4}-\d{2}-\d{2}$/.test(book.date_read)) {
      // Use full date as is
      normalizedDateRead = book.date_read;
    } else if (book.date_read && /^\d{4}-\d{2}$/.test(book.date_read)) {
      // If only YYYY-MM stored, append day for full date
      normalizedDateRead = book.date_read + "-01";
    }

    return {
      ...base,
      quote: (book.quote || "").trim(),
      review: (book.review || "").trim(),
      rating: parseInt(book.rating || "0"),
      despair: parseInt(book.despair || "0"),
      favorite: String(book.favorite || "").toLowerCase(),
      tags: Array.isArray(book.tags) ? book.tags.map((t) => t.trim().toLowerCase()) : [],
      dateRead: normalizedDateRead, // full date, for DB and logic
      dateReadDisplay: normalizedDateRead.slice(0, 7) // YYYY-MM, for UI display
    };
  }
}

function isValidDateRead(dateStr) {
  // Expecting "YYYY-MM" e.g. "2025-07"
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(dateStr);
}

function getFallbackDate() {
  const now = new Date();
  // Return full date string with day = 01
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
  if (book.cover?.trim()) return book.cover.trim();

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

// --- APPLY FILTERS ---
async function applyFilters() {
  if (viewMode === "favorites") {
    filteredBooks = allBooks.filter(isBookFavorited);
  } else if (viewMode === "to-read") {
    if (toReadBooks.length === 0) {
      await fetchToReadBooks();
    } else {
      applyToReadFilter();
    }
    return;
  } else {
    filteredBooks = allBooks;
  }

  if (activeTag) {
    filteredBooks = filteredBooks.filter((book) => book.tags.includes(activeTag.toLowerCase()));
  }

  currentIndex = 0;
  renderGridView();
}

function applyToReadFilter() {
  try {
    if (activeToReadTag) {
      filteredToReadBooks = toReadBooks.filter((book) => {
        return (book.tags || []).some((tag) => tag.toLowerCase() === activeToReadTag.toLowerCase());
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

// --- RENDER GRID (Main - with async cover support + working overlay) ---
async function renderGridView() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  // Preload all cover URLs safely
  const coverUrls = await Promise.all(
    filteredBooks.map(async (book) => {
      try {
        return await getCoverUrl(book);
      } catch (e) {
        console.warn("Error getting cover for book:", book.title, e);
        return placeholderImage;
      }
    })
  );
  filteredBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");
    img.src = coverUrls[index] || placeholderImage;
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = placeholderImage;
    };

    item.appendChild(img);

    // 💡 IMPORTANT: Ensure popup overlay appears
    item.addEventListener("click", () => {
      currentIndex = index;
      renderSingleCard(book);
      document.getElementById("cardOverlay").classList.remove("hidden");
    });

    grid.appendChild(item);
  });
}
async function renderToReadGrid() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  if (toReadBooks.length === 0) {
    grid.innerHTML = `<p style="text-align:center;">No to-read books found.</p>`;
    return;
  }
  // Fetch all cover URLs asynchronously
  const coverUrls = await Promise.all(filteredToReadBooks.map((book) => getCoverUrl(book)));
  filteredToReadBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "to-read-grid-item";

    const img = document.createElement("img");
    img.src = coverUrls[index] || placeholderImage;
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
async function renderSingleCard(book) {
  if (!book) return;
  document.getElementById("cardOverlay").classList.remove("hidden");

  let tags = Array.isArray(book.tags) ? book.tags : [];

  const tagsHTML =
    tags
      .map(
        (tag) =>
          `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
      )
      .join("") + `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

  const bookCard = document.getElementById("bookCard");
  bookCard.className = "book-popup";
  const ratingStars = "★".repeat(book.rating).padEnd(5, "☆");
  const isFavorited = book.favorite === "y";
  const favoriteClass = isFavorited ? "favorite-heart active" : "favorite-heart";
  const coverSrc = await getCoverUrl(book);

  bookCard.innerHTML = `
<button id="closeCardBtn" class="close-btn" aria-label="Close">&times;</button>
<div class="book-card-content">
 <div class="cover-container">
      <img src="${coverSrc}" alt="Cover of ${book.title}" onerror="this.onerror=null;this.src='${placeholderImage}'" />
    </div>
    <div class="rating-header">
    <div class="rating" title="Rating">
      ${[1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<span class="rating-star ${i <= book.rating ? "filled" : ""}" data-value="${i}">${
              i <= book.rating ? "★" : "☆"
            }</span>`
        )
        .join("")}
    </div>
    <div class="despair-level" title="Despair Level">
      ${[1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<span class="despair-icon" data-value="${i}" title="Despair ${i}" ${i <= (book.despair || 0) ? 'data-selected="true"' : ""}>${getDespairIcon(i)}</span>`
        )
        .join("")}
    </div>
  </div>
  <div class="quote-box">
      <i data-lucide="quote" class="quote-icon close-quote"></i>
      <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "No quote available"}</div>
      <i data-lucide="quote" class="quote-icon open-quote"></i>
    </div>
       <div class="title">${book.title || "Untitled"}</div>
    <div class="author">${book.author || "Unknown"}</div>
</div> 
<div class="card-footer">
  <div class="card-footer-left">
    <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
    <div class="date-read-container">
      <i data-lucide="calendar-1" class="calendar-icon calendar-toggle" style="cursor:pointer;"></i>
    </div>
  </div>
  <div class="card-footer-right">
    <div class="tags">${tagsHTML}</div>
  </div>
</div>
  `;

  lucide.createIcons();

  // Make quote editable
  const quoteEl = document.getElementById("quoteEditable");
  if (quoteEl) {
    quoteEl.setAttribute("contenteditable", "true");
    quoteEl.addEventListener("blur", async () => {
      const newQuote = quoteEl.innerText.trim();
      if (newQuote !== book.quote) {
        await supabase.from("read_books").update({ quote: newQuote }).eq("id", book.id);
        book.quote = newQuote;
      }
    });

    makeEditableOnClick(quoteEl, book, "quote");
  }
  // Star rating click handlers
  bookCard.querySelectorAll(".rating-star").forEach((star) => {
    star.addEventListener("click", async () => {
      const newRating = parseInt(star.dataset.value);
      await updateBookInSupabase(book.id, { rating: newRating });
      book.rating = newRating;
      renderSingleCard(book);
    });
  });
  // Despair icon click handlers
  bookCard.querySelectorAll(".despair-icon").forEach((icon) => {
    icon.addEventListener("click", async () => {
      const newDespair = parseInt(icon.dataset.value);
      await updateBookInSupabase(book.id, { despair: newDespair });
      book.despair = newDespair;
      renderSingleCard(book);
    });
  });
  // Close button
  const closeBtn = bookCard.querySelector("#closeCardBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("cardOverlay").classList.add("hidden");
    });
  }
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
  document.getElementById("favoriteHeart").addEventListener("click", async () => {
    const newFav = book.favorite === "y" ? "" : "y";
    await updateBookInSupabase(book.id, { favorite: newFav });
    book.favorite = newFav;
    renderSingleCard(book);
  });
  //Editable quote + review fields
  makeEditableOnClick(document.getElementById("quoteEditable"), book, "quote");
  makeEditableOnClick(document.getElementById("reviewEditable"), book, "review");

  // Tag filtering and delete tag buttons
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    if (tagEl.classList.contains("add-tag-btn")) return;

    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
      document.getElementById("cardOverlay").classList.add("hidden");
    });
    const delBtn = tagEl.querySelector(".delete-tag-btn");
    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tagToRemove = tagEl.dataset.tag;
        const newTags = tags.filter((t) => t.toLowerCase() !== tagToRemove);
        await updateBookInSupabase(book.id, { tags: newTags });
        book.tags = newTags;
        renderSingleCard(book);
      });
    }
  });
  // Add tag button opens tag input popup (defined below)
  bookCard.querySelector(".add-tag-btn").addEventListener("click", () => {
    showTagInput(book, false);
  });
}
//ADD TAG BUTTONS IN FOOTER - suggested, etc //
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
  input.maxLength = 30;

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "tag-input-buttons";

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.disabled = true;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";

  buttonContainer.appendChild(addBtn);
  buttonContainer.appendChild(cancelBtn);

  // Suggested tags
  const suggestionsContainer = document.createElement("div");
  suggestionsContainer.className = "tag-suggestions";

  suggestedTags.forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag suggested-tag-btn";
    tagEl.textContent = tag;
    tagEl.addEventListener("click", () => {
      input.value = tag;
      input.dispatchEvent(new Event("input")); // enable add button
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

  input.addEventListener("input", () => {
    addBtn.disabled = input.value.trim() === "";
  });

  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  addBtn.addEventListener("click", async () => {
    const newTag = input.value.trim();
    if (!newTag) return;

    let currentTags = Array.isArray(book.tags) ? book.tags : [];
    if (!currentTags.some((t) => t.toLowerCase() === newTag.toLowerCase())) {
      currentTags.push(newTag);
    }

    if (isToRead) {
      // if you handle to-read tags separately
      await updateToReadBookTags(book.id, currentTags);
    } else {
      await updateBookInSupabase(book.id, { tags: currentTags });
    }

    book.tags = currentTags;
    document.body.removeChild(overlay);

    renderSingleCard(book); // refresh card to show new tags
  });

  // Close popup if clicked outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// To-read card popup (unchanged except for tags if needed)
async function renderToReadCard(book) {
  if (!book) return;

  let tags = Array.isArray(book.tags) ? book.tags : [];

  const tagsHTML =
    tags
      .map(
        (tag) =>
          `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
      )
      .join("") + `<span class="tag add-tag-btn" title="Add Tag">+</span>`;

  const bookCard = document.getElementById("bookCard");
  const coverSrc = await getCoverUrl(book);
  bookCard.className = "book-popup";

  bookCard.innerHTML = `
  <button id="closeToReadCard" class="close-btn" aria-label="Close">&times;</button>
  <div class="book-card-content">
  <div class="to-read-cover-container">
    <img src="${coverSrc || placeholderImage}" alt="Cover of ${book.title}" />
  </div>
  <div class="to-read-title">${book.title || "Untitled"}</div>
  <div class="to-read-author">${book.author || "Unknown"}</div>
  <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>
</div>
  <div class="card-footer">
    <div class="card-footer-left">
      <button id="moveToReadAddBtn" class="move-to-read-btn">Add as Read</button>
    </div>
    <div class="card-footer-right">
      <div class="tags">${tagsHTML}</div>
    </div>
  </div>
`;

  // Add to read button
  document.getElementById("moveToReadAddBtn").addEventListener("click", () => {
    const popup = document.getElementById("addBookPopup");
    popup.classList.remove("hidden");
    // Pre-fill title and author
    document.getElementById("addTitle").value = book.title || "";
    document.getElementById("addAuthor").value = book.author || "";
    document.getElementById("addIsbn").value = book.isbn || "";
    document.getElementById("addBookPopup").classList.remove("hidden");

    // Store the to-read book id for later deletion
    popup.dataset.toReadId = book.id;
  });

  //Card close button
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
      tags = tags.filter((t) => t.toLowerCase() !== tagToRemove);
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
    const { data, error } = await supabase.from("books_to_read").select("title, author").order("title");

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

// --- UTILITIES ---
function getDespairIcon(value) {
  const icons = {
    1: "smile",
    2: "meh",
    3: "frown",
    4: "smile",
    5: "skull"
  };

  const iconName = icons[value] || "help-circle";
  // Flip smile only when value is 4
  const upsideDownClass = value === 4 ? "upside-down" : "";

  return `<i data-lucide="${iconName}" class="${upsideDownClass}"></i>`;
}

// === Editable field helper ===
function makeEditableOnClick(el, book, field) {
  el.addEventListener("click", () => {
    el.contentEditable = "true";
    el.classList.add("editing");
    el.focus();
  });

  el.addEventListener("blur", async () => {
    el.contentEditable = "false";
    el.classList.remove("editing");
    const newVal = el.textContent.trim();
    if (book[field] !== newVal) {
      await updateBookInSupabase(book.id, { [field]: newVal });
      book[field] = newVal;
    }
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  });
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

  //Button event listeners
  document.getElementById("homeBtn").onclick = () => {
    viewMode = "all";
    activeTag = null;
    applyFilters(); // 🔥 show all books from local copy
  };

  document.getElementById("favoritesBtn").onclick = () => {
    viewMode = viewMode === "favorites" ? "all" : "favorites";
    activeTag = null;
    applyFilters();
  };
  document.getElementById("showReadBtn").onclick = () => {
    renderQuickListCard();
  };
  document.getElementById("showToReadBtn").onclick = async () => {
    viewMode = "to-read";
    activeToReadTag = null;
    await fetchToReadBooks();
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  // Open Add Book popup
  document.getElementById("addBookBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.remove("hidden");
  });
  // Now that popup is visible, attach calendar toggle logic
  const calendarToggle = document.querySelector("#addBookPopup .calendar-toggle");
  const monthPicker = document.querySelector("#addBookPopup .month-picker");

  if (calendarToggle && monthPicker) {
    calendarToggle.addEventListener("click", () => {
      monthPicker.classList.toggle("hidden");
      if (!monthPicker.classList.contains("hidden")) {
        monthPicker.focus();
      }
    });
  }

  document.getElementById("addBookConfirm").addEventListener("click", async () => {
    const title = document.getElementById("addTitle").value.trim();
    const author = document.getElementById("addAuthor").value.trim();
    const isbn = document.getElementById("addIsbn").value.trim().replace(/[-\s]/g, "");
    const quote = document.getElementById("addQuote").value.trim();
    const review = document.getElementById("addReview").value.trim();
    const rating = parseInt(document.getElementById("addRating").value) || 0;
    const despair = parseInt(document.getElementById("addDespair").value) || 0;
    const tags = document
      .getElementById("addTags")
      .value.split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    let dateReadText = document.getElementById("dateReadInput").textContent.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dateReadText)) {
      dateReadText = getFallbackDate(); // fallback if invalid or empty
    }
    const date_read = dateReadText;
    const dateReadDiv = document.getElementById("dateReadInput");

    dateReadDiv.addEventListener("blur", () => {
      let val = dateReadDiv.textContent.trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) {
        alert("Date Read must be in YYYY-MM format.");
        dateReadDiv.textContent = "YYYY-MM"; // reset on invalid
      }
    });

    dateReadDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        dateReadDiv.blur();
      }
    });

    const favorite = document.getElementById("addFavoriteHeart").classList.contains("active") ? "y" : "";

    if (!title || !author) {
      alert("Title and author are required.");
      return;
    }

    const cover = await getCoverUrl({ title, author, isbn });

    const book = {
      title,
      author,
      isbn,
      quote,
      review,
      rating,
      despair,
      favorite,
      tags,
      date_read,
      cover
    };

    try {
      // Insert into books_read
      const added = await addBookToSupabase(book);
      allBooks.unshift(normalizeBook(added));
      applyFiltersAndRender();

      // Check if this book came from a to-read item
      const popup = document.getElementById("addBookPopup");
      const toReadId = popup.dataset.toReadId;
      if (toReadId) {
        // Delete from books_to_read table
        const { error: deleteError } = await supabase.from("books_to_read").delete().eq("id", toReadId);

        if (deleteError) {
          console.error("Failed to delete from to-read:", deleteError);
        } else {
          // Remove locally
          toReadBooks = toReadBooks.filter((b) => b.id !== toReadId);
          filteredToReadBooks = filteredToReadBooks.filter((b) => b.id !== toReadId);
          renderToReadGrid();
        }

        // Clear stored toReadId
        popup.dataset.toReadId = "";
      }

      // Hide popup and clear form
      document.getElementById("addBookPopup").classList.add("hidden");
      clearAddBookForm();
    } catch (e) {
      console.error("Error adding book:", e);
      alert("Failed to add book: " + (e?.message || e));
    }
  });

  function clearAddBookForm() {
    ["addTitle", "addAuthor", "addIsbn", "addQuote", "addReview", "addRating", "addDespair", "addTags"].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      }
    );

    const dateEl = document.getElementById("dateReadInput");
    if (dateEl) dateEl.textContent = "YYYY-MM"; // reset editable date field

    const addFavoriteHeart = document.getElementById("addFavoriteHeart");
    if (addFavoriteHeart) addFavoriteHeart.classList.remove("active");
  }

  // Close popup via event delegation
  document.getElementById("addBookPopup").addEventListener("click", (event) => {
    if (event.target.id === "closePopupBtn") {
      event.preventDefault();
      console.log("Close popup clicked");
      document.getElementById("addBookPopup").classList.add("hidden");
      clearAddBookForm();
    }
  });

  // Attach other handlers, fetch books, etc.
  attachToolbarHandlers();
  await fetchBooks();
});

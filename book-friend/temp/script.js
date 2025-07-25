import { showToast, rainGlitter } from "./glitter.js";
import { getCoverUrl, placeholderImage, fetchSynopsis, fetchFilteredSubjects } from "./coverAPI.js";

const supabaseUrl = "https://pnpjlsjxlbrihxlkirwj.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGpsc2p4bGJyaWh4bGtpcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODIyNDMsImV4cCI6MjA2NzY1ODI0M30.KP6YZtDGsH6_MtSJF03r2nhmEcXTvpd4Ppb-M3HYkhg";

const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const BookCardpopup = document.getElementById("BookCardpopup");
const dimOverlay = document.getElementById("dimOverlay");
const bookCard = document.getElementById("bookCard");
const gridContainer = document.getElementById("gridContainer");

// Add delegated click listener for the CONTENT overlay
BookCardpopup.addEventListener("click", (e) => {
  // If the click is on an element with data-close or the overlay background itself
  if (e.target.matches("[data-close]") || e.target === BookCardpopup) {
    closeContentOverlay();
  }
});

// Global state
let allBooks = [],
  filteredBooks = [],
  currentIndex = 0,
  viewMode = "all",
  activeTag = null;
let toReadBooks = [],
  filteredToReadBooks = [],
  activeToReadTag = null;

const suggestedTags = ["fiction", "poetry", "horror", "nonfiction", "sci-fi", "biography", "mystery"];

// --- Universal Overlay & Scrolling Functions ---

// This function simply adds a class to the body.
function lockScroll() {
  document.body.classList.add("popup-open");
}

// This function simply removes the class from the body.
function unlockScroll() {
  document.body.classList.remove("popup-open");
}

// openContentOverlay remains the same, but without the event listener logic.
function openContentOverlay(htmlContent) {
  const bookCard = document.getElementById("bookCard");
  bookCard.innerHTML = htmlContent;
  BookCardpopup.classList.remove("hidden");
  dimOverlay.classList.remove("hidden");
  lockScroll();
}

// closeContentOverlay remains the same, but without the event listener logic.
function closeContentOverlay() {
  BookCardpopup.classList.add("hidden");
  dimOverlay.classList.add("hidden");
  unlockScroll();
  document.getElementById("bookCard").innerHTML = "";
}

// Normalize book data from Supabase, separate read vs to-read books
function normalizeBook(book, isToRead = false) {
  const base = {
    id: book.id || null,
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    isbn: (book.isbn || "").replace(/[-\s]/g, "").trim(),
    cover: (book.cover || "").trim(),
    tags: Array.isArray(book.tags) ? book.tags.map((t) => t.trim().toLowerCase()) : []
  };

  if (isToRead) {
    return {
      ...base,
      notes: (book.notes || "").trim()
    };
  } else {
    let normalizedDateRead = getFallbackDate();

    if (book.date_read && /^\d{4}-\d{2}-\d{2}$/.test(book.date_read)) {
      normalizedDateRead = book.date_read;
    } else if (book.date_read && /^\d{4}-\d{2}$/.test(book.date_read)) {
      normalizedDateRead = book.date_read + "-01";
    }

    return {
      ...base,
      quote: (book.quote || "").trim(),
      review: (book.review || "").trim(),
      rating: parseInt(book.rating || "0"),
      despair: parseInt(book.despair || "0"),
      favorite: !!book.favorite,
      dateRead: normalizedDateRead,
      dateReadDisplay: normalizedDateRead.slice(0, 7)
    };
  }
}

function getFallbackDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
//Fave helper
function isBookFavorited(book) {
  return !!book.favorite;
}
// --- Supabase helpers ---
async function addBookToSupabase(book) {
  const { data, error } = await supabase.from("books_read").insert([book]).select().single();
  if (error) throw error;
  return data;
}
async function updateBookInSupabase(id, updates) {
  const { data, error } = await supabase.from("books_read").update(updates).eq("id", id);
  if (error) {
    console.error("Update error:", error);
    return null;
  }
  return data;
}
async function updateToReadBookTags(id, tags) {
  const { data, error } = await supabase.from("books_to_read").update({ tags }).eq("id", id);
  if (error) {
    console.error("Error updating to-read tags:", error);
    return null;
  }
  return data;
}
// --- FETCH BOOKS ---
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
// --- APPLY FILTERS ---
function applyFiltersAndRender() {
  // Basic filtering example — show all for now
  filteredBooks = allBooks;
  currentIndex = 0;
  renderGridView();
}
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
  renderSingleCard(book); // This function will now handle opening the overlay
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
    item.className = "grid-item";

    const img = document.createElement("img");
    img.src = coverUrls[index] || placeholderImage;
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = placeholderImage;
    };

    item.appendChild(img);

   item.addEventListener("click", () => {
  renderToReadCard(book); // This function will now handle opening the overlay
});

    grid.appendChild(item);
  });
}
// Main book card popup with integrated custom tag display and add/delete
async function renderSingleCard(book) {
  if (!book) return;

  let tags = book.tags;

  const tagsHTML = tags
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");

  const coverSrc = await getCoverUrl(book);
  const ratingStars = "★".repeat(book.rating).padEnd(5, "☆");
  const isFavorited = !!book.favorite;
  const favoriteClass = isFavorited ? "favorite-heart active" : "favorite-heart";

  const cardHTML = `
<button class="close-btn" data-close aria-label="Close">&times;</button>
<div class="book-card-content">
<div class="cover-container">
      <img src="${coverSrc}" alt="Cover of ${book.title}" onerror="this.onerror=null;this.src='${placeholderImage}'"/>
    </div>
<div class="quote-box">
      <i data-lucide="quote" class="quote-icon close-quote"></i>
      <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "No quote available"}</div>
      <i data-lucide="quote" class="quote-icon open-quote"></i>
    </div>
<div class="title">${book.title || "Untitled"}</div>
<div class="author">${book.author || "Unknown"}</div>
<div class="review-box">
<div id="reviewEditable" class="review-text editable" contenteditable="false" title="Click to edit review">
  ${book.review?.trim() ? book.review : "Add your thoughts..."}
</div>
</div>
</div>
<div class="card-footer">
    <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
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
  ${
    typeof book.despair === "number" && book.despair > 0
      ? `<span class="despair-icon" data-value="${book.despair}" title="Despair ${book.despair}" data-selected="true">${getDespairIcon(book.despair)}</span>`
      : `<span class="despair-icon no-despair" title="No Despair" data-value="0">${getDespairIcon(0)}</span>`
  }
</div>
      <span class="tag add-tag-btn" title="Add Tag">+</span>
  </div>
   <div class="tag-footer">
      <div class="tags">${tagsHTML}</div>
    </div>
 `;
  
  openContentOverlay(cardHTML);
  
  lucide.createIcons();

  const bookCard = document.getElementById("bookCard"); 
  
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
  const despairIcon = bookCard.querySelector(".despair-icon");
  if (despairIcon) {
    despairIcon.addEventListener("click", async () => {
      let current = parseInt(despairIcon.dataset.value) || 0;
      // Cycle from 0 (no despair) up to 5, then back to 0
      let newDespair = (current + 1) % 6; // cycles 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 0

      await updateBookInSupabase(book.id, { despair: newDespair });
      book.despair = newDespair;
      renderSingleCard(book);
    });
  }

  // 🧼 Clean review text before making it editable to remove extra blank lines
  const reviewEl = document.getElementById("reviewEditable");
  if (reviewEl) {
    const cleanReview = (book.review || "")
      .replace(/^\s+|\s+$/g, "") // Trim start/end whitespace
      .replace(/\n{2,}/g, "\n"); // Collapse multiple newlines
    reviewEl.textContent = cleanReview;
  }

  //Editable quote + review fields
  ["quote", "review"].forEach((field) => {
    const el = document.getElementById(`${field}Editable`);
    if (el) makeEditableOnClick(el, book, field);
  });

  // Toggle favorite
  document.getElementById("favoriteHeart").addEventListener("click", async () => {
    // Toggle boolean favorite
    const newFav = book.favorite === true ? false : true;
    await updateBookInSupabase(book.id, { favorite: newFav });
    book.favorite = newFav;
    renderSingleCard(book);
  });

  // Tag filtering and delete tag buttons
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    if (tagEl.classList.contains("add-tag-btn")) return;

    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
      document.getElementById("BookCardpopup").classList.add("hidden");
    });
    const delBtn = tagEl.querySelector(".delete-tag-btn");
    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tagToRemove = tagEl.dataset.tag;
        const newTags = book.tags.filter((t) => t.toLowerCase() !== tagToRemove);
        const result = await updateBookInSupabase(book.id, { tags: newTags });
        if (result !== null) {
          book.tags = newTags;
          renderSingleCard(book); // or renderToReadCard(book)
        } else {
          console.warn("Failed to delete tag from Supabase.");
        }
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
  document.body.appendChild(overlay);
  lockScroll();

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
    unlockScroll(); // Add this!
  });
  addBtn.addEventListener("click", async () => {
    const newTag = input.value.trim();
    if (!newTag) return;

    let currentTags = book.tags || [];
    if (!currentTags.some((t) => t.toLowerCase() === newTag.toLowerCase())) {
      currentTags.push(newTag);
      if (isToRead) {
        await updateToReadBookTags(book.id, currentTags);
      } else {
        await updateBookInSupabase(book.id, { tags: currentTags });
      }
      book.tags = currentTags; // ✅ Reassign AFTER push
    }
    document.body.removeChild(overlay);
    unlockScroll();

    // ✅ RENDER the correct card type
    if (isToRead) {
      renderToReadCard(book);
    } else {
      renderSingleCard(book);
    }
  });
}
// To-read card popup (unchanged except for tags if needed) //
async function renderToReadCard(book) {
  if (!book) return;
  // Existing tags from the book
  let tags = book.tags;
  // Fetch filtered subjects from OpenLibrary API
  const subjectTags = await fetchFilteredSubjects(book.title, book.author);
  const mergedTags = Array.from(new Set([...book.tags, ...subjectTags]));
  // Merge existing tags and fetched subject tags, deduplicated
  tags = Array.from(new Set([...tags, ...subjectTags]));

  // ✅ Check merged tag array and update only if changed
  if (mergedTags.length !== book.tags.length) {
    const result = await updateToReadBookTags(book.id, mergedTags); // ✅ correct table
    if (result !== null) {
      book.tags = mergedTags;
      tags = mergedTags;

      // ✅ Refresh grid view if tag list changed (important for active tag filters)
      await fetchToReadBooks();
    } else {
      console.warn("Failed to update merged tags to Supabase.");
    }
  }
  // Build tags HTML
  const tagsHTML = tags
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");
  
  const coverSrc = await getCoverUrl(book);
  const cardHTML = `
<button class="close-btn" data-close aria-label="Close">&times;</button>
  <div class="book-card-content">
    <div class="cover-container">
      <img src="${coverSrc || placeholderImage}" alt="Cover of ${book.title}" />
    </div>
    <div class="title">${book.title || "Untitled"}</div>
    <div class="author">${book.author || "Unknown"}</div>
    <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>
  </div>
  <div class="card-footer">
      <button id="moveToReadAddBtn" class="move-to-read-btn">Add as Read</button>
      <span class="tag add-tag-btn" title="Add Tag">+</span>
    </div>
   <div class="tag-footer">
      <div class="tags">${tagsHTML}</div>
</div>
`;
  
  openContentOverlay(cardHTML);
  
  // Add to read button handler
  document.getElementById("moveToReadAddBtn").addEventListener("click", () => {
    const popup = document.getElementById("addBookPopup");
    popup.classList.remove("hidden");
    document.getElementById("addTitle").value = book.title || "";
    document.getElementById("addAuthor").value = book.author || "";
    document.getElementById("addIsbn").value = book.isbn || "";
    // ✅ Add this line to transfer tags
    const tagField = document.getElementById("addTags");
    tagField.value = Array.isArray(book.tags) ? book.tags.join(", ") : "";
    // Preserve to-read ID so we can delete it after saving
    popup.dataset.toReadId = book.id;
  });
  // Tag click: filter books by tag, then close popup
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      activeToReadTag = tagEl.dataset.tag.toLowerCase();
      applyToReadFilter();
      document.getElementById("BookCardpopup").classList.add("hidden");
    });
  });
  // Add tag button
  bookCard.querySelectorAll(".add-tag-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTagInput(book, true);
    });
  });
  // Delete tag button
  bookCard.querySelectorAll(".delete-tag-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tagSpan = delBtn.parentElement;
      const tagToRemove = tagSpan.dataset.tag;
      tags = tags.filter((t) => t.toLowerCase() !== tagToRemove);

      // Update tags in Supabase
      const updateResult = await updateToReadBookTags(book.id, tags);
      if (updateResult !== null) {
        book.tags = tags; // Update local book object
        renderToReadCard(book);
      } else {
        console.error("Failed to update tags in Supabase.");
        // Optionally, show error feedback to user here
      }
    });
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

    // Create the HTML for the quick list card
    const cardHTML = `
      <button class="close-btn" data-close aria-label="Close">×</button>
      <div class="quicklist-header">Quick List</div>
      <div class="quicklist-content">${listItems}</div>
    `;

    // Open the content overlay with our generated HTML
    openContentOverlay(cardHTML);

  } catch (err) {
    console.error("Error loading quick list", err);
    const errorHTML = `<p style="color:red;">Failed to load quick list.</p><button class="close-btn" data-close>×</button>`;
    openContentOverlay(errorHTML);
  }
}

function getDespairIcon(value) {
  const icons = {
    0: "cloud-rain", // no despair
    1: "smile",
    2: "meh",
    3: "frown",
    4: "smile",
    5: "skull"
  };
  const validValue = typeof value === "number" && value >= 0 && value <= 5 ? value : 0;
  const iconName = icons[validValue] || "help-circle";
  const upsideDownClass = validValue === 4 ? "upside-down" : "";
  return `<i data-lucide="${iconName}" class="${upsideDownClass}"></i>`;
}

// === Editable field helper ===
function makeEditableOnClick(el, book, field) {
  el.addEventListener("click", () => {
    if (!el.classList.contains("editing")) {
      el.contentEditable = "true";
      el.classList.add("editing");
      el.focus();

      // Move caret to end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  el.addEventListener("blur", async () => {
    if (el.classList.contains("editing")) {
      el.classList.remove("editing");
      el.contentEditable = "false";

      // Clean text content: remove all leading/trailing newlines
      let newValue = el.innerText.replace(/^\s+|\s+$/g, "");

      // Normalize multiple blank lines to a single space
      newValue = newValue.replace(/\n{2,}/g, "\n");

      if (newValue !== (book[field] || "").trim()) {
        const updateObj = {};
        updateObj[field] = newValue;
        await updateBookInSupabase(book.id, updateObj);
        book[field] = newValue;
      }
    }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
    viewMode = "favorites";
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
    lockScroll(); 
  });
  
  // Favorite heart toggle
  const favHeart = document.getElementById("addFavoriteHeart");
  if (favHeart) {
    favHeart.addEventListener("click", () => {
      favHeart.classList.toggle("active");
    });
  }
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
    
    // Validate format YYYY-MM
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(dateReadText)) {
      
      // If only year-month, append day
      dateReadText = dateReadText + "-01";
    } else if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(dateReadText)) {
      
      // If invalid format, fallback to full date string (already with day)
      dateReadText = getFallbackDate();
    }
    // Now dateReadText is guaranteed to be a valid YYYY-MM-DD string
    
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
    const favorite = document.getElementById("addFavoriteHeart").classList.contains("active");
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
      unlockScroll(); // Add this
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
      document.getElementById("addBookPopup").classList.add("hidden");
      clearAddBookForm();
      unlockScroll(); // Add this
    }
  });
  // Attach other handlers, fetch books, etc.
  attachToolbarHandlers();
  await fetchBooks();
});

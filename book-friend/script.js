import { showToast, rainGlitter } from "./glitter.js";
import { getCoverUrl, getRandomPlaceholder, fetchSynopsis, fetchIsbn, clearApiCache } from "./coverAPI.js";

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
  // If the click is on the overlay background or an element inside a button with data-close
  if (e.target.closest("[data-close]") || e.target === BookCardpopup) {
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
let unfinishedBooks = [],
  filteredUnfinishedBooks = [],
  activeUnfinishedTag = null;

const suggestedTags = ["fiction", "poetry", "horror", "nonfiction", "sci-fi", "biography", "mystery"];

///////////////////////////////////////////////////
/// Rating click handlers for Add New Book card ///
///////////////////////////////////////////////////

let selectedRating = 0;
let selectedDespair = 0;

// This function sets up ALL event listeners for the Add Book form.
function initializeAddBookForm() {
  const addBookPopup = document.getElementById("addBookPopup");

  // Rating click handler
  const ratingStars = addBookPopup.querySelectorAll("#addBookRating .rating-star");
  ratingStars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating = parseInt(star.dataset.value);

      ratingStars.forEach((s) => {
        const isFilled = parseInt(s.dataset.value) <= selectedRating;
        s.textContent = isFilled ? "★" : "☆";
        s.classList.toggle("filled", isFilled);
      });
    });
  });

  // Despair click handler
  const despairIcons = addBookPopup.querySelectorAll("#addBookDespair .despair-icon");
  despairIcons.forEach((icon) => {
    icon.addEventListener("click", () => {
      const newValue = parseInt(icon.dataset.value);

      selectedDespair = selectedDespair === newValue ? 0 : newValue;
      despairIcons.forEach((i) => {
        i.dataset.selected = (parseInt(i.dataset.value) <= selectedDespair).toString();
      });
    });
  });

  // Favorite heart toggle
  const favHeart = document.getElementById("addFavoriteHeart");
  if (favHeart) {
    favHeart.addEventListener("click", () => {
      favHeart.classList.toggle("active");
    });
  }
}
// --- Universal Overlay & Scrolling Functions ---

// Find the main app container once at the top
const appContainer = document.getElementById("app-container");

function lockScroll() {
  // 1. Add the class to the body to hide the scrollbar
  document.body.classList.add("popup-open");

  // 2. Make the main content container non-interactive
  if (appContainer) {
    appContainer.classList.add("inert");
    // For accessibility, tell screen readers the background is hidden
    appContainer.setAttribute("aria-hidden", "true");
  }
}

function unlockScroll() {
  // 1. Remove the class from the body to restore scrolling
  document.body.classList.remove("popup-open");

  // 2. Make the main content container interactive again
  if (appContainer) {
    appContainer.classList.remove("inert");
    // For accessibility, remove the hidden attribute
    appContainer.removeAttribute("aria-hidden");
  }
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
      notes: (book.notes || "").trim(),
      start: !!book.start,
      quote: (book.quote || "").trim(),
      review: (book.review || "").trim()
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
  // Add .select() to get the updated data back
  const { data, error } = await supabase.from("books_read").update(updates).eq("id", id).select();
  if (error) {
    console.error("Update error:", error);
    return null;
  }
  return data;
}

async function updateToReadBookTags(id, tags) {
  // Also add .select() here
  const { data, error } = await supabase.from("books_to_read").update({ tags }).eq("id", id).select();
  if (error) {
    console.error("Error updating to-read tags:", error);
    return null;
  }
  return data;
}

async function addToReadToSupabase(book) {
  const { data, error } = await supabase.from("books_to_read").insert([book]).select().single();
  if (error) {
    console.error("Error adding to-read book:", error);
    throw error;
  }
  return data;
}

//Card delete button
async function deleteBook(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    console.error(`Error deleting book from ${table}:`, error);
    alert(`Failed to delete book. Please check the console for details.`);
    return false;
  }
  return true;
}

// New generic helper for the books_to_read table
async function updateToReadBook(id, updates) {
  const { data, error } = await supabase.from("books_to_read").update(updates).eq("id", id).select();
  if (error) {
    console.error("Error updating to-read book:", error);
    return null;
  }
  return data;
}
// --- FETCH BOOKS ---
async function fetchBooks() {
  try {
    const { data, error } = await supabase.from("books_read").select("*").order("date_read", { ascending: false });
    if (error) {
      console.error("Error fetching books:", error);
      return [];
    }
    return data.map((book) => normalizeBook(book));
  } catch (error) {
    console.error("Error fetching books:", error);
    return [];
  }
}

async function fetchToReadBooks() {
  try {
    const { data, error } = await supabase.from("books_to_read").select("*").order("title", { ascending: true });
    if (error) {
      console.error("Error fetching to-read books:", error);
      return []; // Return an empty array on error
    }
    // Just normalize and return the data. That's it.
    return data.map((book) => normalizeBook(book, true));
  } catch (error) {
    console.error("Error fetching to-read books:", error);
    return [];
  }
}

// --- APPLY FILTERS ---
function applyFiltersAndRender() {
  // Basic filtering example — show all for now
  filteredBooks = allBooks;
  currentIndex = 0;
  renderGridView();
}

// The new central controller for all views
async function applyFilters() {
  // --- Handle To-Read and Graveyard Views ---
  if (viewMode === "to-read" || viewMode === "unfinished") {
    // First, ensure we have the master list of all to-read books.
    // This only fetches from the network if the local array is empty.
    if (toReadBooks.length === 0) {
      toReadBooks = await fetchToReadBooks();
    }

    // Now, filter the MASTER list into the correct temporary list for rendering.
    if (viewMode === "to-read") {
      filteredToReadBooks = toReadBooks.filter((book) => !book.start);
      renderToReadGrid(); // Render the to-read grid
    } else {
      // viewMode must be "unfinished"
      filteredUnfinishedBooks = toReadBooks.filter((book) => book.start);
      renderGraveyardGrid(); // Render the graveyard grid
    }
    return; // IMPORTANT: Stop the function here for these views
  }

  // --- Handle Main and Favorites Views ---
  // This logic is only for the main "read" books grid.
  let booksToRender = allBooks;

  if (viewMode === "favorites") {
    booksToRender = allBooks.filter(isBookFavorited);
    booksToRender.sort((a, b) => b.dateRead.localeCompare(a.dateRead));
  }

  if (activeTag) {
    booksToRender = booksToRender.filter((book) => book.tags.includes(activeTag.toLowerCase()));
  }

  filteredBooks = booksToRender;
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
  grid.innerHTML = ""; // Clear the grid

  filteredBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");

    // Set a random placeholder instantly
    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    // Use the function for error fallback as well
    img.onerror = () => {
      img.src = getRandomPlaceholder();
    };

    item.appendChild(img);

    // Asynchronously fetch the real cover and pop it in when ready
    getCoverUrl(book).then((coverUrl) => {
      if (coverUrl) {
        img.src = coverUrl;
      }
    });

    item.addEventListener("click", () => {
      currentIndex = index;
      renderSingleCard(book);
    });

    grid.appendChild(item);
  });
}

async function renderToReadGrid() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  if (filteredToReadBooks.length === 0) {
    // Changed from toReadBooks
    grid.innerHTML = `<p style="text-align:center;">No to-read books found.</p>`;
    return;
  }

  filteredToReadBooks.forEach((book, index) => {
    // Changed from toReadBooks
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");

    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = getRandomPlaceholder();
    };

    item.appendChild(img);

    getCoverUrl(book).then((coverUrl) => {
      if (coverUrl) {
        img.src = coverUrl;
      }
    });

    item.addEventListener("click", () => {
      renderToReadCard(book);
    });

    grid.appendChild(item);
  });
}

async function renderGraveyardGrid() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";

  if (filteredUnfinishedBooks.length === 0) {
    grid.innerHTML = `<p style="text-align:center;">No unfinished books in the graveyard.</p>`;
    return;
  }

  filteredUnfinishedBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = document.createElement("img");

    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => {
      img.src = getRandomPlaceholder();
    };

    item.appendChild(img);

    getCoverUrl(book).then((coverUrl) => {
      if (coverUrl) {
        img.src = coverUrl;
      }
    });

    item.addEventListener("click", () => renderGraveyardCard(book));

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
  const isFavorited = !!book.favorite;
  const favoriteClass = isFavorited ? "favorite-heart active" : "favorite-heart";

  const cardHTML = `
    <div class="card-header-delete">
  <button id="deleteBookBtn" class="header-btn delete-btn" title="Delete Book"><i data-lucide="circle-slash-2"></i></button>
  <button data-close class="header-btn close-icon-btn" title="Close"><i data-lucide="x"></i></button>
</div>
<div class="book-card-content">
<div class="title">${book.title || "Untitled"}</div>
<div class="author">${book.author || "Unknown"}</div>
  <div class="quote-box">
      <i data-lucide="quote" class="quote-icon close-quote"></i>
      <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "No quote available"}</div>
      <i data-lucide="quote" class="quote-icon open-quote"></i>
    </div>
    <div class="rating-bar">
                <span class="review-header-text"><i data-lucide="panda"></i><i data-lucide="message-circle-more"></i></span>
 <div class="rating" title="Rating">
          ${[1, 2, 3, 4, 5]
            .map(
              (i) =>
                `<span class="rating-icon rating-star ${i <= book.rating ? "filled" : ""}" data-value="${i}">${
                  i <= book.rating ? "★" : "☆"
                }</span>`
            )
            .join("")}
        </div>
        </div>
<div class="review-box">
        <div id="reviewEditable" class="review-text editable" contenteditable="false" title="Click to edit review">${book.review?.trim() ? book.review : "Add your thoughts..."}</div>
      </div>
    </div>
          <div class="rating-bar">
      <div class="despair-rating" title="Despair Level">
          ${[1, 2, 3, 4, 5]
            .map(
              (i) => `
                <span class="rating-icon despair-icon" data-value="${i}" data-selected="${i <= book.despair ? "true" : "false"}">
                  ${getDespairIcon(i)}
                </span>`
            )
            .join("")}
        </div>
    </div>
    <div class="tag-footer">
     <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
   <div class="tags">${tagsHTML}</div>
     <span class="add-tag-btn" title="Add Tag">+</span>
     </div>

 `;

  openContentOverlay(cardHTML);
  lucide.createIcons();

  //Delete button confirmation
  const deleteBtn = document.getElementById("deleteBookBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const isConfirmed = confirm(`Are you sure you want to permanently delete "${book.title}"?`);
      if (isConfirmed) {
        // 1. Point to the correct table: 'books_read'
        const success = await deleteBook("books_read", book.id);

        if (success) {
          // 2. Filter from the correct local array: 'allBooks'
          allBooks = allBooks.filter((b) => b.id !== book.id);

          closeContentOverlay();
          applyFilters(); // Refresh the main grid
          showToast(`"${book.title}" was deleted.`);
        }
      }
    });
  }

  const bookCard = document.getElementById("bookCard");

  // Star rating click handler
  bookCard.querySelectorAll(".rating-star").forEach((star) => {
    star.addEventListener("click", async () => {
      const newRating = parseInt(star.dataset.value);
      await updateBookInSupabase(book.id, { rating: newRating });
      book.rating = newRating;
      renderSingleCard(book);
    });
  });

  // Despair rating click handler
  bookCard.querySelectorAll(".despair-icon").forEach((icon) => {
    icon.addEventListener("click", async () => {
      const newDespair = parseInt(icon.dataset.value);
      const currentDespair = book.despair || 0;

      // If clicking the same icon, reset to 0. Otherwise, set the new value.
      const finalDespair = currentDespair === newDespair ? 0 : newDespair;

      await updateBookInSupabase(book.id, { despair: finalDespair });
      book.despair = finalDespair;
      renderSingleCard(book);
    });
  });

  // 🧼 Clean review text before making it editable to remove extra blank lines
  const reviewEl = bookCard.querySelector("#reviewEditable");
  if (reviewEl && book.review?.trim()) {
    const cleanReview = book.review.replace(/^\s+|\s+$/g, "").replace(/\n{2,}/g, "\n");
    reviewEl.textContent = cleanReview;
  }

  //Editable quote + review fields
  ["quote", "review"].forEach((field) => {
    const el = bookCard.querySelector(`#${field}Editable`);
    if (el) makeEditableOnClick(el, book, field, updateBookInSupabase);
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
      closeContentOverlay();
    });

    const delBtn = tagEl.querySelector(".delete-tag-btn");
    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tagToRemove = tagEl.dataset.tag;
        const newTags = book.tags.filter((t) => t.toLowerCase() !== tagToRemove);
        const result = await updateBookInSupabase(book.id, { tags: newTags });
        // Now, a successful result is a truthy object, not null
        if (result) {
          book.tags = newTags;
          renderSingleCard(book);
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
  // Get the shared overlay. It should already be visible from the book card.
  const dimOverlay = document.getElementById("dimOverlay");
  lockScroll(); // Ensure scroll remains locked

  // Create ONLY the popup
  const popup = document.createElement("div");
  popup.className = "tag-input-popup";

  // --- All the popup element creation code remains exactly the same ---
  const title = document.createElement("h3");
  title.textContent = "Add a Tag";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter tag";
  input.autocomplete = "off";
  input.maxLength = 30;
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "add-cancel-button";
  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.disabled = true;
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  buttonContainer.appendChild(addBtn);
  buttonContainer.appendChild(cancelBtn);
  const suggestionsContainer = document.createElement("div");
  suggestionsContainer.className = "tag-suggestions";

  suggestedTags.forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag-cloud-btn";
    tagEl.id = `tag-cloud-btn-${tag.toLowerCase().replace(/\s+/g, "-")}`;
    tagEl.textContent = tag;
    tagEl.addEventListener("click", () => {
      input.value = tag;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
    suggestionsContainer.appendChild(tagEl);
  });

  popup.appendChild(title);
  popup.appendChild(input);
  popup.appendChild(suggestionsContainer);
  popup.appendChild(buttonContainer);
  document.body.appendChild(popup);

  // This function is now simpler. It ONLY removes the tag popup and its specific listener.
  const closeTagPopup = () => {
    document.body.removeChild(popup);
    dimOverlay.removeEventListener("click", handleOverlayClick);
  };

  // This handler calls the simplified close function.
  const handleOverlayClick = (e) => {
    if (e.target === dimOverlay) {
      closeTagPopup();
    }
  };

  // Add the specific listener for the tag popup
  dimOverlay.addEventListener("click", handleOverlayClick);

  // --- Update button listeners to use the new, safer close function ---
  input.addEventListener("input", () => {
    addBtn.disabled = input.value.trim() === "";
  });

  // The Cancel button now correctly closes ONLY the tag popup.
  cancelBtn.addEventListener("click", closeTagPopup);

  // Inside the showTagInput function...

  addBtn.addEventListener("click", async () => {
    const newTag = input.value.trim();
    if (!newTag) return;

    let currentTags = book.tags || [];
    if (!currentTags.some((t) => t.toLowerCase() === newTag.toLowerCase())) {
      currentTags.push(newTag);

      // --- THIS IS THE SIMPLIFIED LOGIC ---
      if (isToRead) {
        // This is true for BOTH 'to-read' and 'unfinished'
        await updateToReadBook(book.id, { tags: currentTags });
      } else {
        // This handles regular "read" books
        await updateBookInSupabase(book.id, { tags: currentTags });
      }
      book.tags = currentTags;
    }

    closeTagPopup();

    // This re-rendering logic is correct and doesn't need to change
    if (isToRead === "unfinished") {
      renderGraveyardCard(book);
    } else if (isToRead) {
      renderToReadCard(book);
    } else {
      renderSingleCard(book);
    }
  });
}

// To-read card popup  //

async function renderToReadCard(book) {
  if (!book) return;

  const tagsHTML = (book.tags || [])
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");

  const coverSrc = await getCoverUrl(book);
  const cardHTML = `
    <div class="card-header-delete">
  <button id="deleteBookBtn" class="header-btn delete-btn" title="Delete Book"><i data-lucide="minus"></i></button>
  <button data-close class="header-btn close-icon-btn" title="Close"><i data-lucide="x"></i></button>
</div>
    <div class="book-card-content">
      <div class="cover-container"><img src="${coverSrc || getRandomPlaceholder()}" alt="Cover of ${book.title}" /></div>
      <div class="title">${book.title || "Untitled"}</div>
      <div class="author">${book.author || "Unknown"}</div>
      <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>
    </div>
    <div class="tag-footer"><div class="tags">${tagsHTML}</div></div>
    <div class="card-footer">
      <button id="startBookBtn" class="move-to-read-btn">Start Reading</button>
      <span class="add-tag-btn" title="Add Tag">+</span>
    </div>`;

  openContentOverlay(cardHTML);
  lucide.createIcons();

  //Delete button confirmation
  const deleteBtn = document.getElementById("deleteBookBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      // Confirmation dialog
      const isConfirmed = confirm(`Are you sure you want to permanently delete "${book.title}"?`);

      if (isConfirmed) {
        // The table is 'books_to_read' for both to-read and graveyard books
        const success = await deleteBook("books_to_read", book.id);

        if (success) {
          // Remove the book from the local state to update the UI instantly
          toReadBooks = toReadBooks.filter((b) => b.id !== book.id);

          // Close the popup and refresh the grid view
          closeContentOverlay();
          applyFilters(); // This re-renders the grid without the deleted book

          showToast(`"${book.title}" was deleted.`);
        }
      }
    });
  }

  // --- Attach Event Listeners ---
  const cardElement = document.getElementById("bookCard");

  cardElement.querySelector(".add-tag-btn").addEventListener("click", () => {
    showTagInput(book, true);
  });

  document.getElementById("startBookBtn").addEventListener("click", async () => {
    const result = await updateToReadBook(book.id, { start: true });
    if (result) {
      book.start = true;
      applyFilters();
      closeContentOverlay();
    } else {
      alert("Could not start book. Please try again.");
    }
  });

  cardElement.querySelectorAll(".delete-tag-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tagToRemove = delBtn.parentElement.dataset.tag;
      const newTags = book.tags.filter((t) => t.toLowerCase() !== tagToRemove);

      const result = await updateToReadBook(book.id, { tags: newTags });

      if (result) {
        book.tags = newTags;
        renderToReadCard(book);
      } else {
        console.error("Failed to delete tag from to-read book.");
      }
    });
  });

  // Fetch and display the synopsis
  const synopsis = await fetchSynopsis(book.title, book.author);
  const synopsisElement = document.getElementById("toReadSynopsis");
  if (synopsisElement) {
    synopsisElement.textContent = synopsis;
  }
}

// Card Renderer for a unfinished Book
async function renderGraveyardCard(book) {
  if (!book) return;

  const tagsHTML = (book.tags || [])
    .map(
      (tag) =>
        `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`
    )
    .join("");

  const cardHTML = `
    <div class="card-header-delete">
      <button id="deleteBookBtn" class="header-btn delete-btn" title="Delete Book"><i data-lucide="circle-slash-2"></i></button>
      <button data-close class="header-btn close-icon-btn" title="Close"><i data-lucide="x"></i></button>
    </div>
    <div class="book-card-content">
      <div class="title">${book.title || "Untitled"}</div>
      <div class="author">${book.author || "Unknown"}</div>
      <div class="quote-box">
        <i data-lucide="quote" class="quote-icon close-quote"></i>
        <div id="quoteEditable" class="quote-text editable" contenteditable="false" title="Click to edit quote">${book.quote || "Add a quote..."}</div>
        <i data-lucide="quote" class="quote-icon open-quote"></i>
      </div>
      <div class="review-box">
        <div id="reviewEditable" class="review-text editable" contenteditable="false" title="Click to edit review">${book.review?.trim() ? book.review : "Add your thoughts..."}</div>
      </div>
    </div>
    <div class="tag-footer">
      <div class="tags">${tagsHTML}</div>
    </div>
    <div class="card-footer">
      <button id="moveToReadAddBtn" class="move-to-read-btn">Finished!</button>
            <span class="add-tag-btn" title="Add Tag">+</span>
    </div>
  `;

  openContentOverlay(cardHTML);
  lucide.createIcons(); // Don't forget to render icons

  ["quote", "review"].forEach((field) => {
    const el = document.getElementById(`${field}Editable`);
    // Here we pass the specific update function for the to-read table
    if (el) makeEditableOnClick(el, book, field, updateToReadBook);
  });

  // 🧼 Clean review text locally
  const reviewEl = bookCard.querySelector("#reviewEditable"); // <-- THE FIX IS HERE
  if (reviewEl && book.review?.trim()) {
    const cleanReview = book.review.replace(/^\s+|\s+$/g, "").replace(/\n{2,}/g, "\n");
    reviewEl.textContent = cleanReview;
  }

  // Pre-fill the "Add New Book" form
  document.getElementById("moveToReadAddBtn").addEventListener("click", () => {
    closeContentOverlay();
    const addBookPopup = document.getElementById("addBookPopup");
    addBookPopup.classList.remove("hidden");
    lockScroll();

    document.getElementById("addTitle").value = book.title || "";
    document.getElementById("addAuthor").value = book.author || "";
    document.getElementById("addIsbn").value = book.isbn || "";
    document.getElementById("addTags").value = (book.tags || []).join(", ");

    // --- PRE-FILL THE QUOTE AND REVIEW ---
    document.getElementById("addQuote").value = book.quote || "";
    document.getElementById("addReview").value = book.review || "";

    addBookPopup.dataset.toReadId = book.id;
  });

  // Delete button logic
  const cardElement = document.getElementById("bookCard");
  cardElement.querySelector(".add-tag-btn").addEventListener("click", () => showTagInput(book, "unfinished"));

  const deleteBtn = document.getElementById("deleteBookBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const isConfirmed = confirm(`Are you sure you want to permanently delete "${book.title}"?`);
      if (isConfirmed) {
        const success = await deleteBook("books_to_read", book.id);
        if (success) {
          toReadBooks = toReadBooks.filter((b) => b.id !== book.id);

          closeContentOverlay();
          applyFilters();
          showToast(`"${book.title}" was deleted.`);
        }
      }
    });
  }

  // Delete tag button listener
  cardElement.querySelectorAll(".delete-tag-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tagToRemove = delBtn.parentElement.dataset.tag;
      const newTags = book.tags.filter((t) => t.toLowerCase() !== tagToRemove);

      // Use the generic helper
      const result = await updateToReadBook(book.id, { tags: newTags });

      if (result) {
        book.tags = newTags;
        renderGraveyardCard(book); // Re-render the correct card type
      } else {
        console.error("Failed to delete tag from graveyard book.");
      }
    });
  });
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

    // --- THIS IS THE FIX ---
    // Change "function toggleAddToListForm()" to "const toggleAddToListForm = () =>"
    const toggleAddToListForm = () => {
      const formContainer = document.getElementById("addToListFormContainer");

      if (formContainer.innerHTML.trim() !== "") {
        formContainer.innerHTML = "";
        return;
      }

      const formHTML = `
        <div class="add-to-list-form">
          <input type="text" id="addListTitle" placeholder="Title" class="title-input" required>
          <input type="text" id="addListAuthor" placeholder="Author" class="author-input" required>
          <button id="addToListConfirmBtn">Add</button>
        </div>
      `;
      formContainer.innerHTML = formHTML;

      document.getElementById("addToListConfirmBtn").addEventListener("click", handleAddToListSubmit);
    };

    // Create the HTML for the quick list card
    const cardHTML = `
      <div class="card-header">
        <button data-close class="header-btn close-icon-btn" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="book-card-content">
        <div class="quicklist-header">
          <button id="showAddToListBtn" class="add-to-list-btn" title="Add to list">+</button>
          <span>Quick List</span>
        </div>
        <div id="addToListFormContainer"></div>
        <div class="quicklist-content">${listItems}</div>
      </div>`;

    openContentOverlay(cardHTML);
    lucide.createIcons();

    document.getElementById("showAddToListBtn").addEventListener("click", toggleAddToListForm);
  } catch (err) {
    console.error("Error loading quick list", err);
    openContentOverlay(
      `<p style="color:red;">Failed to load quick list.</p><button data-close class="header-btn close-icon-btn"><i data-lucide="x"></i></button>`
    );
    lucide.createIcons();
  }
}

// Submit Handler function
async function handleAddToListSubmit() {
  const titleInput = document.getElementById("addListTitle");
  const authorInput = document.getElementById("addListAuthor");

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title || !author) {
    alert("Please enter both a title and an author.");
    return;
  }

  const confirmBtn = document.getElementById("addToListConfirmBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Adding...";

  try {
    const isbn = await fetchIsbn(title, author);
    console.log(`Found ISBN for "${title}": ${isbn || "None"}`);

    const newBook = { title, author, isbn: isbn || null };
    const addedBook = await addToReadToSupabase(newBook);

    if (addedBook) {
      const normalizedBook = normalizeBook(addedBook, true);
      toReadBooks.unshift(normalizedBook);

      closeContentOverlay();

      applyFilters();
    } else {
      throw new Error("Book was not added successfully.");
    }
  } catch (error) {
    console.error("Failed to add book to quick list:", error);
    alert("Failed to add book. Please try again.");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Add";
    }
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
// === Editable field helper ===
function makeEditableOnClick(el, book, field, updateFunction) {
  // Find the parent popup card once.
  const popupCard = el.closest('#BookCardpopup');

  el.addEventListener("click", () => {
    if (!el.classList.contains("editing")) {
      el.contentEditable = "true";
      el.classList.add("editing");
      // Add a class to the parent popup to signify editing has started.
      if (popupCard) popupCard.classList.add('is-editing');
      el.focus();

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
      // Remove the class from the parent popup.
      if (popupCard) popupCard.classList.remove('is-editing');
      el.contentEditable = "false";

      let newValue = el.innerText.replace(/^\s+|\s+$/g, "");
      newValue = newValue.replace(/\n{2,}/g, "\n");

      if (newValue !== (book[field] || "").trim()) {
        const updateObj = {};
        updateObj[field] = newValue;

        const result = await updateFunction(book.id, updateObj);

        if (result) {
          book[field] = newValue;
          showToast(`${field.charAt(0).toUpperCase() + field.slice(1)} updated!`);
        } else {
          el.innerText = book[field] || ""; // Revert to the old value
          alert(`Failed to save ${field}. Please check your connection and try again.`);
        }
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
    const clearedCount = clearApiCache();
    showToast(`🧹 Cleared ${clearedCount} cached items. Fresh start!`);
    rainGlitter(50);
  });

  document.getElementById("homeBtn").onclick = () => {
    viewMode = "all";
    applyFilters();
  };

  document.getElementById("favoritesBtn").onclick = () => {
    viewMode = "favorites";
    applyFilters();
  };

  document.getElementById("showToReadBtn").onclick = () => {
    viewMode = "to-read";
    activeToReadTag = null;
    applyFilters();
  };

  document.getElementById("graveyardBtn").onclick = () => {
    viewMode = "unfinished";
    activeUnfinishedTag = null;
    applyFilters();
  };

  document.getElementById("showReadBtn").onclick = () => {
    viewMode = "to-read";
    activeToReadTag = null;

    renderQuickListCard();
  };
}

// DOMContentLoaded listener
document.addEventListener("DOMContentLoaded", async () => {
  // Call the initialization function ONCE to set up all form listeners.
  initializeAddBookForm();

  // Open Add Book popup
  document.getElementById("addBookBtn").addEventListener("click", () => {
    // Always clear the form to a fresh state before showing it.
    clearAddBookForm();
    const popup = document.getElementById("addBookPopup");
    popup.classList.remove("hidden");
    popup.dataset.toReadId = "";
    lockScroll();
  });

  // Close button on the Add Book popup
  document.getElementById("closePopupBtn").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("addBookPopup").classList.add("hidden");
    // Clear the form on close so no stale data is left behind.
    clearAddBookForm();
    unlockScroll();
  });

  // The main handler for when a new book is confirmed
  document.getElementById("addBookConfirm").addEventListener("click", async () => {
    const title = document.getElementById("addTitle").value.trim();
    const author = document.getElementById("addAuthor").value.trim();
    const isbn = document.getElementById("addIsbn").value.trim().replace(/[-\s]/g, "");
    const quote = document.getElementById("addQuote").value.trim();
    const review = document.getElementById("addReview").value.trim();
    // These now read from state variables that are correctly managed
    const rating = selectedRating;
    const despair = selectedDespair;
    const tags = document
      .getElementById("addTags")
      .value.split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    let date_read = document.getElementById("dateReadInput").value;
    if (!date_read) {
      date_read = getFallbackDate();
    }
    const favorite = document.getElementById("addFavoriteHeart").classList.contains("active");

    if (!title || !author) {
      alert("Title and author are required.");
      return;
    }

    const cover = await getCoverUrl({ title, author, isbn });
    const newBookData = { title, author, isbn, quote, review, rating, despair, favorite, tags, date_read, cover };

    try {
      const addedBook = await addBookToSupabase(newBookData);
      allBooks.unshift(normalizeBook(addedBook));

      const popup = document.getElementById("addBookPopup");
      const toReadId = parseInt(popup.dataset.toReadId, 10);

      if (toReadId) {
        const { error: deleteError } = await supabase.from("books_to_read").delete().eq("id", toReadId);
        if (deleteError) {
          console.error("Failed to delete from to-read list:", deleteError);
          alert("Failed to remove the book from your to-read list. Please do so manually.");
        } else {
          toReadBooks = toReadBooks.filter((b) => b.id !== toReadId);
        }
      }

      applyFilters();

      // On success, hide the popup and clear the form for the next use.
      popup.classList.add("hidden");
      unlockScroll();
      clearAddBookForm();
      showToast(`"${title}" has been added to your library!`);
    } catch (e) {
      console.error("Error adding book:", e);
      alert("Failed to add book: " + (e?.message || e));
    }
  });

  // A more complete function to clear all fields in the Add Book form
  // This function resets the entire form to its default state.
  function clearAddBookForm() {
    // Reset all text inputs and textareas
    ["addTitle", "addAuthor", "addIsbn", "addQuote", "addReview", "addTags", "dateReadInput"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    // Reset the favorite heart UI
    document.getElementById("addFavoriteHeart")?.classList.remove("active");

    // 1. Reset the rating STATE variable
    selectedRating = 0;
    // 2. Reset the rating UI
    document.querySelectorAll("#addBookRating .rating-star").forEach((star) => {
      star.textContent = "☆";
      star.classList.remove("filled");
    });

    // 1. Reset the despair STATE variable
    selectedDespair = 0;
    // 2. Reset the despair UI
    document.querySelectorAll("#addBookDespair .despair-icon").forEach((icon) => {
      icon.dataset.selected = "false";
    });
  }

  // Close button on the Add Book popup
  document.getElementById("closePopupBtn").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("addBookPopup").classList.add("hidden");
    clearAddBookForm();
    unlockScroll();
  });

  // Initial setup
  attachToolbarHandlers();
  allBooks = await fetchBooks();
  applyFilters();
});

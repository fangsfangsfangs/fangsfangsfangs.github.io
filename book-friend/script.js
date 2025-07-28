import { showToast, rainGlitter } from "./glitter.js";
import { 
  getCoverUrl, 
  getRandomPlaceholder, 
  fetchSynopsis, 
  fetchFilteredSubjects,
  fetchIsbn, 
  clearApiCache
} from "./coverAPI.js";

// Supabase Client Initialization
const supabaseUrl = "https://pnpjlsjxlbrihxlkirwj.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGpsc2p4bGJyaWh4bGtpcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODIyNDMsImV4cCI6MjA2NzY1ODI0M30.KP6YZtDGsH6_MtSJF03r2nhmEcXTvpd4Ppb-M3HYkhg";
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Global state variables
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

const suggestedTags = ["fiction", "poetry", "horror", "supernatural", "nonfiction", "sci-fi", "crime", "biography", "mystery"];

// --- Universal Overlay & Scrolling Functions ---
const appContainer = document.getElementById("app-container");

function lockScroll() {
  document.body.classList.add("popup-open");
  if (appContainer) {
    appContainer.classList.add("inert");
    appContainer.setAttribute('aria-hidden', 'true');
  }
}

function unlockScroll() {
  document.body.classList.remove("popup-open");
  if (appContainer) {
    appContainer.classList.remove("inert");
    appContainer.removeAttribute('aria-hidden');
  }
}

function openContentOverlay(htmlContent) {
  const bookCard = document.getElementById("bookCard");
  const BookCardpopup = document.getElementById("BookCardpopup");
  const dimOverlay = document.getElementById("dimOverlay");
  bookCard.innerHTML = htmlContent;
  BookCardpopup.classList.remove("hidden");
  dimOverlay.classList.remove("hidden");
  lockScroll();
}

function closeContentOverlay() {
  const BookCardpopup = document.getElementById("BookCardpopup");
  const dimOverlay = document.getElementById("dimOverlay");
  if(BookCardpopup) BookCardpopup.classList.add("hidden");
  if(dimOverlay) dimOverlay.classList.add("hidden");
  unlockScroll();
  const bookCard = document.getElementById("bookCard");
  if(bookCard) bookCard.innerHTML = "";
}

// --- Data & Helper Functions ---
function normalizeBook(book, isToRead = false) {
  const base = { id: book.id || null, title: (book.title || "").trim(), author: (book.author || "").trim(), isbn: (book.isbn || "").replace(/[-\s]/g, "").trim(), cover: (book.cover || "").trim(), tags: Array.isArray(book.tags) ? book.tags.map((t) => t.trim().toLowerCase()) : [] };
  if (isToRead) {
    return { ...base, notes: (book.notes || "").trim(), start: !!book.start };
  } else {
    let normalizedDateRead = getFallbackDate();
    if (book.date_read) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(book.date_read)) {
          normalizedDateRead = book.date_read;
        } else if (/^\d{4}-\d{2}$/.test(book.date_read)) {
          normalizedDateRead = book.date_read + "-01";
        }
    }
    return { ...base, quote: (book.quote || "").trim(), review: (book.review || "").trim(), rating: parseInt(book.rating || "0"), despair: parseInt(book.despair || "0"), favorite: !!book.favorite, dateRead: normalizedDateRead, dateReadDisplay: normalizedDateRead.slice(0, 7) };
  }
}

function getFallbackDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function isBookFavorited(book) {
  return !!book.favorite;
}

// --- Supabase Helpers ---
async function addBookToSupabase(book) {
  const { data, error } = await supabase.from("books_read").insert([book]).select().single();
  if (error) throw error;
  return data;
}

async function updateBookInSupabase(id, updates) {
  const { data, error } = await supabase.from("books_read").update(updates).eq("id", id).select();
  if (error) { console.error("Update error:", error); return null; }
  return data;
}

async function addToReadToSupabase(book) {
  const { data, error } = await supabase.from("books_to_read").insert([book]).select().single();
  if (error) { console.error("Error adding to-read book:", error); throw error; }
  return data;
}

async function updateToReadBook(id, updates) {
  const { data, error } = await supabase.from("books_to_read").update(updates).eq("id", id).select();
  if (error) { console.error("Error updating to-read book:", error); return null; }
  return data;
}

// --- Data Fetching ---
async function fetchBooks() {
    const { data, error } = await supabase.from("books_read").select("*").order("date_read", { ascending: false });
    if (error) {
        console.error("Error fetching books:", error);
        return [];
    }
    return data.map((book) => normalizeBook(book));
}

async function fetchToReadBooks() {
    const { data, error } = await supabase.from("books_to_read").select("*").order("title", { ascending: true });
    if (error) {
        console.error("Error fetching to-read books:", error);
        return [];
    }
    return data.map((book) => normalizeBook(book, true));
}

// --- Filtering & Rendering ---
async function applyFilters() {
    if (viewMode === "to-read" || viewMode === "unfinished") {
        if (toReadBooks.length === 0) {
            toReadBooks = await fetchToReadBooks();
        }
        if (viewMode === "to-read") {
            let booksToRender = toReadBooks.filter(book => !book.start);
            if (activeToReadTag) {
                booksToRender = booksToRender.filter(b => b.tags.includes(activeToReadTag.toLowerCase()));
            }
            filteredToReadBooks = booksToRender;
            renderToReadGrid();
        } else { // unfinished
            let booksToRender = toReadBooks.filter(book => book.start);
            if (activeUnfinishedTag) {
                booksToRender = booksToRender.filter(b => b.tags.includes(activeUnfinishedTag.toLowerCase()));
            }
            filteredUnfinishedBooks = booksToRender;
            renderGraveyardGrid();
        }
        return;
    }

    let booksToRender = allBooks;
    if (viewMode === "favorites") {
        booksToRender = allBooks.filter(isBookFavorited).sort((a, b) => b.dateRead.localeCompare(a.dateRead));
    }
    if (activeTag) {
        booksToRender = booksToRender.filter(b => b.tags.includes(activeTag.toLowerCase()));
    }
    filteredBooks = booksToRender;
    renderGridView();
}

async function renderGridView() {
  const grid = document.getElementById("gridView");
  grid.innerHTML = "";
  filteredBooks.forEach((book, index) => {
    const item = document.createElement("div");
    item.className = "grid-item";
    const img = document.createElement("img");
    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => { img.src = getRandomPlaceholder(); };
    item.appendChild(img);
    getCoverUrl(book).then(coverUrl => {
      if (coverUrl) img.src = coverUrl;
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
    grid.innerHTML = `<p style="text-align:center;">No to-read books found.</p>`;
    return;
  }
  filteredToReadBooks.forEach((book) => {
    const item = document.createElement("div");
    item.className = "grid-item";
    const img = document.createElement("img");
    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => { img.src = getRandomPlaceholder(); };
    item.appendChild(img);
    getCoverUrl(book).then(coverUrl => {
      if (coverUrl) img.src = coverUrl;
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
  filteredUnfinishedBooks.forEach((book) => {
    const item = document.createElement("div");
    item.className = "grid-item";
    const img = document.createElement("img");
    img.src = getRandomPlaceholder();
    img.alt = `Cover of ${book.title}`;
    img.onerror = () => { img.src = getRandomPlaceholder(); };
    item.appendChild(img);
    getCoverUrl(book).then(coverUrl => {
      if (coverUrl) img.src = coverUrl;
    });
    item.addEventListener("click", () => renderGraveyardCard(book));
    grid.appendChild(item);
  });
}

async function renderSingleCard(book) {
  if (!book) return;
  const tagsHTML = book.tags.map(tag => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`).join("");
  const coverSrc = await getCoverUrl(book);
  const favoriteClass = !!book.favorite ? "favorite-heart active" : "favorite-heart";
  const cardHTML = `
    <button class="close-btn" data-close aria-label="Close">×</button>
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
          ${[1, 2, 3, 4, 5].map(i => `<span class="rating-icon rating-star ${i <= book.rating ? "filled" : ""}" data-value="${i}">${i <= book.rating ? "★" : "☆"}</span>`).join("")}
        </div>
      </div>
      <div class="review-box">
        <div id="reviewEditable" class="review-text editable" contenteditable="false" title="Click to edit review">${book.review?.trim() ? book.review : "Add your thoughts..."}</div>
      </div>
      <div class="rating-bar">
        <div class="despair-rating" title="Despair Level">
          ${[1, 2, 3, 4, 5].map(i => `<span class="rating-icon despair-icon" data-value="${i}" data-selected="${i <= book.despair ? "true" : "false"}">${getDespairIcon(i)}</span>`).join("")}
        </div>
      </div>
      <div class="tag-footer">
        <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">❤</div>
        <div class="tags">${tagsHTML}</div>
        <span class="add-tag-btn" title="Add Tag">+</span>
      </div>
    </div>`;
  openContentOverlay(cardHTML);
  lucide.createIcons();

  const bookCard = document.getElementById("bookCard");
  bookCard.querySelectorAll(".rating-star").forEach(star => {
    star.addEventListener("click", async () => {
      const newRating = parseInt(star.dataset.value);
      await updateBookInSupabase(book.id, { rating: newRating });
      book.rating = newRating;
      renderSingleCard(book);
    });
  });

  bookCard.querySelectorAll(".despair-icon").forEach(icon => {
    icon.addEventListener("click", async () => {
      const newDespair = parseInt(icon.dataset.value);
      const finalDespair = (book.despair || 0) === newDespair ? 0 : newDespair;
      await updateBookInSupabase(book.id, { despair: finalDespair });
      book.despair = finalDespair;
      renderSingleCard(book);
    });
  });

  ["quote", "review"].forEach(field => {
    const el = document.getElementById(`${field}Editable`);
    if (el) makeEditableOnClick(el, book, field);
  });

  document.getElementById("favoriteHeart").addEventListener("click", async () => {
    const newFav = !book.favorite;
    await updateBookInSupabase(book.id, { favorite: newFav });
    book.favorite = newFav;
    renderSingleCard(book);
  });

  bookCard.querySelectorAll(".tag").forEach(tagEl => {
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
        const newTags = book.tags.filter(t => t.toLowerCase() !== tagToRemove);
        if (await updateBookInSupabase(book.id, { tags: newTags })) {
          book.tags = newTags;
          renderSingleCard(book);
        }
      });
    }
  });

  bookCard.querySelector(".add-tag-btn").addEventListener("click", () => showTagInput(book, false));
}

async function renderToReadCard(book) {
    if (!book) return;
    const subjectTags = await fetchFilteredSubjects(book.title, book.author);
    const mergedTags = Array.from(new Set([...book.tags, ...subjectTags]));
    if (mergedTags.length !== book.tags.length) {
        if(await updateToReadBook(book.id, { tags: mergedTags })) {
            book.tags = mergedTags;
        }
    }
    const tagsHTML = book.tags.map(tag => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`).join("");
    const coverSrc = await getCoverUrl(book);
    const cardHTML = `
        <button class="close-btn" data-close aria-label="Close">×</button>
        <div class="book-card-content">
            <div class="cover-container"><img src="${coverSrc || getRandomPlaceholder()}" alt="Cover of ${book.title}" /></div>
            <div class="title">${book.title || "Untitled"}</div>
            <div class="author">${book.author || "Unknown"}</div>
            <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>
        </div>
        <div class="tag-footer"><div class="tags">${tagsHTML}</div></div>
        <div class="card-footer-alt">
            <button id="startBookBtn" class="move-to-read-btn">Start Reading</button>
            <span class="add-tag-btn" title="Add Tag">+</span>
        </div>`;
    openContentOverlay(cardHTML);
    lucide.createIcons();

    const cardElement = document.getElementById("bookCard");
    cardElement.querySelector(".add-tag-btn").addEventListener("click", () => showTagInput(book, true));
    document.getElementById("startBookBtn").addEventListener("click", async () => {
        if(await updateToReadBook(book.id, { start: true })) {
            book.start = true;
            applyFilters();
            closeContentOverlay();
        } else {
            alert("Could not start book. Please try again.");
        }
    });
    cardElement.querySelectorAll(".delete-tag-btn").forEach(delBtn => {
        delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const tagToRemove = delBtn.parentElement.dataset.tag;
            const newTags = book.tags.filter(t => t.toLowerCase() !== tagToRemove);
            if (await updateToReadBook(book.id, { tags: newTags })) {
                book.tags = newTags;
                renderToReadCard(book);
            }
        });
    });
      const synopsis = await fetchSynopsis(book); 
    const synopsisElement = document.getElementById("toReadSynopsis");
    if (synopsisElement) {
        synopsisElement.textContent = synopsis;
    }
}

async function renderGraveyardCard(book) {
    if (!book) return;
    const tagsHTML = (book.tags || []).map(tag => `<span class="tag" data-tag="${tag.toLowerCase()}">${tag}<button class="delete-tag-btn" title="Remove tag">×</button></span>`).join("");
    const coverSrc = await getCoverUrl(book);
    const cardHTML = `
        <button class="close-btn" data-close aria-label="Close">×</button>
        <div class="book-card-content">
            <div class="cover-container"><img src="${coverSrc || getRandomPlaceholder()}" alt="Cover of ${book.title}" /></div>
            <div class="title">${book.title || "Untitled"}</div>
            <div class="author">${book.author || "Unknown"}</div>
            <div id="toReadSynopsis" class="to-read-notes">Loading synopsis...</div>
        </div>
        <div class="tag-footer"><div class="tags">${tagsHTML}</div></div>
        <div class="card-footer-alt">
            <button id="moveToReadAddBtn" class="move-to-read-btn">Add as Read</button>
            <span class="add-tag-btn" title="Add Tag">+</span>
        </div>`;
    openContentOverlay(cardHTML);
    lucide.createIcons();
    document.getElementById("moveToReadAddBtn").addEventListener("click", () => {
        const popup = document.getElementById("addBookPopup");
        popup.classList.remove("hidden");
        document.getElementById("addTitle").value = book.title || "";
        document.getElementById("addAuthor").value = book.author || "";
        document.getElementById("addIsbn").value = book.isbn || "";
        document.getElementById("addTags").value = Array.isArray(book.tags) ? book.tags.join(", ") : "";
        popup.dataset.toReadId = book.id;
    });
    const cardElement = document.getElementById("bookCard");
    cardElement.querySelector(".add-tag-btn").addEventListener("click", () => showTagInput(book, 'unfinished'));
    cardElement.querySelectorAll(".delete-tag-btn").forEach(delBtn => {
        delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const tagToRemove = delBtn.parentElement.dataset.tag;
            const newTags = book.tags.filter(t => t.toLowerCase() !== tagToRemove);
            if (await updateToReadBook(book.id, { tags: newTags })) {
                book.tags = newTags;
                renderGraveyardCard(book);
            }
        });
    });
    const synopsis = await fetchSynopsis(book);
    const synopsisElement = document.getElementById("toReadSynopsis");
    if (synopsisElement) {
        synopsisElement.textContent = synopsis;
    }
}

async function renderQuickListCard() {
    try {
        const { data, error } = await supabase.from("books_to_read").select("title, author").order("title");
        if (error) throw error;
        const listItems = data.map(book => `<div class="quicklist-item"><strong>${(book.title || "Untitled").trim()}</strong><br><em>${(book.author || "Unknown").trim()}</em></div>`).join("");
        
        function toggleAddToListForm() {
            const formContainer = document.getElementById("addToListFormContainer");
            if (formContainer.innerHTML.trim() !== "") {
                formContainer.innerHTML = "";
                return;
            }
            formContainer.innerHTML = `
                <div class="add-to-list-form">
                    <input type="text" id="addListTitle" placeholder="Title" class="title-input" required>
                    <input type="text" id="addListAuthor" placeholder="Author" class="author-input" required>
                    <input placeholder="ISBN" class="isbn-input" />
                    <button class="find-isbn-btn special-btn">Find ISBN</button>
                    <button id="addToListConfirmBtn">Add</button>
                </div>`;
            document.getElementById("addToListConfirmBtn").addEventListener("click", handleAddToListSubmit);
        }

        const cardHTML = `
            <button class="close-btn" data-close aria-label="Close">×</button>
            <div class="book-card-content">
                <div class="quicklist-header">
                    <button id="showAddToListBtn" class="add-to-list-btn" title="Add to list">+</button>
                    <span>Quick List</span>
                </div>
                <div id="addToListFormContainer"></div>
                <div class="quicklist-content">${listItems}</div>
            </div>`;
        openContentOverlay(cardHTML);
        document.getElementById("showAddToListBtn").addEventListener("click", toggleAddToListForm);
    } catch (err) {
        openContentOverlay(`<p style="color:red;">Failed to load quick list.</p><button class="close-btn" data-close>×</button>`);
    }
}

async function handleAddToListSubmit() {
    const title = document.getElementById("addListTitle").value.trim();
    const author = document.getElementById("addListAuthor").value.trim();
    const isbn = document.querySelector('.add-to-list-form .isbn-input')?.value.trim() || "";
    if (!title || !author) {
        alert("Please enter both a title and an author.");
        return;
    }
    try {
        document.getElementById("addToListConfirmBtn").disabled = true;
        const addedBook = await addToReadToSupabase({ title, author, isbn });
        if (addedBook) {
            toReadBooks.unshift(normalizeBook(addedBook, true));
            closeContentOverlay();
            if (viewMode === 'to-read') {
                applyFilters();
            }
        }
    } catch (error) {
        alert("Failed to add book. Please try again.");
        const confirmBtn = document.getElementById("addToListConfirmBtn");
        if(confirmBtn) confirmBtn.disabled = false;
    }
}

function showTagInput(book, isToRead = false) {
    const dimOverlay = document.getElementById("dimOverlay");
    lockScroll();
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
    suggestedTags.forEach(tag => {
        const tagEl = document.createElement("span");
        tagEl.className = "tag-cloud-btn";
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

    const closeTagPopup = () => {
        document.body.removeChild(popup);
        dimOverlay.removeEventListener("click", handleOverlayClick);
    };
    const handleOverlayClick = (e) => {
        if (e.target === dimOverlay) closeTagPopup();
    };
    dimOverlay.addEventListener("click", handleOverlayClick);
    input.addEventListener("input", () => { addBtn.disabled = input.value.trim() === ""; });
    cancelBtn.addEventListener("click", closeTagPopup);
    addBtn.addEventListener("click", async () => {
        const newTag = input.value.trim();
        if (newTag && !book.tags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
            book.tags.push(newTag);
            if (isToRead) await updateToReadBook(book.id, { tags: book.tags });
            else await updateBookInSupabase(book.id, { tags: book.tags });
        }
        closeTagPopup();
        if (isToRead === 'unfinished') renderGraveyardCard(book);
        else if (isToRead) renderToReadCard(book);
        else renderSingleCard(book);
    });
}

function makeEditableOnClick(el, book, field) {
  el.addEventListener("click", () => {
    if (el.classList.contains("editing")) return;
    el.contentEditable = "true";
    el.classList.add("editing");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  el.addEventListener("blur", async () => {
    el.classList.remove("editing");
    el.contentEditable = "false";
    let newValue = el.innerText.replace(/^\s+|\s+$/g, "").replace(/\n{2,}/g, "\n");
    if (newValue !== (book[field] || "").trim()) {
      await updateBookInSupabase(book.id, { [field]: newValue });
      book[field] = newValue;
    }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el.blur();
    }
  });
}

function getDespairIcon(value) {
    const icons = { 0: "cloud-rain", 1: "smile", 2: "meh", 3: "frown", 4: "smile-upside-down", 5: "skull" };
    const iconName = icons[value] || "help-circle";
    return `<i data-lucide="${iconName}"></i>`;
}

// --- Toolbar Handlers ---
function attachToolbarHandlers() {
  document.getElementById("logoBtn").addEventListener("click", () => {
    rainGlitter(50);
  });
  document.getElementById("homeBtn").onclick = () => {
    viewMode = "all";
    activeTag = null;
    applyFilters();
  };
  document.getElementById("favoritesBtn").onclick = () => {
    viewMode = "favorites";
    activeTag = null;
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
    applyFilters();
    renderQuickListCard();
  };
}

// ==========================================================
// MAIN APP LOGIC - RUNS AFTER PAGE LOADS
// ==========================================================
document.addEventListener("DOMContentLoaded", async () => {

  attachToolbarHandlers();
  
  const BookCardpopup = document.getElementById("BookCardpopup");
  BookCardpopup.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]") || e.target === BookCardpopup) {
      closeContentOverlay();
    }
  });

  document.getElementById("addBookBtn").addEventListener("click", () => {
    document.getElementById("addBookPopup").classList.remove("hidden");
    lockScroll();
  });

  const favHeart = document.getElementById("addFavoriteHeart");
  if (favHeart) {
    favHeart.addEventListener("click", () => {
      favHeart.classList.toggle("active");
    });
  }

  document.getElementById("addBookConfirm").addEventListener("click", async () => {
    const title = document.getElementById("addTitle").value.trim();
    const author = document.getElementById("addAuthor").value.trim();
    if (!title || !author) {
      alert("Title and author are required.");
      return;
    }
    const isbn = document.getElementById("addIsbn").value.trim().replace(/[-\s]/g, "");
    const quote = document.getElementById("addQuote").value.trim();
    const review = document.getElementById("addReview").value.trim();
    const rating = parseInt(document.getElementById("addRating").value) || 0;
    const despair = parseInt(document.getElementById("addDespair").value) || 0;
    const tags = document.getElementById("addTags").value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    const dateReadValue = document.getElementById("dateReadInput").value;
    const date_read = dateReadValue ? `${dateReadValue}-01` : getFallbackDate();
    const favorite = favHeart.classList.contains("active");
    const cover = await getCoverUrl({ title, author, isbn });
    
    const book = { title, author, isbn, quote, review, rating, despair, favorite, tags, date_read, cover };

    try {
      const added = await addBookToSupabase(book);
      allBooks.unshift(normalizeBook(added));
      
      const popup = document.getElementById("addBookPopup");
      const toReadId = parseInt(popup.dataset.toReadId);
      if (toReadId) {
        await supabase.from("books_to_read").delete().eq("id", toReadId);
        toReadBooks = toReadBooks.filter(b => b.id !== toReadId);
        popup.dataset.toReadId = "";
      }
      
      applyFilters();
      document.getElementById("addBookPopup").classList.add("hidden");
      clearAddBookForm();
      unlockScroll();
    } catch (e) {
      console.error("Error adding book:", e);
      alert("Failed to add book: " + (e?.message || e));
    }
  });

  function clearAddBookForm() {
    ["addTitle", "addAuthor", "addIsbn", "addQuote", "addReview", "addRating", "addDespair", "addTags", "dateReadInput"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if (favHeart) favHeart.classList.remove("active");
  }

  document.getElementById("addBookPopup").addEventListener("click", (event) => {
    if (event.target.id === "closePopupBtn") {
      event.preventDefault();
      document.getElementById("addBookPopup").classList.add("hidden");
      clearAddBookForm();
      unlockScroll();
    }
  });

  document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('find-isbn-btn')) {
        event.preventDefault();
        const container = event.target.closest('.popup-content, .add-to-list-form');
        if (container) {
            const titleInput = container.querySelector('.title-input');
            const authorInput = container.querySelector('.author-input');
            const isbnInput = container.querySelector('.isbn-input');
            if (!titleInput || !authorInput || !isbnInput) {
                alert("A mapping error occurred. Could not find input fields.");
                return;
            }
            const title = titleInput.value.trim();
            const author = authorInput.value.trim();
            if (!title || !author) {
                alert("Please enter a Title and Author to find the ISBN.");
                return;
            }
            event.target.textContent = '👀...';
            event.target.disabled = true;
            try {
                const foundIsbn = await fetchIsbn(title, author);
                if (foundIsbn) isbnInput.value = foundIsbn;
                else alert("Could not find an ISBN for this book.");
            } catch (error) {
                alert("An error occurred while finding the ISBN.");
            } finally {
                event.target.textContent = 'Find ISBN';
                event.target.disabled = false;
            }
        }
    }
  });

  // Fetch initial data and render the app
  allBooks = await fetchBooks();
  applyFilters();
});

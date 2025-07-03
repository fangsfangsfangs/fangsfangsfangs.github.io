let allBooks = [],
  filteredBooks = [],
  currentIndex = 0,
  viewMode = "read",
  activeTag = null;

const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

// Cache arrow buttons for easy toggling
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

// Normalize each book row from the review sheet
function normalizeBook(book) {
  return {
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    quote: (book.quote || "").trim(),
    review: (book.review || "").trim(),
    cover: (book.cover || "").trim(),
    rating: parseInt(book.rating || "0"),
    read: (book.read || "").toLowerCase(),
    favorite: (book.favorite || "").toLowerCase(),
    tags: (book.tags || "").toLowerCase()
  };
}

// Fetch "review" sheet books
async function fetchBooks() {
  try {
    const res = await fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/review");
    const rawBooks = await res.json();
    allBooks = rawBooks.map(normalizeBook);
    applyFilters();
  } catch (e) {
    console.error("Failed to fetch books:", e);
    document.getElementById("bookCard").innerHTML = `<p style="color:red;">Failed to load books.</p>`;
  }
}
// Filter logic for read/favorite/all modes
function applyFilters() {
  if (viewMode === "read") {
    filteredBooks = allBooks.filter((b) => b.read === "y");
  } else if (viewMode === "favorites") {
    filteredBooks = allBooks.filter((b) => b.favorite === "y");
  } else {
    filteredBooks = allBooks;
  }

  if (activeTag) {
    filteredBooks = filteredBooks.filter((b) => b.tags.includes(activeTag.toLowerCase()));
  }

  currentIndex = 0;
  if (filteredBooks.length === 0) {
    document.getElementById("bookCard").innerHTML = `<p>No books found for this filter/tag.</p>`;
  } else {
    renderSingleCard(filteredBooks[currentIndex]);
  }
  // Show arrows when not in to-read view
  if (viewMode !== "to-read") {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
  }
}

// Renders a normal review-style book card
function renderSingleCard(book) {
  if (!book) return;

  const bookCard = document.getElementById("bookCard");
  const ratingStars = "★".repeat(book.rating).padEnd(5, "☆");

  const tagList = (book.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1));

  const tagsHTML = tagList.map((tag) => `<span class="tag" data-tag="${tag}">${tag}</span>`).join("");

  const favoriteClass = book.favorite === "y" ? "favorite-heart active" : "favorite-heart";
  const coverSrc = book.cover || placeholderImage;

  bookCard.innerHTML = `
  <button id="prevBtn" class="nav-button" aria-label="Previous Book">&#10094;</button>
  <button id="nextBtn" class="nav-button" aria-label="Next Book">&#10095;</button>

  <div class="icon-bar">
      <button id="homeBtn" title="Reset Filters"><i data-lucide="home"></i></button>
      <button id="favoritesBtn" title="Show Favorites"><i data-lucide="book-heart"></i></button>
      <button id="showReadBtn" title="Show Read Books"><i data-lucide="bookmark-check"></i></button>
      <button id="showToReadBtn" title="Show To-Read"><i data-lucide="notebook-pen"></i></button>
    </div>

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

    <div class="title-author-review">
      <div class="review">${book.review || ""}</div>
    </div>

    <div class="card-footer">
      <div class="footer-left">
        <div id="favoriteHeart" class="${favoriteClass}" title="Toggle Favorite">&#10084;</div>
      </div>
      <div class="footer-center">
        <div class="rating" title="Rating">${ratingStars}</div>
      </div>
      <div class="footer-right">
        <div class="tags">${tagsHTML}</div>
      </div>
    </div>
  `;

  lucide.createIcons();

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (filteredBooks.length === 0 || viewMode === "to-read") return;
    currentIndex = (currentIndex - 1 + filteredBooks.length) % filteredBooks.length;
    renderSingleCard(filteredBooks[currentIndex]);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (filteredBooks.length === 0 || viewMode === "to-read") return;
    currentIndex = (currentIndex + 1) % filteredBooks.length;
    renderSingleCard(filteredBooks[currentIndex]);
  });

  // Show arrows when rendering a normal card
  prevBtn.classList.remove("hidden");
  nextBtn.classList.remove("hidden");

  // Heart click to toggle favorite
  document.getElementById("favoriteHeart").addEventListener("click", () => {
    const globalIndex = allBooks.findIndex((b) => b.title === book.title && b.author === book.author);
    if (globalIndex >= 0) {
      allBooks[globalIndex].favorite = allBooks[globalIndex].favorite === "y" ? "n" : "y";
    }
    applyFilters();
  });

  // Tag filtering
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
    });
  });

  // Toolbar buttons (re-added each render)
  attachToolbarHandlers();
}

//Renders grid view for home button
function renderGridView() {
  const bookCard = document.getElementById("bookCard");

  const readBooks = allBooks.filter((b) => b.read === "y");

  const gridHTML = readBooks
    .map(
      (book, index) => `
    <div class="grid-item" data-index="${index}">
      <img src="${book.cover || placeholderImage}" alt="Cover of ${book.title}" onerror="this.onerror=null;this.src='${placeholderImage}'">
    </div>
  `
    )
    .join("");

  bookCard.innerHTML = `
    <div class="icon-bar">
      <button id="homeBtn" title="Reset Filters"><i data-lucide="home"></i></button>
      <button id="favoritesBtn" title="Show Favorites"><i data-lucide="book-heart"></i></button>
      <button id="showReadBtn" title="Show Read Books"><i data-lucide="bookmark-check"></i></button>
      <button id="showToReadBtn" title="Show To-Read"><i data-lucide="notebook-pen"></i></button>
    </div>
     <div class="grid-area">
      ${gridHTML}
    </div>
  `;

  lucide.createIcons();
  prevBtn.classList.add("hidden");
  nextBtn.classList.add("hidden");

  document.querySelectorAll(".grid-item").forEach((item) => {
    item.addEventListener("click", () => {
      currentIndex = parseInt(item.dataset.index);
      renderSingleCard(filteredBooks[currentIndex]);
    });
  });

  attachToolbarHandlers();
}

// To-Read list rendering logic
async function renderToReadList() {
  try {
    const res = await fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/to-read");
    const books = await res.json();

    const bookCard = document.getElementById("bookCard");

    const entriesHTML = books
      .map(
        (book) => `
      <div class="to-read-entry">
        <i data-lucide="chevron-right" class="entry-icon"></i>
        <div class="entry-text">
          <div class="entry-title">${book.title || "Untitled"}</div>
          <div class="entry-author">${book.author || "Unknown"}</div>
        </div>
      </div>
    `
      )
      .join("");

    bookCard.innerHTML = `
      <div class="icon-bar">
        <button id="homeBtn" title="Reset Filters"><i data-lucide="home"></i></button>
        <button id="favoritesBtn" title="Show Favorites"><i data-lucide="book-heart"></i></button>
        <button id="showReadBtn" title="Show Read Books"><i data-lucide="bookmark-check"></i></button>
        <button id="showToReadBtn" title="Show To-Read"><i data-lucide="notebook-pen"></i></button>
      </div>

      <div class="to-read-container">
        <h2>To-Read List</h2>
        <div class="to-read-scroll">
          ${entriesHTML}
        </div>
      </div>
    `;

    lucide.createIcons();

    // Hide arrows when showing To-Read list
    prevBtn.classList.add("hidden");
    nextBtn.classList.add("hidden");

    attachToolbarHandlers();
  } catch (e) {
    console.error("Failed to fetch to-read list:", e);
    document.getElementById("bookCard").innerHTML = `<p style="color:red;">Failed to load to-read list.</p>`;
  }
}

// Button event binding (always reattached)
function attachToolbarHandlers() {
  document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "https://fangsfangsfangs.github.io/book-friend/grid.html";
  });
  document.getElementById("favoritesBtn")?.addEventListener("click", () => {
    viewMode = "favorites";
    activeTag = null;
    applyFilters();
  });
  document.getElementById("showReadBtn")?.addEventListener("click", () => {
    viewMode = "read";
    activeTag = null;
    applyFilters();
  });
  document.getElementById("showToReadBtn")?.addEventListener("click", () => {
    viewMode = "to-read";
    activeTag = null;
    renderToReadList();
  });
}

// Theme toggle (external button)
document.getElementById("themeToggleBtn").addEventListener("click", () => {
  const themes = [
    { background: "#fafafa", text: "#333" },
    { background: "#222", text: "#eee" },
    { background: "#f0f4f8", text: "#111" }
  ];
  let currentThemeIndex = window.currentThemeIndex || 0;
  currentThemeIndex = (currentThemeIndex + 1) % themes.length;
  window.currentThemeIndex = currentThemeIndex;

  const theme = themes[currentThemeIndex];
  document.body.style.backgroundColor = theme.background;
  document.body.style.color = theme.text;
});

// Initial fetch
fetchBooks();

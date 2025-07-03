let allBooks = [],
  filteredBooks = [],
  currentIndex = 0,
  viewMode = "read",
  activeTag = null;
const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

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

function applyFilters() {
  if (viewMode === "read") {
    filteredBooks = allBooks.filter((b) => b.read === "y");
  } else if (viewMode === "favorites") {
    filteredBooks = allBooks.filter((b) => b.favorite === "y");
  } else if (viewMode === "all") {
    filteredBooks = allBooks;
  } else {
    filteredBooks = allBooks; // fallback
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
}

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

  // Favorite heart toggle
  const favoriteHeart = document.getElementById("favoriteHeart");
  favoriteHeart.addEventListener("click", () => {
    const globalIndex = allBooks.findIndex((b) => b.title === book.title && b.author === book.author);
    if (globalIndex >= 0) {
      allBooks[globalIndex].favorite = allBooks[globalIndex].favorite === "y" ? "n" : "y";
    }
    applyFilters();
  });

  // Tag click handlers
  bookCard.querySelectorAll(".tag").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      activeTag = tagEl.dataset.tag.toLowerCase();
      applyFilters();
    });
  });

  // Toolbar buttons event listeners
  document.getElementById("homeBtn").addEventListener("click", () => {
    viewMode = "read";
    activeTag = null;
    applyFilters();
  });
  document.getElementById("favoritesBtn").addEventListener("click", () => {
    viewMode = "favorites";
    activeTag = null;
    applyFilters();
  });
  document.getElementById("showReadBtn").addEventListener("click", () => {
    viewMode = "read";
    activeTag = null;
    applyFilters();
  });
  document.getElementById("showToReadBtn").addEventListener("click", () => {
    viewMode = "all";
    activeTag = null;
    applyFilters();
  });
}

document.getElementById("nextBtn").addEventListener("click", () => {
  if (filteredBooks.length === 0) return;
  currentIndex = (currentIndex + 1) % filteredBooks.length;
  renderSingleCard(filteredBooks[currentIndex]);
});

document.getElementById("prevBtn").addEventListener("click", () => {
  if (filteredBooks.length === 0) return;
  currentIndex = (currentIndex - 1 + filteredBooks.length) % filteredBooks.length;
  renderSingleCard(filteredBooks[currentIndex]);
});

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

fetchBooks();

const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

let allBooks = [];

// Fetch all books from your Google Sheet review URL
async function fetchBooks() {
  try {
    const res = await fetch("https://opensheet.elk.sh/1mba7klBrTyQ3QXRic4Lw97RIt4aU4XeEUcUJ8QjP7WU/review");
    const rawBooks = await res.json();
    allBooks = rawBooks.map(normalizeBook);
    renderGrid();
  } catch (e) {
    console.error("Failed to fetch books:", e);
    document.getElementById("gridContainer").innerHTML = `<p style="color:red;">Failed to load books.</p>`;
  }
}

// Normalize book entries (basic trimming and defaults)
function normalizeBook(book) {
  return {
    title: (book.title || "").trim(),
    author: (book.author || "").trim(),
    cover: (book.cover || "").trim() || placeholderImage,
    read: (book.read || "").toLowerCase(),
    favorite: (book.favorite || "").toLowerCase(),
    tags: (book.tags || "").toLowerCase()
  };
}

// Render the grid view of book covers
function renderGrid() {
  const gridContainer = document.getElementById("gridContainer");
  // Filter only read books for grid (adjust as needed)
  const readBooks = allBooks.filter((b) => b.read === "y");

  if (readBooks.length === 0) {
    gridContainer.innerHTML = "<p>No books found.</p>";
    return;
  }

  const gridHTML = readBooks.map((book, index) => `
    <div class="grid-item" data-index="${index}" title="${book.title} by ${book.author}">
      <img src="${book.cover}" alt="Cover of ${book.title}" onerror="this.onerror=null;this.src='${placeholderImage}'" />
    </div>
  `).join("");

  gridContainer.innerHTML = gridHTML;

  // Add click handler on each cover - just alert for now
  document.querySelectorAll(".grid-item").forEach((item) => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.index);
      const book = readBooks[idx];
      alert(`Clicked:\n${book.title} by ${book.author}`);
      // Here you could navigate or render a detailed card if you want
    });
  });
}

// Toolbar buttons - add your navigation/filters here
function attachToolbarHandlers() {
  document.getElementById("homeBtn").addEventListener("click", () => {
    // For example, reload this grid page or reset filters
    location.reload();
  });
  document.getElementById("favoritesBtn").addEventListener("click", () => {
    alert("Favorites filter clicked - implement as needed.");
  });
  document.getElementById("showReadBtn").addEventListener("click", () => {
    alert("Show Read filter clicked - implement as needed.");
  });
  document.getElementById("showToReadBtn").addEventListener("click", () => {
    alert("Show To-Read clicked - implement as needed.");
  });
}

// Initial setup
fetchBooks();
attachToolbarHandlers();
lucide.createIcons();

// coverAPI.js
// Array of placeholder images. Replace these with your actual image URLs.
const placeholderImages = [
"https://fangsfangsfangs.github.io/book-friend/img/placeholder-1.jpg",
"https://fangsfangsfangs.github.io/book-friend/img/placeholder-2.jpg",
"https://fangsfangsfangs.github.io/book-friend/img/placeholder-3.jpg"
];

export function getRandomPlaceholder() {
  const randomIndex = Math.floor(Math.random() * placeholderImages.length);
  return placeholderImages[randomIndex];
}

/**
 * Check if an image URL exists by sending a HEAD request.
 * Returns true if response is ok, else false.
 */
export async function imageExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a cover image URL from OpenLibrary given book info.
 * Implements caching to localStorage to reduce API calls.
 * Tries multiple strategies:
 *   1. Search by title + author, use cover_i if present
 *   2. Search by ISBNs in search results (parallel check)
 *   3. Direct fetch by provided ISBN
 * Returns cover URL string or null if none found.
 */
export async function fetchOpenLibraryCover(title, author, isbn) {
  // Normalize inputs & cache key
  if (!title || !author) {
    console.warn("fetchOpenLibraryCover: Missing title or author");
    return null;
  }
  const cleanIsbn = isbn?.replace(/[-\s]/g, "").trim();
  const cacheKey = `cover_${title.toLowerCase()}_${author.toLowerCase()}`;

  // Check cache first
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    if (cached === "null") return null;
    console.log(`fetchOpenLibraryCover: Cache hit for "${title}" by "${author}"`);
    return cached;
  }

  try {
    // Search OpenLibrary by title and author
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    );
    const data = await res.json();

    if (data.docs && data.docs.length > 0) {
      // Find first doc with a cover_i ID
      const docWithCover = data.docs.find((d) => d.cover_i);
      if (docWithCover?.cover_i) {
        const coverUrl = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
        localStorage.setItem(cacheKey, coverUrl);
        console.log(`fetchOpenLibraryCover: Found cover_i for "${title}" by "${author}"`);
        return coverUrl;
      }

      // Parallel check for any ISBN-based covers from search results
      const allIsbns = data.docs.flatMap((d) => d.isbn || []);
      if (allIsbns.length > 0) {
        const promises = allIsbns.map((isbn) => {
          const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
          return imageExists(url).then((exists) => (exists ? url : null));
        });
        const results = await Promise.all(promises);
        const validUrl = results.find((url) => url !== null);
        if (validUrl) {
          localStorage.setItem(cacheKey, validUrl);
          console.log(`fetchOpenLibraryCover: Found cover via ISBN in search results for "${title}" by "${author}"`);
          return validUrl;
        }
      }
    }
  } catch (e) {
    console.warn("fetchOpenLibraryCover: OpenLibrary search failed:", e);
  }

  // Final fallback: direct fetch by cleaned ISBN (if provided)
  if (cleanIsbn) {
    const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
    if (await imageExists(url)) {
      localStorage.setItem(cacheKey, url);
      console.log(`fetchOpenLibraryCover: Found cover via direct ISBN fetch for "${title}" by "${author}"`);
      return url;
    }
  }

  // No cover found - cache null to avoid repeat checks
  localStorage.setItem(cacheKey, "null");
  console.log(`fetchOpenLibraryCover: No cover found for "${title}" by "${author}"`);
  return null;
}

/**
 * Get cover URL for a book object.
 * Uses OpenLibrary fetch first, then fallback to book.cover,
 * then placeholder image.
 * Validates fallback cover URL existence.
 */
export async function getCoverUrl(book) {
  if (!book) {
    console.warn("getCoverUrl: Missing book object");
// Inside getCoverUrl()
return getRandomPlaceholder();
  }

  // Try OpenLibrary cover first
  const openLibCover = await fetchOpenLibraryCover(book.title, book.author, book.isbn);
  if (openLibCover) return openLibCover;

  // Validate fallback book.cover URL before returning
  if (book.cover?.trim()) {
    const fallbackCover = book.cover.trim();
    if (await imageExists(fallbackCover)) {
      console.log(`getCoverUrl: Using fallback book.cover for "${book.title}"`);
      return fallbackCover;
    } else {
      console.warn(`getCoverUrl: Fallback book.cover URL invalid for "${book.title}": ${fallbackCover}`);
    }
  }

  // Fallback to placeholder image
// Inside getCoverUrl()
return getRandomPlaceholder();
}

/**
 * Fetches a synopsis from Google Books API.
 * @param {string} title The book title.
 * @param {string} author The book author.
 * @returns {Promise<string|null>} The synopsis text or null.
 */
async function fetchGoogleBooksSynopsis(title, author) {
  if (!title || !author) return null;
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`);
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const book = data.items[0];
      if (book.volumeInfo && book.volumeInfo.description) {
        console.log("Found synopsis via Google Books.");
        return book.volumeInfo.description;
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching from Google Books:", error);
    return null;
  }
}

/**
 * Fetches a synopsis from Open Library, handling redirects.
 * @param {string} title The book title.
 * @param {string} author The book author.
 * @returns {Promise<string|null>} The synopsis text or null.
 */
async function fetchOpenLibrarySynopsis(title, author) {
  if (!title || !author) return null;
  try {
    // This URL will redirect to the correct work page.
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (searchData.docs && searchData.docs.length > 0) {
      const workKey = searchData.docs[0].key;
      if (workKey) {
        // Fetch the work details, which may redirect.
        const workResponse = await fetch(`https://openlibrary.org${workKey}.json`);

        // Check for redirect
        if (workResponse.redirected) {
          const redirectedResponse = await fetch(workResponse.url);
          const workData = await redirectedResponse.json();
          console.log("Found synopsis via Open Library (after redirect).");
          return workData.description ? (typeof workData.description === 'string' ? workData.description : workData.description.value) : null;
        }

        const workData = await workResponse.json();
        console.log("Found synopsis via Open Library.");
        return workData.description ? (typeof workData.description === 'string' ? workData.description : workData.description.value) : null;
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching from Open Library:", error);
    return null;
  }
}

/**
 * Main synopsis fetching function. Tries Google Books first, then Open Library.
 * @param {string} title The book title.
 * @param {string} author The book author.
 * @returns {Promise<string|null>} The synopsis text or a default message.
 */
export async function fetchSynopsis(title, author) {
  const googleSynopsis = await fetchGoogleBooksSynopsis(title, author);
  if (googleSynopsis) {
    return googleSynopsis;
  }

  console.log("Google Books failed, trying Open Library...");
  const openLibrarySynopsis = await fetchOpenLibrarySynopsis(title, author);
  if (openLibrarySynopsis) {
    return openLibrarySynopsis;
  }

  return "No synopsis available.";
}

/**
 * Clears all known cache items (covers, synopses, etc.) from localStorage.
 * It intelligently removes only keys that start with the app's known prefixes.
 * @returns {number} The total number of items cleared from the cache.
 */
export function clearApiCache() {
  const prefixes = ['cover_', 'synopsis_', 'workkey_', 'subjects_'];
  let clearedCount = 0;

  // We have to loop backwards when removing items from a collection
  // or create a list of keys to remove first.
  const keysToRemove = [];

  for (const key in localStorage) {
    // Check if the key in localStorage starts with any of our known prefixes
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  // Now, iterate over the list of keys to remove
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
    clearedCount++;
  }

  console.log(`Cache cleared. Removed ${clearedCount} items.`);
  return clearedCount;
}

// --- ISBN FETCHING HELPER ---
// In coverAPI.js, replace the old function with this definitive one.

/**
 * Fetches an ISBN from OpenLibrary by specifically requesting the ISBN field
 * and then searching the results for a valid ISBN-13 or ISBN-10.
 * @param {string} title - The title of the book.
 * @param {string} author - The author of the book.
 * @returns {Promise<string|null>} A promise that resolves to an ISBN string or null.
 */
export async function fetchIsbn(title, author) {
  if (!title || !author) {
    console.warn("fetchIsbn called with missing title or author.");
    return null;
  }

  // Construct the search parameters
  const params = new URLSearchParams({
    title: title,
    author: author,
    // THIS IS THE CRITICAL FIX: Explicitly request the ISBN field.
    fields: '*,isbn' 
  });

  const url = `https://openlibrary.org/search.json?${params.toString()}`;

  // For debugging, you can log the URL to see what is being sent
  console.log("Fetching ISBN from URL:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // For debugging, log the entire response data
    // console.log("Received data from Open Library:", data);

    if (!data.docs || data.docs.length === 0) {
      console.log("No books found on Open Library for this title/author.");
      return null;
    }

    // Loop through the documents returned by the API
    let foundIsbn10 = null;

    for (const doc of data.docs) {
      // Because we requested the 'isbn' field, we can now reliably check for it.
      if (doc.isbn && Array.isArray(doc.isbn) && doc.isbn.length > 0) {

        // Prioritize finding a valid ISBN-13 (the modern standard).
        const isbn13 = doc.isbn.find(id => typeof id === 'string' && id.length === 13 && /^\d+$/.test(id));
        if (isbn13) {
          console.log(`Success! Found ISBN-13: ${isbn13}`);
          return isbn13; // Return immediately with the best result.
        }

        // If no ISBN-13, look for a valid ISBN-10 as a fallback.
        // We store it but don't return immediately, in case a later result has an ISBN-13.
        if (!foundIsbn10) {
          const isbn10 = doc.isbn.find(id => typeof id === 'string' && id.length === 10 && /^\d{9}[\dX]$/i.test(id));
          if (isbn10) {
            foundIsbn10 = isbn10;
          }
        }
      }
    }

    // If we finished the loop and only found an ISBN-10, return it.
    if (foundIsbn10) {
      console.log(`No ISBN-13 found. Returning fallback ISBN-10: ${foundIsbn10}`);
      return foundIsbn10;
    }

    // If we get here, no valid ISBN was found in any of the results.
    console.log("Searched all results, but no valid ISBN was found.");
    return null;

  } catch (error) {
    console.error("Error fetching ISBN from Open Library:", error);
    return null;
  }
}

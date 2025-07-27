// coverAPI.js

const placeholderImage = "https://fangsfangsfangs.neocities.org/book-covers/placeholder.jpg";

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
    return placeholderImage;
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
  return placeholderImage;
}

export { placeholderImage };

// --- SYNOPSIS FETCHING & CACHING ---

function getCacheKeyWorkKey(title, author) {
  return `workkey_${title.toLowerCase()}_${author.toLowerCase()}`;
}

function getCacheKeySynopsis(title, author) {
  return `synopsis_${title.toLowerCase()}_${author.toLowerCase()}`;
}

export async function getWorkKey(title, author) {
  const cacheKey = getCacheKeyWorkKey(title, author);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    );
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

export async function fetchSynopsisByWorkKey(workKey, title, author) {
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

export async function fetchSynopsis(title, author) {
  const cacheKey = getCacheKeySynopsis(title, author);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  const workKey = await getWorkKey(title, author);
  return await fetchSynopsisByWorkKey(workKey, title, author);
}

// === Genre tag fetch ===

function normalizeSubject(subject) {
  return subject.toLowerCase().replace(/_/g, " ").trim();
}

export async function fetchFilteredSubjects(title, author) {
  const cacheKey = `subjects_${title.toLowerCase()}_${author.toLowerCase()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    );
    const data = await res.json();

    const work = data?.docs?.[0];
    if (work?.subject_key?.length) {
      const normalized = work.subject_key.map(normalizeSubject);

      localStorage.setItem(cacheKey, JSON.stringify(normalized));
      return normalized;
    }
  } catch (e) {
    console.error("Failed to fetch subjects:", e);
  }

  localStorage.setItem(cacheKey, JSON.stringify([]));
  return [];
}

// --- ISBN FETCHING HELPER ---

/**
 * Fetches an ISBN-13 or ISBN-10 from OpenLibrary based on title and author.
 * It prioritizes finding an ISBN-13 and falls back to an ISBN-10 if none is found.
 * @param {string} title - The title of the book.
 * @param {string} author - The author of the book.
 * @returns {Promise<string|null>} A promise that resolves to an ISBN string or null.
 */
export async function fetchIsbn(title, author) {
  if (!title || !author) {
    return null;
  }

  const params = new URLSearchParams({ title: title, author: author });
  const url = `https://openlibrary.org/search.json?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (!data.docs || data.docs.length === 0) {
      console.log("No books found on Open Library for this title/author.");
      return null;
    }

    const firstResult = data.docs[0];
    if (!firstResult.isbn) {
      console.log("First result found, but it has no ISBNs listed.");
      return null;
    }

    const isbn13 = firstResult.isbn.find(id => id.length === 13 && /^\d+$/.test(id));
    
    if (isbn13) {
      console.log(`Found ISBN-13: ${isbn13}`);
      return isbn13; // Success! Return the ISBN-13 immediately.
    }

    console.log("No ISBN-13 found. Searching for ISBN-10 as a fallback.");
    const isbn10 = firstResult.isbn.find(id => id.length === 10); // A simple length check is usually sufficient here.
    
    if (isbn10) {
      console.log(`Found ISBN-10: ${isbn10}`);
      return isbn10; // Success! Return the ISBN-10.
    }

    console.log("No valid ISBN-13 or ISBN-10 found in the first result.");
    return null;

  } catch (error) {
    console.error("Error fetching ISBN from Open Library:", error);
    return null;
  }
}

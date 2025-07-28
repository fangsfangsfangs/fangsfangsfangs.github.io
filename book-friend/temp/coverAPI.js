// coverAPI.js

// A simple in-memory cache for API responses to avoid re-fetching
const apiCache = new Map();
const SYNOPSIS_CACHE_PREFIX = 'synopsis-';

// --- Placeholder Images ---
const placeholderImages = [
    "https://fangsfangsfangs.github.io/book-friend/placeholder-1.jpg",
    "https://fangsfangsfangs.github.io/book-friend/placeholder-2.jpg",
    "https://fangsfangsfangs.github.io/book-friend/placeholder-3.jpg"
];

export function getRandomPlaceholder() {
    const randomIndex = Math.floor(Math.random() * placeholderImages.length);
    return placeholderImages[randomIndex];
}

// --- Image & Cover Helpers ---
export async function imageExists(url) {
    try {
        const res = await fetch(url, { method: "HEAD" });
        return res.ok;
    } catch {
        return false;
    }
}

export async function fetchOpenLibraryCover(title, author, isbn) {
    // ... (This function is correct as is, no changes needed)
    if (!title || !author) return null;
    const cleanIsbn = isbn?.replace(/[-\s]/g, "").trim();
    const cacheKey = `cover_${title.toLowerCase()}_${author.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached === "null" ? null : cached;
    
    try {
        const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);
        const data = await res.json();
        if (data.docs?.length > 0) {
            const docWithCover = data.docs.find(d => d.cover_i);
            if (docWithCover?.cover_i) {
                const coverUrl = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
                localStorage.setItem(cacheKey, coverUrl);
                return coverUrl;
            }
        }
    } catch (e) { console.warn("OpenLibrary search failed:", e); }

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

export async function getCoverUrl(book) {
    if (!book) return getRandomPlaceholder();
    const openLibCover = await fetchOpenLibraryCover(book.title, book.author, book.isbn);
    if (openLibCover) return openLibCover;
    if (book.cover?.trim()) {
        const fallbackCover = book.cover.trim();
        if (await imageExists(fallbackCover)) return fallbackCover;
    }
    return getRandomPlaceholder();
}

// ==========================================================
// SYNOPSIS FETCHING
// ==========================================================

// --- IMPORTANT: ADD YOUR API KEY HERE ---
const GOOGLE_BOOKS_API_KEY = 'PASTE_YOUR_GOOGLE_BOOKS_API_KEY_HERE';

function cleanSynopsis(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Fetches a synopsis from the Google Books API.
 * @param {object} book
 * @returns {Promise<string|null>}
 */
async function fetchSynopsisFromGoogleBooks(book) {
    if (!GOOGLE_BOOKS_API_KEY || GOOGLE_BOOKS_API_KEY === 'PASTE_YOUR_GOOGLE_BOOKS_API_KEY_HERE') {
        console.warn("Google Books API key is missing.");
        return null;
    }
    const query = book.isbn ? `isbn:${book.isbn}` : `intitle:${encodeURIComponent(book.title)}+inauthor:${encodeURIComponent(book.author)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const description = data.items?.[0]?.volumeInfo?.description;
        return description ? cleanSynopsis(description) : null;
    } catch (error) {
        console.error("Error fetching from Google Books:", error);
        return null;
    }
}

/**
 * Fetches a synopsis from the Open Library API.
 * THIS IS THE RENAMED FUNCTION
 * @param {object} book
 * @returns {Promise<string|null>}
 */
async function fetchSynopsisFromOpenLibrary(book) {
    const titleQuery = encodeURIComponent(book.title.replace(/\s+/g, '+'));
    const authorQuery = encodeURIComponent(book.author.replace(/\s+/g, '+'));
    const url = `https://openlibrary.org/search.json?title=${titleQuery}&author=${authorQuery}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const bookKey = data.docs?.[0]?.key;
        if (!bookKey) return null;
        const workUrl = `https://openlibrary.org${bookKey}.json`;
        const workResponse = await fetch(workUrl);
        if (!workResponse.ok) return null;
        const workData = await workResponse.json();
        let description = workData.description;
        if (typeof description === 'object' && description !== null) {
            description = description.value;
        }
        return description ? cleanSynopsis(description) : null;
    } catch (error) {
        console.error("Error fetching from Open Library:", error);
        return null;
    }
}

/**
 * THE MAIN EXPORTED WATERFALL FUNCTION
 * Fetches a book synopsis using a waterfall approach.
 * @param {object} book
 * @returns {Promise<string>}
 */
export async function fetchSynopsis(book) {
    const cacheKey = `${SYNOPSIS_CACHE_PREFIX}${book.title}-${book.author}`;
    if (apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey);
    }

    // 1. Try Google Books first
    let synopsis = await fetchSynopsisFromGoogleBooks(book);

    // 2. Fallback to Open Library if needed
    if (!synopsis || synopsis.length < 100) {
        const openLibrarySynopsis = await fetchSynopsisFromOpenLibrary(book);
        if (openLibrarySynopsis && openLibrarySynopsis.length > (synopsis?.length || 0)) {
            synopsis = openLibrarySynopsis;
        }
    }

    const finalResult = synopsis && synopsis.length > 20 ? synopsis : "No synopsis available for this title.";
    apiCache.set(cacheKey, finalResult);
    return finalResult;
}

// ==========================================================
// OTHER EXPORTED FUNCTIONS
// ==========================================================

export async function fetchFilteredSubjects(title, author) {
    // ... (This function is correct as is, no changes needed)
    const cacheKey = `subjects_${title.toLowerCase()}_${author.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    try {
        const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);
        const data = await res.json();
        const work = data?.docs?.[0];
        if (work?.subject_key?.length) {
            const normalized = work.subject_key.map(s => s.toLowerCase().replace(/_/g, " ").trim());
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
            return normalized;
        }
    } catch (e) { console.error("Failed to fetch subjects:", e); }
    localStorage.setItem(cacheKey, JSON.stringify([]));
    return [];
}

export function clearApiCache() {
    const prefixes = ['cover_', 'synopsis_', 'workkey_', 'subjects_'];
    let clearedCount = 0;
    const keysToRemove = [];
    for (const key in localStorage) {
        if (prefixes.some(prefix => key.startsWith(prefix))) {
            keysToRemove.push(key);
        }
    }
    for (const key of keysToRemove) {
        localStorage.removeItem(key);
        clearedCount++;
    }
    return clearedCount;
}

export async function fetchIsbn(title, author) {
    // ... (This function is correct as is, no changes needed)
    if (!title || !author) return null;
    const params = new URLSearchParams({ title: title, author: author, fields: '*,isbn' });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!data.docs?.length) return null;
        let foundIsbn10 = null;
        for (const doc of data.docs) {
            if (doc.isbn && Array.isArray(doc.isbn) && doc.isbn.length > 0) {
                const isbn13 = doc.isbn.find(id => typeof id === 'string' && id.length === 13 && /^\d+$/.test(id));
                if (isbn13) return isbn13;
                if (!foundIsbn10) {
                    const isbn10 = doc.isbn.find(id => typeof id === 'string' && id.length === 10 && /^\d{9}[\dX]$/i.test(id));
                    if (isbn10) foundIsbn10 = isbn10;
                }
            }
        }
        return foundIsbn10;
    } catch (error) {
        console.error("Error fetching ISBN:", error);
        return null;
    }
}

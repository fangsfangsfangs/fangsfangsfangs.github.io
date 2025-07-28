// coverAPI.js

// --- IMPORTANT: PASTE YOUR GOOGLE BOOKS API KEY HERE ---
const GOOGLE_BOOKS_API_KEY = 'AIzaSyBfoOESdJcIYsSCWhviuKJYJrWcyC4ghRk';
// If you do not have one, the Google Books features will not work.

// Session cache to prevent re-fetching the same book
const apiCache = new Map();

const placeholderImages = [
    "https://fangsfangsfangs.github.io/book-friend/placeholder-1.jpg",
    "https://fangsfangsfangs.github.io/book-friend/placeholder-2.jpg",
    "https://fangsfangsfangs.github.io/book-friend/placeholder-3.jpg"
];

export function getRandomPlaceholder() {
    return placeholderImages[Math.floor(Math.random() * placeholderImages.length)];
}

/**
 * A robust fetch wrapper that applies the redirect fix for Open Library.
 * @param {string} url The URL to fetch.
 * @returns {Promise<Response>} The fetch response.
 */
function robustFetch(url) {
    // This is the universal fix for Open Library's redirect-related CORS issues.
    return fetch(url, { redirect: 'follow' });
}

// --- Cover Fetching ---
// In coverAPI.js, replace the existing getCoverUrl function

export async function getCoverUrl(book) {
    if (!book || !book.title || !book.author) {
        return getRandomPlaceholder();
    }

    const cacheKey = `cover_${book.title}_${book.author}`;
    if (apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey);
    }

    // 1. Primary Source: Open Library (now first)
    try {
        const titleQuery = encodeURIComponent(book.title);
        const authorQuery = encodeURIComponent(book.author);
        const res = await robustFetch(`https://openlibrary.org/search.json?title=${titleQuery}&author=${authorQuery}`);
        
        if (res.ok) {
            const data = await res.json();
            const docWithCover = data.docs?.find(d => d.cover_i);
            if (docWithCover?.cover_i) {
                const coverUrl = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
                console.log("Cover found via Open Library (Primary).");
                apiCache.set(cacheKey, coverUrl);
                return coverUrl;
            }
        }
    } catch (e) { 
        console.warn("Open Library cover fetch failed:", e); 
    }

    // 2. Fallback Source: Google Books
    if (GOOGLE_BOOKS_API_KEY && GOOGLE_BOOKS_API_KEY !== 'AIzaSyBfoOESdJcIYsSCWhviuKJYJrWcyC4ghRk') {
        try {
            const query = book.isbn 
                ? `isbn:${book.isbn}` 
                : `intitle:${encodeURIComponent(book.title)}+inauthor:${encodeURIComponent(book.author)}`;
            const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}`;
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const cover = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
                if (cover) {
                    console.log("Cover found via Google Books (Fallback).");
                    apiCache.set(cacheKey, cover);
                    return cover;
                }
            }
        } catch (e) { 
            console.error("Google Books cover fetch failed:", e); 
        }
    }

    // 3. Final Fallback: Placeholder Image
    console.log("No cover found from any source. Using placeholder.");
    apiCache.set(cacheKey, getRandomPlaceholder());
    return getRandomPlaceholder();
}


// --- Synopsis Fetching ---
function cleanSynopsis(text) {
    return text ? text.replace(/<[^>]*>/g, '').trim() : '';
}

export async function fetchSynopsis(book) {
    const cacheKey = `synopsis_${book.title}_${book.author}`;
    if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

    // 1. Primary Source: Google Books
    if (GOOGLE_BOOKS_API_KEY && GOOGLE_BOOKS_API_KEY !== 'AIzaSyBfoOESdJcIYsSCWhviuKJYJrWcyC4ghRk') {
        const query = book.isbn ? `isbn:${book.isbn}` : `intitle:${encodeURIComponent(book.title)}+inauthor:${encodeURIComponent(book.author)}`;
        const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const synopsis = data.items?.[0]?.volumeInfo?.description;
            if (synopsis && synopsis.length > 20) {
                console.log("Synopsis found via Google Books.");
                const cleaned = cleanSynopsis(synopsis);
                apiCache.set(cacheKey, cleaned);
                return cleaned;
            }
        } catch (e) { console.error("Google Books synopsis fetch failed:", e); }
    }
    
    // 2. Fallback Source: Open Library
    try {
        console.log("Falling back to Open Library for synopsis...");
        const searchRes = await robustFetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author)}`);
        const searchData = await searchRes.json();
        const bookKey = searchData.docs?.[0]?.key;
        if (bookKey) {
            const workRes = await robustFetch(`https://openlibrary.org${bookKey}.json`);
            const workData = await workRes.json();
            let description = workData.description;
            if (typeof description === 'object' && description !== null) description = description.value;
            if (description && description.length > 20) {
                console.log("Synopsis found via Open Library.");
                const cleaned = cleanSynopsis(description);
                apiCache.set(cacheKey, cleaned);
                return cleaned;
            }
        }
    } catch (e) { console.error("Open Library synopsis fetch failed:", e); }

    // 3. Final Fallback
    console.log("No synopsis found from any source.");
    apiCache.set(cacheKey, "No synopsis available.");
    return "No synopsis available.";
}

// --- Genre/Tag Fetching ---
export async function fetchFilteredSubjects(title, author) {
    const cacheKey = `subjects_${title}_${author}`;
    if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

    try {
        const res = await robustFetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);
        const data = await res.json();
        const subjects = data.docs?.[0]?.subject;
        if (subjects && subjects.length > 0) {
            // Take the first 5, clean them up
            const tags = subjects.slice(0, 5).map(s => s.toLowerCase().replace(/_/g, " ").trim());
            console.log("Found genre tags via Open Library:", tags);
            apiCache.set(cacheKey, tags);
            return tags;
        }
    } catch (e) { console.error("Open Library subject fetch failed:", e); }
    
    console.log("No genre tags found.");
    apiCache.set(cacheKey, []);
    return [];
}


// --- ISBN Fetching ---
export async function fetchIsbn(title, author) {
    // This can still be useful as a standalone function
    try {
        const res = await robustFetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&fields=*,isbn`);
        const data = await res.json();
        if (!data.docs?.length) return null;
        for (const doc of data.docs) {
            if (doc.isbn && Array.isArray(doc.isbn)) {
                const isbn13 = doc.isbn.find(id => id.length === 13 && /^\d+$/.test(id));
                if (isbn13) return isbn13;
            }
        }
    } catch (e) { console.error("ISBN fetch failed:", e); }
    return null;
}

// --- Cache Management ---
export function clearApiCache() {
    apiCache.clear();
    console.log("Session API cache cleared.");
    return apiCache.size;
}

// --- The "Smart Add" Function ---
export async function fetchEnrichedBookData(title, author) {
    console.log(`Enriching data for "${title}"...`);
    const [isbn, tags] = await Promise.all([
        fetchIsbn(title, author),
        fetchFilteredSubjects(title, author)
    ]);
    const coverUrl = await getCoverUrl({ title, author, isbn: isbn });
    return {
        isbn: isbn || "",
        coverUrl: coverUrl,
        tags: tags || []
    };
}

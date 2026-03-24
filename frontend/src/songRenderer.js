/**
 * Song Renderer Module
 * Fetches song data and renders song cards dynamically.
 */

const DEFAULT_COVER = "covers/cover-default.png";

/**
 * Fetch songs from the JSON data file.
 * @returns {Promise<Array>} Array of song objects
 */
export async function fetchSongs() {
    const base = import.meta.env.BASE_URL;
    const response = await fetch(`${base}songs.json`);
    if (!response.ok) {
        throw new Error(`Failed to fetch songs: ${response.status}`);
    }
    const data = await response.json();
    const songs = data.songs || [];

    // Resolve relative URLs with the base path
    return songs.map((song) => ({
        ...song,
        url: song.url && !song.url.startsWith("http") ? `${base}${song.url}` : song.url,
        cover: resolveCoverUrl(song.cover, base),
    }));
}

/**
 * Resolve cover image URL. Falls back to default cover.
 */
function resolveCoverUrl(cover, base) {
    if (!cover) return `${base}${DEFAULT_COVER}`;
    if (cover.startsWith("http")) return cover;
    return `${base}${cover}`;
}

/**
 * Extract all unique tags from songs array.
 * @param {Array} songs
 * @returns {Array<string>} Sorted unique tags
 */
export function extractAllTags(songs) {
    const tagSet = new Set();
    songs.forEach((song) => {
        if (song.tags) {
            song.tags.forEach((tag) => tagSet.add(tag));
        }
    });
    return Array.from(tagSet).sort();
}

/**
 * Render tag filter buttons in the sidebar.
 * @param {Array<string>} tags
 * @param {HTMLElement} container
 * @param {Function} onTagClick - callback(tag, isActive)
 */
export function renderTagFilters(tags, container, onTagClick) {
    container.innerHTML = "";
    tags.forEach((tag) => {
        const btn = document.createElement("button");
        btn.className =
            "tag-btn px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold rounded-md transition-all border border-white/10 uppercase tracking-wider";
        btn.textContent = tag;
        btn.dataset.tag = tag;
        btn.addEventListener("click", () => {
            btn.classList.toggle("active");
            onTagClick(tag, btn.classList.contains("active"));
        });
        container.appendChild(btn);
    });
}

/**
 * Create and render a song card.
 * @param {Object} song - Song data object
 * @param {HTMLElement} container - Parent container to append card to
 */
export function renderSongCard(song, container) {
    const article = document.createElement("article");
    article.className =
        "song-card group relative flex flex-col md:flex-row gap-5 bg-surface-container-low p-5 rounded-lg border border-white/5";
    article.dataset.songId = song.id;
    article.dataset.title = (song.title || "").toLowerCase();
    article.dataset.artist = (song.artist || "").toLowerCase();
    article.dataset.tags = (song.tags || []).map((t) => t.toLowerCase()).join(",");

    const tagsHtml = (song.tags || [])
        .map(
            (tag) =>
                `<span class="px-2.5 py-1 bg-surface-container-highest text-primary text-[10px] uppercase tracking-widest font-bold rounded">${escapeHtml(tag)}</span>`,
        )
        .join("");

    const coverSrc = song.cover || `${import.meta.env.BASE_URL}${DEFAULT_COVER}`;

    article.innerHTML = `
    <!-- Cover Image -->
    <div class="relative w-full md:w-36 h-36 flex-shrink-0 overflow-hidden rounded-md">
      <img
        src="${escapeHtml(coverSrc)}"
        alt="${escapeHtml(song.title)} cover"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        onerror="this.src='${escapeHtml(`${import.meta.env.BASE_URL}${DEFAULT_COVER}`)}'"
      />
    </div>

    <!-- Song Content -->
    <div class="flex-grow flex flex-col justify-between min-w-0">
      <div>
        <div class="flex flex-col sm:flex-row justify-between items-start gap-2 mb-1">
          <div class="flex-1 min-w-0">
            <h2 class="font-headline text-xl font-bold tracking-tight mb-0.5 text-white truncate">${escapeHtml(song.title)}</h2>
            <p class="text-sm text-on-surface-variant">${escapeHtml(song.artist)}</p>
          </div>
          <div class="flex gap-2 flex-shrink-0 flex-wrap">
            ${tagsHtml}
          </div>
        </div>

        <!-- Waveform View (default) -->
        <div id="waveform-${song.id}" class="waveform-container">
          <div class="hover-overlay"></div>
        </div>

        <!-- Spectrogram View (hidden by default) -->
        <div id="spectrogram-wrapper-${song.id}" class="spectrogram-wrapper"><div id="spectrogram-${song.id}" class="spectrogram-container"></div></div>

        <!-- Error Message -->
        <div id="error-${song.id}" class="hidden text-red-400 text-xs mt-2 px-1"></div>
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-between mt-3">
        <div class="flex items-center gap-4">
          <button data-play-id="${song.id}"
            class="w-11 h-11 rounded-full bg-surface-container-highest border border-white/10 flex items-center justify-center text-white hover:bg-primary hover:border-primary transition-all active:scale-95"
            aria-label="Play ${escapeHtml(song.title)}">
            <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
          </button>
          <button data-toggle-id="${song.id}"
            class="view-toggle-btn flex items-center gap-2 text-on-surface-variant hover:text-white transition-colors"
            aria-label="Toggle spectrogram view">
            <span class="material-symbols-outlined text-lg">equalizer</span>
            <span class="view-label text-[10px] uppercase font-bold tracking-wider">Spectrogram</span>
          </button>
        </div>
        <div class="flex items-center gap-3 text-on-surface-variant">
          <span id="time-${song.id}" class="text-xs font-mono">0:00</span>
          <span class="text-xs text-white/20">/</span>
          <span id="duration-${song.id}" class="text-xs font-mono">&mdash;</span>
        </div>
      </div>
    </div>
  `;

    container.appendChild(article);
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Main Entry Point
 * Orchestrates song fetching, rendering, player initialization, search, and tag filtering.
 */
import "./style.css";
import { fetchSongs, renderSongCard, extractAllTags, renderTagFilters } from "./songRenderer.js";
import { initPlayer, toggleSpectrogram, togglePlay } from "./player.js";

// State
let allSongs = [];
let activeTags = new Set();
let searchQuery = "";

/**
 * Filter and show/hide song cards based on search query and active tags.
 */
function filterSongs() {
    const songList = document.getElementById("song-list");
    const noResults = document.getElementById("song-list-no-results");
    let visibleCount = 0;

    const cards = songList.querySelectorAll(".song-card");
    cards.forEach((card) => {
        const title = card.dataset.title || "";
        const artist = card.dataset.artist || "";
        const tags = card.dataset.tags || "";

        // Search filter
        const matchesSearch =
            !searchQuery || title.includes(searchQuery) || artist.includes(searchQuery) || tags.includes(searchQuery);

        // Tag filter
        let matchesTags = true;
        if (activeTags.size > 0) {
            const cardTags = tags.split(",").filter(Boolean);
            matchesTags = Array.from(activeTags).some((tag) => cardTags.includes(tag.toLowerCase()));
        }

        if (matchesSearch && matchesTags) {
            card.classList.remove("hidden");
            visibleCount++;
        } else {
            card.classList.add("hidden");
        }
    });

    // Show/hide no results message
    if (noResults) {
        noResults.classList.toggle("hidden", visibleCount > 0 || cards.length === 0);
    }
}

/**
 * Initialize the application.
 */
async function init() {
    const songListEl = document.getElementById("song-list");
    const loadingEl = document.getElementById("song-list-loading");
    const emptyEl = document.getElementById("song-list-empty");
    const searchInput = document.getElementById("search");
    const tagFiltersEl = document.getElementById("tag-filters");
    const statTracks = document.getElementById("stat-tracks");
    const statTags = document.getElementById("stat-tags");

    try {
        // Fetch songs
        allSongs = await fetchSongs();

        // Hide loading
        if (loadingEl) loadingEl.classList.add("hidden");

        // Handle empty state
        if (allSongs.length === 0) {
            if (emptyEl) emptyEl.classList.remove("hidden");
            return;
        }

        // Extract tags and render tag filters
        const allTags = extractAllTags(allSongs);

        if (tagFiltersEl) {
            renderTagFilters(allTags, tagFiltersEl, (tag, isActive) => {
                if (isActive) {
                    activeTags.add(tag);
                } else {
                    activeTags.delete(tag);
                }
                filterSongs();
            });
        }

        // Update stats
        if (statTracks) statTracks.textContent = allSongs.length.toString();
        if (statTags) statTags.textContent = allTags.length.toString();

        // Render song cards
        allSongs.forEach((song) => {
            renderSongCard(song, songListEl);
        });

        // Initialize wavesurfer players with IntersectionObserver (lazy loading)
        const initializedPlayers = new Set();
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const songId = parseInt(entry.target.id.replace("waveform-", ""), 10);
                        if (!initializedPlayers.has(songId)) {
                            const song = allSongs.find((s) => s.id === songId);
                            if (song) {
                                initPlayer(song, `#waveform-${songId}`);
                                initializedPlayers.add(songId);
                            }
                        }
                    }
                });
            },
            { rootMargin: "200px" },
        );

        // Observe all waveform containers
        allSongs.forEach((song) => {
            const waveformEl = document.getElementById(`waveform-${song.id}`);
            if (waveformEl) observer.observe(waveformEl);
        });

        // Event delegation for play/pause and toggle buttons
        songListEl.addEventListener("click", (e) => {
            // Play/pause button
            const playBtn = e.target.closest("[data-play-id]");
            if (playBtn) {
                const songId = parseInt(playBtn.dataset.playId, 10);
                togglePlay(songId);
                return;
            }

            // Spectrogram toggle button
            const toggleBtn = e.target.closest("[data-toggle-id]");
            if (toggleBtn) {
                const songId = parseInt(toggleBtn.dataset.toggleId, 10);
                toggleSpectrogram(songId);
                return;
            }
        });

        // Search handler
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                searchQuery = e.target.value.toLowerCase().trim();
                filterSongs();
            });
        }
    } catch (err) {
        console.error("Failed to initialize app:", err);
        if (loadingEl) loadingEl.classList.add("hidden");
        if (emptyEl) {
            emptyEl.classList.remove("hidden");
            const msg = emptyEl.querySelector("p");
            if (msg) msg.textContent = "Failed to load the archive. Please try again later.";
        }
    }
}

// Start the app
document.addEventListener("DOMContentLoaded", init);

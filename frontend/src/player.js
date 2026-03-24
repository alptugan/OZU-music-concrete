import WaveSurfer from "wavesurfer.js";
import Spectrogram from "wavesurfer.js/dist/plugins/spectrogram.esm.js";

// Store all active wavesurfer instances
const players = new Map();

/**
 * Extract Google Drive file ID from various URL formats.
 * Returns null if URL is not a Google Drive link.
 */
function extractGDriveFileId(url) {
    if (!url) return null;

    // Format: /file/d/FILE_ID/
    const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
    if (fileMatch) return fileMatch[1];

    // Format: open?id=FILE_ID
    const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (openMatch) return openMatch[1];

    // Format: uc?...id=FILE_ID
    const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
    if (ucMatch) return ucMatch[1];

    // Format: drive.usercontent.google.com/download?id=FILE_ID
    const contentMatch = url.match(/drive\.usercontent\.google\.com\/download\?.*id=([^&]+)/);
    if (contentMatch) return contentMatch[1];

    return null;
}

/**
 * Cloudflare Worker URL for proxying Google Drive audio in production.
 * Deploy the worker from /cloudflare-worker/gdrive-proxy.js and update this URL.
 *
 * TODO: Replace with your actual Cloudflare Worker URL after deployment.
 */
const CLOUDFLARE_WORKER_URL = "https://gdrive-proxy.YOUR-SUBDOMAIN.workers.dev";

/**
 * Convert Google Drive share links to playable URLs.
 * In development, routes through Vite proxy to bypass CORS.
 * In production, routes through Cloudflare Worker CORS proxy.
 */
export function convertGDriveUrl(url) {
    if (!url) return null;

    const fileId = extractGDriveFileId(url);
    if (!fileId) return url; // Not a Google Drive URL, return as-is

    // Route through Vite dev proxy to bypass CORS
    if (import.meta.env.DEV) {
        return `/api/gdrive?id=${encodeURIComponent(fileId)}`;
    }

    // Production: route through Cloudflare Worker CORS proxy
    return `${CLOUDFLARE_WORKER_URL}/?id=${encodeURIComponent(fileId)}`;
}

/**
 * Create canvas gradient for waveform (SoundCloud style).
 */
function createGradients(ctx, height) {
    const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
    waveGradient.addColorStop(0, "#656666");
    waveGradient.addColorStop(0.69, "#656666");
    waveGradient.addColorStop(0.7, "#ffffff");
    waveGradient.addColorStop(0.71, "#B1B1B1");
    waveGradient.addColorStop(1, "#B1B1B1");

    const progressGradient = ctx.createLinearGradient(0, 0, 0, height);
    progressGradient.addColorStop(0, "#ffbb00");
    progressGradient.addColorStop(0.69, "#ffbb00");
    progressGradient.addColorStop(0.7, "#ffffff");
    progressGradient.addColorStop(0.71, "#c49200");
    progressGradient.addColorStop(1, "#c49200");

    return { waveGradient, progressGradient };
}

/**
 * Format seconds to mm:ss string.
 */
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Pause all other players except the given songId.
 */
function pauseOthers(songId) {
    players.forEach((player, id) => {
        if (id !== songId && player.ws.isPlaying()) {
            player.ws.pause();
        }
    });
}

/**
 * Attach event listeners to a wavesurfer instance.
 */
function attachPlayerEvents(ws, song, container) {
    const hoverOverlay = container.querySelector(".hover-overlay");
    if (hoverOverlay) {
        container.addEventListener("pointermove", (e) => {
            const rect = container.getBoundingClientRect();
            hoverOverlay.style.width = `${e.clientX - rect.left}px`;
        });
    }

    const timeEl = document.getElementById(`time-${song.id}`);
    const durationEl = document.getElementById(`duration-${song.id}`);

    ws.on("decode", (duration) => {
        if (durationEl) durationEl.textContent = formatTime(duration);
    });

    ws.on("timeupdate", (currentTime) => {
        if (timeEl) timeEl.textContent = formatTime(currentTime);
    });

    const playBtn = document.querySelector(`[data-play-id="${song.id}"]`);
    const songCard = document.querySelector(`.song-card[data-song-id="${song.id}"]`);

    ws.on("play", () => {
        pauseOthers(song.id);
        // Remove active from all other cards
        document.querySelectorAll(".song-card.active").forEach((card) => {
            if (card.dataset.songId !== String(song.id)) {
                card.classList.remove("active");
            }
        });
        // Add active to this card (persists on pause)
        if (songCard) songCard.classList.add("active");
        if (playBtn) {
            playBtn.querySelector(".material-symbols-outlined").textContent = "pause";
        }
    });

    ws.on("pause", () => {
        // Keep .active on the card — only update the icon
        if (playBtn) {
            playBtn.querySelector(".material-symbols-outlined").textContent = "play_arrow";
        }
    });

    ws.on("finish", () => {
        // Remove active highlight when song finishes
        if (songCard) songCard.classList.remove("active");
        if (playBtn) {
            playBtn.querySelector(".material-symbols-outlined").textContent = "play_arrow";
        }
    });
}

/**
 * Show error state on a song card.
 */
function showError(songId, message, container) {
    const errorEl = document.getElementById(`error-${songId}`);
    if (errorEl) {
        errorEl.classList.remove("hidden");
        errorEl.textContent = message;
    }
    container.style.opacity = "0.5";
}

/**
 * Build common wavesurfer options.
 */
function buildWsOptions(container, waveGradient, progressGradient, song) {
    const opts = {
        container,
        waveColor: waveGradient,
        progressColor: progressGradient,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 80,
        cursorWidth: 0,
        dragToSeek: true,
        normalize: true,
    };
    if (song.peaks) {
        opts.peaks = [song.peaks];
    }
    return opts;
}

/**
 * Initialize a WaveSurfer player for a song.
 *
 * Strategy:
 * 1. Try loading via fetch (default) — gives full waveform rendering.
 * 2. If CORS blocks the fetch, retry with an <audio> element —
 *    audio plays fine; waveform won't render peaks unless pre-computed
 *    peaks are provided in song.peaks.
 */
export function initPlayer(song, waveformSelector) {
    const container = document.querySelector(waveformSelector);
    if (!container) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const { waveGradient, progressGradient } = createGradients(ctx, 150);
    const audioUrl = convertGDriveUrl(song.url);

    const baseOpts = buildWsOptions(container, waveGradient, progressGradient, song);

    // Try fetch-based loading first (full waveform support)
    const ws = WaveSurfer.create({ ...baseOpts, url: audioUrl });

    const playerData = {
        ws,
        spectrogramPlugin: null,
        spectrogramVisible: false,
        corsRetried: false,
    };
    players.set(song.id, playerData);

    attachPlayerEvents(ws, song, container);

    // On error, check if it's a CORS/network issue and retry with <audio> element
    ws.on("error", (err) => {
        const errMsg = typeof err === "string" ? err : err?.message || "";
        const isNetworkError =
            err instanceof TypeError ||
            errMsg.includes("fetch") ||
            errMsg.includes("NetworkError") ||
            errMsg.includes("Failed to fetch");

        if (isNetworkError && !playerData.corsRetried) {
            playerData.corsRetried = true;
            console.warn(`CORS/network issue for "${song.title}", retrying with <audio> element`);

            // Destroy the failed instance
            ws.destroy();

            // Reset container (wavesurfer clears it on destroy, re-add hover overlay)
            container.innerHTML = '<div class="hover-overlay"></div>';

            // Create <audio> element — no crossOrigin so it loads from any origin
            const audio = new Audio(audioUrl);

            const fallbackWs = WaveSurfer.create({ ...baseOpts, media: audio });
            playerData.ws = fallbackWs;

            attachPlayerEvents(fallbackWs, song, container);

            // If the <audio> element also fails, show error
            fallbackWs.on("error", (fallbackErr) => {
                console.error(`Error loading song ${song.id}:`, fallbackErr);
                showError(song.id, "Failed to load audio. Check the URL or try again.", container);
            });
        } else if (!playerData.corsRetried) {
            console.error(`Error loading song ${song.id}:`, err);
            showError(song.id, "Failed to load audio. Check the URL or try again.", container);
        }
    });

    return ws;
}

/**
 * Toggle spectrogram visibility below the waveform.
 * Waveform stays visible; spectrogram shows/hides underneath.
 */
export function toggleSpectrogram(songId) {
    const playerData = players.get(songId);
    if (!playerData) return;

    const { ws } = playerData;
    const toggleBtn = document.querySelector(`[data-toggle-id="${songId}"]`);
    const waveformContainer = document.getElementById(`waveform-${songId}`);

    if (!waveformContainer) return;

    if (!playerData.spectrogramVisible) {
        // Block showing while spectrogram is being generated
        if (playerData.spectrogramCreating) return;

        if (!playerData.spectrogramPlugin) {
            playerData.spectrogramCreating = true;

            // Show loading spinner below the waveform
            const loader = document.createElement("div");
            loader.className = "spectrogram-loading";
            loader.innerHTML = '<div class="spinner"></div><span>Generating spectrogram…</span>';
            waveformContainer.parentNode.insertBefore(loader, waveformContainer.nextSibling);

            // setTimeout lets the browser paint the spinner before heavy FFT
            setTimeout(() => {
                try {
                    const spectrogramContainer = document.getElementById(`spectrogram-${songId}`);
                    playerData.spectrogramPlugin = ws.registerPlugin(
                        Spectrogram.create({
                            container: spectrogramContainer || undefined,
                            labels: true,
                            height: 200,
                            splitChannels: false,
                            scale: "linear",
                            frequencyMax: 4000,
                            frequencyMin: 0,
                            fftSamples: 512,
                            labelsColor: "#a0a0a0",
                            labelsBackground: "#0a0a0abb",
                            sampleRate: 44100,
                        }),
                    );

                    // Remove loading spinner
                    const existingLoader = waveformContainer.parentNode.querySelector(".spectrogram-loading");
                    if (existingLoader) existingLoader.remove();
                    playerData.spectrogramCreating = false;

                    // The plugin renders inside wavesurfer's wrapper.
                    // Make sure it's visible.
                    if (playerData.spectrogramPlugin.wrapper) {
                        playerData.spectrogramPlugin.wrapper.style.display = "";
                    }
                } catch (err) {
                    console.error("Spectrogram creation failed:", err);
                    const existingLoader = waveformContainer.parentNode.querySelector(".spectrogram-loading");
                    if (existingLoader) existingLoader.remove();
                    playerData.spectrogramCreating = false;
                }
            }, 150);
        } else {
            // Plugin already created — just show its wrapper
            if (playerData.spectrogramPlugin.wrapper) {
                playerData.spectrogramPlugin.wrapper.style.display = "";
            }
        }

        playerData.spectrogramVisible = true;

        if (toggleBtn) {
            toggleBtn.classList.add("active");
            toggleBtn.querySelector(".view-label").textContent = "Hide";
            toggleBtn.querySelector(".material-symbols-outlined").textContent = "graphic_eq";
        }
    } else {
        // --- Hide spectrogram ---
        if (playerData.spectrogramPlugin && playerData.spectrogramPlugin.wrapper) {
            playerData.spectrogramPlugin.wrapper.style.display = "none";
        }

        // If spectrogram is still being created, clean up
        if (playerData.spectrogramCreating) {
            playerData.spectrogramCreating = false;
            const loader = waveformContainer.parentNode.querySelector(".spectrogram-loading");
            if (loader) loader.remove();
        }

        playerData.spectrogramVisible = false;

        if (toggleBtn) {
            toggleBtn.classList.remove("active");
            toggleBtn.querySelector(".view-label").textContent = "Spectrogram";
            toggleBtn.querySelector(".material-symbols-outlined").textContent = "equalizer";
        }
    }
}

/**
 * Play or pause a specific song.
 */
export function togglePlay(songId) {
    const playerData = players.get(songId);
    if (!playerData) return;
    playerData.ws.playPause();
}

/**
 * Get a player instance by song ID.
 */
export function getPlayer(songId) {
    return players.get(songId);
}

/**
 * Destroy all player instances (cleanup).
 */
export function destroyAllPlayers() {
    players.forEach((player) => {
        player.ws.destroy();
    });
    players.clear();
}

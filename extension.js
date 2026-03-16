// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Gilson Fonseca

/**
 * Magnific Launcher — GNOME Shell Extension
 *
 * Adds a macOS-style magnification wave effect to dock icons on hover.
 * Compatible with Ubuntu Dock, Dash to Dock, Dash to Panel, and the default GNOME dash.
 *
 * GNOME Shell 47+
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Module-level GSettings instance. Set in enable(), cleared in disable().
 * All helper functions read from this object at call time so changes take
 * effect immediately without restarting the extension.
 *
 * Keys:
 *   zoom-pixels    (int)    – extra pixels to add to the hovered icon
 *   anim-duration  (int)    – animation duration in ms
 *   restore-delay  (int)    – delay before restoring icons in ms
 *
 * The scale of the hovered icon is computed at runtime:
 *   hoveredScale = (iconSize + zoomPixels) / iconSize
 * Neighbour rings each subtract 0.10 from the hovered scale,
 * clamped to a minimum of 1.0.
 */
let _settings = null;

// ─── Main extension class ─────────────────────────────────────────────────────

export default class MagnificLauncher extends Extension {
    enable() {
        _settings = this.getSettings();
        this._controllers = [];
        this._attachToDocks();

        // Re-attach if the shell layout changes (e.g. a dock extension enables later).
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._detachAll();
            this._attachToDocks();
        });
    }

    disable() {
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        this._detachAll();
        _settings = null;
    }

    /** Attempt to attach magnification to every detected dock. */
    _attachToDocks() {
        const docks = _findDashContainers();
        for (const {eventActor, iconsActor} of docks) {
            if (!eventActor || this._controllers.some(c => c.eventActor === eventActor)) continue;
            const ctrl = new DockMagnifier(eventActor, iconsActor);
            ctrl.attach();
            this._controllers.push(ctrl);
        }
    }

    _detachAll() {
        for (const ctrl of this._controllers) {
            ctrl.detach();
        }
        this._controllers = [];
    }
}

// ─── Dock discovery ───────────────────────────────────────────────────────────

/**
 * Returns an array of Clutter.Actor containers whose direct children are
 * the individual app icon actors in the active dock(s).
 *
 * Returns an array of {eventActor, iconsActor} descriptors.
 *
 *   eventActor  — the reactive Clutter.Actor to connect pointer events to.
 *   iconsActor  — the Clutter.Actor whose direct children are the icon buttons.
 *
 * Detection order:
 *  1. Ubuntu Dock  (ubuntu-dock@ubuntu.com)
 *  2. Dash to Dock (dash-to-dock@micxgx.gmail.com)
 *  3. Dash to Panel
 *  4. Default GNOME dash
 *
 * Ubuntu Dock exports `dockManager` as a module-level variable (not on stateObj),
 * so it cannot be reached via the extension manager API. Instead, we walk
 * Main.layoutManager._trackedActors — every DockedDash is registered as chrome.
 *
 * Ubuntu Dock / Dash to Dock internal layout (per monitor):
 *
 *   DockedDash (chrome, St.Widget)
 *    └── _slider (DashSlideContainer)
 *          └── _box  (St.BoxLayout, reactive:true)  ← eventActor
 *                └── dash (DockDash, St.Widget)
 *                      └── _dashContainer → _scrollView → _boxContainer
 *                            └── _box (St.BoxLayout)   ← iconsActor
 */
function _findDashContainers() {
    const results = [];

    // ── Helper shared by Ubuntu Dock and Dash to Dock ─────────────────────────
    // Both use the same DockedDash architecture.
    function _pushFromDockedDashes(docks) {
        for (const dock of docks) {
            // eventActor: DockedDash._box  (reactive: true, track_hover: true)
            const eventActor = dock._box;
            // iconsActor: DockDash._box  (direct parent of icon items)
            const iconsActor = dock.dash?._box;
            if (eventActor && iconsActor) results.push({eventActor, iconsActor});
        }
    }

    // ── 1. Ubuntu Dock ────────────────────────────────────────────────────────
    try {
        const ubuntuDock = Main.extensionManager?.lookup('ubuntu-dock@ubuntu.com');
        if (ubuntuDock?.state === 1 /* ENABLED */) {
            const tracked = Main.layoutManager?._trackedActors ?? [];
            // Each DockedDash is registered as a chrome entry; it has both ._box
            // (reactive outer container) and .dash._box (inner icon list).
            const dockedDashes = tracked
                .map(e => e.actor)
                .filter(a => a?._box && a?.dash?._box);
            _pushFromDockedDashes(dockedDashes);
        }
    } catch (_) { /* extension not present or layout not ready */ }

    // ── 2. Dash to Dock ───────────────────────────────────────────────────────
    if (results.length === 0) {
        try {
            const dtd = Main.extensionManager?.lookup('dash-to-dock@micxgx.gmail.com');
            if (dtd?.state === 1 && dtd.stateObj?.dockManager) {
                const docks = dtd.stateObj.dockManager._allDocks ?? dtd.stateObj.dockManager.docks ?? [];
                _pushFromDockedDashes(docks);
            }
        } catch (_) { /* extension not present */ }
    }

    // ── 3. Dash to Panel ──────────────────────────────────────────────────────
    if (results.length === 0) {
        try {
            const dtp = Main.extensionManager?.lookup('dash-to-panel@jderose9.github.com');
            if (dtp?.state === 1 && dtp.stateObj?.taskbarManager) {
                const panels = dtp.stateObj.taskbarManager._panels ?? [];
                for (const p of panels) {
                    const box = p.taskbar?._box ?? p.taskbar?.actor;
                    if (box) results.push({eventActor: box, iconsActor: box});
                }
            }
        } catch (_) { /* extension not present */ }
    }

    // ── 4. Default GNOME dash ─────────────────────────────────────────────────
    if (results.length === 0) {
        const box = Main.overview?._overview?._controls?.dash?._box;
        if (box) results.push({eventActor: box, iconsActor: box});
    }

    return results;
}

// ─── Per-dock magnifier controller ───────────────────────────────────────────

class DockMagnifier {
    /**
     * @param {Clutter.Actor} eventActor   Reactive actor that receives pointer events.
     * @param {Clutter.Actor} iconsActor   Actor whose direct children are the icon buttons.
     *
     * For Ubuntu Dock / Dash to Dock these are two different actors:
     *   eventActor  = DockedDash._box  (reactive: true)
     *   iconsActor  = DockDash._box    (direct parent of icon items)
     *
     * For other docks they may be the same actor.
     */
    constructor(eventActor, iconsActor) {
        this.eventActor = eventActor;
        this._iconsActor = iconsActor ?? eventActor;

        /** @type {Clutter.Actor[]} Cached list of icon children. */
        this._icons = [];

        /** Index of the currently hovered icon, or -1. */
        this._hoveredIndex = -1;

        /** GLib source id for the restore-delay timeout. */
        this._restoreTimeoutId = null;

        /** Signal connection ids keyed by the actor they were connected on. */
        this._signalIds = [];   // [{actor, id}, …]

        // Watch for the event actor being destroyed so we can self-detach cleanly.
        this._destroyId = this.eventActor.connect('destroy', () => this._onEventActorDestroyed());
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    attach() {
        if (!_isActorAlive(this.eventActor)) return;

        this._refreshIconCache();

        try {
            this._connect(this.eventActor, 'enter-event', this._onEnter.bind(this));
            this._connect(this.eventActor, 'leave-event', this._onLeave.bind(this));
            this._connect(this.eventActor, 'motion-event', this._onMotion.bind(this));
        } catch (e) {
            logError(e, '[MagnificLauncher] Failed to connect pointer events');
            return;
        }

        // Refresh icon cache when children change (e.g. apps are pinned/unpinned).
        for (const sig of ['child-added', 'child-removed']) {
            try {
                this._connect(this._iconsActor, sig, this._refreshIconCache.bind(this));
            } catch (_) {
                // Signal not available on this container — cache stays static.
            }
        }
    }

    /** Helper: connect a signal and store the id for later disconnect. */
    _connect(actor, signal, handler) {
        const id = actor.connect(signal, handler);
        this._signalIds.push({actor, id});
        return id;
    }

    detach() {
        this._cancelRestoreTimeout();

        // Disconnect the destroy watcher first.
        if (this._destroyId !== null) {
            if (_isActorAlive(this.eventActor)) {
                try { this.eventActor.disconnect(this._destroyId); } catch (_) {}
            }
            this._destroyId = null;
        }

        // Restore icons before disconnecting so they don't stay enlarged.
        this._restoreAllImmediate();

        // Disconnect all event signals.
        for (const {actor, id} of this._signalIds) {
            if (_isActorAlive(actor)) {
                try { actor.disconnect(id); } catch (_) {}
            }
        }
        this._signalIds = [];
        this._icons = [];
        this._hoveredIndex = -1;
    }

    /** Called when the event actor is destroyed by the dock itself. */
    _onEventActorDestroyed() {
        this._cancelRestoreTimeout();
        this._destroyId = null;
        this._signalIds = [];
        this._icons = [];
        this._hoveredIndex = -1;
    }

    // ── Icon cache ─────────────────────────────────────────────────────────────

    _refreshIconCache() {
        if (!_isActorAlive(this._iconsActor)) return;
        // Keep only visible children that look like icon buttons.
        this._icons = this._iconsActor.get_children().filter(child => {
            return child.visible && child.get_width() > 0;
        });
    }

    // ── Event handlers ─────────────────────────────────────────────────────────

    _onEnter(_actor, _event) {
        this._cancelRestoreTimeout();
    }

    _onLeave(_actor, _event) {
        // Small delay so quick re-entries do not cause a flash.
        this._scheduleRestore();
    }

    _onMotion(_actor, event) {
        if (this._icons.length === 0) return;

        const [pointerX, pointerY] = event.get_coords();
        const newIndex = this._iconIndexAtPointer(pointerX, pointerY);

        // Only recompute when the hovered icon actually changes.
        if (newIndex === this._hoveredIndex) return;

        this._hoveredIndex = newIndex;

        if (newIndex === -1) {
            this._scheduleRestore();
        } else {
            this._cancelRestoreTimeout();
            this._applyMagnification(newIndex);
        }
    }

    // ── Hit-testing ────────────────────────────────────────────────────────────

    /**
     * Returns the index of the icon whose bounding box contains (x, y) in
     * stage coordinates, or the nearest icon index, or -1 if no icons.
     */
    _iconIndexAtPointer(stageX, stageY) {
        let bestIndex = -1;
        let bestDist = Infinity;

        for (let i = 0; i < this._icons.length; i++) {
            const icon = this._icons[i];
            if (!_isActorAlive(icon) || !icon.visible) continue;

            const [ok, localX, localY] = icon.transform_stage_point(stageX, stageY);
            if (!ok) continue;

            const w = icon.get_width();
            const h = icon.get_height();

            // Exact hit.
            if (localX >= 0 && localX <= w && localY >= 0 && localY <= h) {
                return i;
            }

            // Centre-distance fallback for when the pointer is between icons.
            const cx = w / 2;
            const cy = h / 2;
            const dist = Math.hypot(localX - cx, localY - cy);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        // Only accept the fallback if the pointer is reasonably close.
        const PROXIMITY_PX = 64;
        return bestDist <= PROXIMITY_PX ? bestIndex : -1;
    }

    // ── Scale application ──────────────────────────────────────────────────────

    /**
     * Animates each icon to its target scale based on distance from hoveredIdx.
     *
     * The hovered icon's scale is derived from its actual pixel size:
     *   hoveredScale = (iconSize + zoomPixels) / iconSize
     *
     * Each neighbour ring is 0.10 smaller than the previous, clamped to 1.0.
     *
     * @param {number} hoveredIdx
     */
    _applyMagnification(hoveredIdx) {
        const zoomPx = _settings?.get_int('zoom-pixels') ?? 8;
        const STEP = _settings?.get_double('neighbour-step') ?? 0.10;

        // Derive the target scale from the hovered icon's current pixel width.
        const hoveredIcon = this._icons[hoveredIdx];
        const iconSize = (_isActorAlive(hoveredIcon) && hoveredIcon.get_width() > 0)
            ? hoveredIcon.get_width()
            : 48; // safe fallback
        const hoveredScale = (iconSize + zoomPx) / iconSize;

        for (let i = 0; i < this._icons.length; i++) {
            const distance = Math.abs(i - hoveredIdx);
            // Round to 2 decimal places to avoid floating-point drift.
            const targetScale = distance === 0
                ? hoveredScale
                : Math.max(1.0, Math.round((hoveredScale - distance * STEP) * 100) / 100);
            _animateIconScale(this._icons[i], targetScale, hoveredScale);
        }
    }

    // ── Restore ────────────────────────────────────────────────────────────────

    _scheduleRestore() {
        this._cancelRestoreTimeout();
        const delay = _settings?.get_int('restore-delay') ?? 40;
        this._restoreTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._hoveredIndex = -1;
            this._restoreAll();
            this._restoreTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelRestoreTimeout() {
        if (this._restoreTimeoutId !== null) {
            GLib.source_remove(this._restoreTimeoutId);
            this._restoreTimeoutId = null;
        }
    }

    _restoreAll() {
        for (const icon of this._icons) {
            if (_isActorAlive(icon)) _animateIconScale(icon, 1.0, 1.0);
        }
    }

    _restoreAllImmediate() {
        for (const icon of this._icons) {
            if (!_isActorAlive(icon)) continue;
            try {
                icon.set_scale(1.0, 1.0);
                icon.remove_all_transitions();
            } catch (_) {}
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `actor` is a live GObject that has not been disposed.
 * Accessing any property on a disposed Clutter actor throws
 * "impossible to access it", so we probe a cheap property inside a try/catch.
 *
 * @param {Clutter.Actor|null|undefined} actor
 * @returns {boolean}
 */
function _isActorAlive(actor) {
    if (actor == null) return false;
    try {
        // Probe a cheap read-only property; throws if the GObject is disposed.
        void actor.visible;
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Animates a single icon actor to the given uniform scale using Clutter easing.
 *
 * Anti-distortion measures applied here:
 *  • pivot_point = (0.5, 0.5) — icon grows from its centre, no positional shift.
 *  • magnification_filter — NEAREST for pixel-sharp scaling, LINEAR (default)
 *    for smooth blending. Controlled by the `sharp-scaling` setting.
 *  • offscreen_redirect = NEVER during animation — prevents the double-sampling
 *    artefact that occurs when a cached offscreen texture is upscaled again.
 *
 * @param {Clutter.Actor} actor
 * @param {number}        scale     Target scale value.
 * @param {number}        maxScale  Upper clamp to prevent drift (pass hoveredScale).
 */
function _animateIconScale(actor, scale, maxScale = 4.0) {
    if (!_isActorAlive(actor)) return;

    const duration = _settings?.get_int('anim-duration') ?? 120;
    const clamped = Math.max(1.0, Math.min(maxScale, scale));

    // Skip if already at this scale to avoid redundant transitions.
    if (Math.abs(actor.scale_x - clamped) < 0.001) return;

    try {
        // Scale from the icon's visual centre so it doesn't jump sideways.
        actor.set_pivot_point(0.5, 0.5);

        // Apply the magnification filter on scale-up; restore on scale-down.
        if (clamped > 1.0) {
            const sharp = _settings?.get_boolean('sharp-scaling') ?? false;
            actor.magnification_filter = sharp
                ? Clutter.ScalingFilter.NEAREST
                : Clutter.ScalingFilter.LINEAR;

            // Disable offscreen caching while the icon is enlarged to avoid
            // rendering the pre-scaled texture and then upscaling it again.
            actor.offscreen_redirect = Clutter.OffscreenRedirect.NEVER;
        } else {
            // Restoring to 1.0 — let the dock manage offscreen redirect again.
            actor.offscreen_redirect = Clutter.OffscreenRedirect.AUTOMATIC;
        }

        actor.ease({
            scale_x: clamped,
            scale_y: clamped,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    } catch (_) {}
}

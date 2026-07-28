// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Gilson Fonseca

/**
 * Magnific Launcher — GNOME Shell Extension
 *
 * Adds a macOS-like magnification wave effect to dock icons on hover.
 * Compatible with Ubuntu Dock, Dash to Dock, Dash to Panel, and the default GNOME dash.
 *
 * GNOME Shell 47+
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let _settings = null;

export default class MagnificLauncher extends Extension {
    enable() {
        _settings = this.getSettings();
        this._controllers = [];

        // Delay initial attach to let the overview controls finish initializing.
        // The default GNOME dash is inside the overview and may not be interactive
        // until the overview has been shown at least once.
        this._retryTimeoutIds = [];
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._attachToDocks();
            this._retryTimeoutIds = [];
            return GLib.SOURCE_REMOVE;
        });
        this._retryTimeoutIds.push(id);

        // If the dash was not yet ready, keep retrying.
        const delays = [1500, 3000, 5000, 8000, 12000];
        for (const delay of delays) {
            const tid = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                if (this._controllers.length === 0) this._attachToDocks();
                return GLib.SOURCE_REMOVE;
            });
            this._retryTimeoutIds.push(tid);
        }

        // Re-attach when the overview opens/closes (the dash becomes
        // interactive when the overview shows for the first time).
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._detachAll();
            this._attachToDocks();
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._detachAll();
            this._attachToDocks();
        });
    }

    disable() {
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }
        for (const id of this._retryTimeoutIds ?? []) {
            GLib.source_remove(id);
        }
        this._retryTimeoutIds = [];
        this._detachAll();
        _settings = null;
    }

    _attachToDocks() {
        const docks = _findDashContainers();
        for (const {eventActor, iconsActor, showAppsIcon} of docks) {
            if (!eventActor || this._controllers.some(c => c.eventActor === eventActor)) continue;
            const ctrl = new DockMagnifier(eventActor, iconsActor, showAppsIcon);
            ctrl.attach();
            this._controllers.push(ctrl);
        }
        if (this._controllers.length > 0) {
            log(`[MagnificLauncher] Attached to ${this._controllers.length} dock(s)`);
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
 * Detects all active docks and returns an array of descriptors:
 *   { eventActor, iconsActor, showAppsIcon }
 *
 * Detection order:
 *  1. Ubuntu Dock / Dash to Dock — via _trackedActors (chrome actors)
 *  2. Dash to Dock — via extensionManager.lookup()
 *  3. Dash to Panel — via extensionManager.lookup()
 *  4. Default GNOME dash — via Main.overview._overview._controls.dash
 *
 * Ubuntu Dock / Dash to Dock layout:
 *
 *   DockedDash (chrome, St.Widget)
 *    └── _slider (DashSlideContainer)
 *          └── _box  (St.BoxLayout, reactive:true)  ← eventActor
 *                └── dash (DockDash, St.Widget)
 *                      ├── _dashContainer
 *                      │     ├── _scrollView → _boxContainer
 *                      │     │     └── _box (St.BoxLayout)  ← iconsActor
 *                      │     └── _showAppsIcon
 *                      └── _showAppsIcon
 *
 * Default GNOME dash layout:
 *
 *   Dash (St.Widget, name="dash")
 *     ├── _showAppsIcon (ShowAppsIcon)
 *     ├── _box (St.BoxLayout)  ← iconsActor
 *     └── _background
 */
function _findDashContainers() {
    const results = [];

    function _pushFromDockedDashes(docks) {
        for (const dock of docks) {
            const eventActor = dock._box;
            const iconsActor = dock.dash?._box;
            const showAppsIcon = dock.dash?._showAppsIcon ?? null;
            if (eventActor && iconsActor) results.push({eventActor, iconsActor, showAppsIcon});
        }
    }

    // ── 1. Ubuntu Dock / Dash to Dock — scan chrome actors ────────────────
    try {
        const tracked = Main.layoutManager?._trackedActors ?? [];
        const dockedDashes = tracked
            .map(e => e.actor)
            .filter(a => a?._box && a?.dash?._box);
        _pushFromDockedDashes(dockedDashes);
    } catch (_) { /* layout not ready */ }

    // ── 2. Dash to Dock — extension API ───────────────────────────────────
    if (results.length === 0) {
        try {
            const dtd = Main.extensionManager?.lookup('dash-to-dock@micxgx.gmail.com');
            if (dtd) {
                const docks = dtd.stateObj?.dockManager?._allDocks
                    ?? dtd.stateObj?.dockManager?.docks ?? [];
                _pushFromDockedDashes(docks);
            }
        } catch (_) { /* extension not present */ }
    }

    // ── 3. Dash to Panel ──────────────────────────────────────────────────
    if (results.length === 0) {
        try {
            const dtp = Main.extensionManager?.lookup('dash-to-panel@jderose9.github.com');
            if (dtp) {
                const panels = dtp.stateObj?.taskbarManager?._panels ?? [];
                for (const p of panels) {
                    const box = p.taskbar?._box ?? p.taskbar?.actor;
                    if (box) results.push({eventActor: box, iconsActor: box});
                }
            }
        } catch (_) { /* extension not present */ }
    }

    // ── 4. Default GNOME dash ─────────────────────────────────────────────
    if (results.length === 0) {
        try {
            const dash = Main.overview?._overview?._controls?.dash;
            if (dash) {
                const iconsActor = dash._box ?? dash;
                const showAppsIcon = dash._showAppsIcon ?? null;
                // Use the Dash widget itself as eventActor — it is reactive
                // and receives pointer events both in the overview and on the
                // desktop when shown by extensions like Just Perfection.
                results.push({eventActor: dash, iconsActor, showAppsIcon});
            }
        } catch (_) { /* overview not ready */ }
    }

    return results;
}

// ─── Per-dock magnifier controller ───────────────────────────────────────────

class DockMagnifier {
    /**
     * @param {Clutter.Actor} eventActor   Reactive actor that receives pointer events.
     * @param {Clutter.Actor} iconsActor   Actor whose direct children are the icon buttons.
     * @param {Clutter.Actor|null} showAppsIcon  Show Applications button.
     */
    constructor(eventActor, iconsActor, showAppsIcon = null) {
        this.eventActor = eventActor;
        this._iconsActor = iconsActor ?? eventActor;
        this._showAppsIcon = showAppsIcon;

        this._icons = [];
        this._hoveredIndex = -1;
        this._restoreTimeoutId = null;
        this._signalIds = [];
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    attach() {
        if (!_isActorAlive(this.eventActor)) return;

        this._refreshIconCache();

        try {
            this._connect(this.eventActor, 'destroy', this._onEventActorDestroyed.bind(this));
            this._connect(this.eventActor, 'enter-event', this._onEnter.bind(this));
            this._connect(this.eventActor, 'leave-event', this._onLeave.bind(this));
            this._connect(this.eventActor, 'motion-event', this._onMotion.bind(this));
        } catch (e) {
            logError(e, '[MagnificLauncher] Failed to connect pointer events');
            return;
        }

        for (const sig of ['child-added', 'child-removed']) {
            try {
                this._connect(this._iconsActor, sig, this._refreshIconCache.bind(this));
            } catch (_) {}
        }
    }

    _connect(actor, signal, handler) {
        const id = actor.connect(signal, handler);
        this._signalIds.push({actor, id});
        return id;
    }

    detach() {
        this._cancelRestoreTimeout();
        this._restoreAllImmediate();

        for (const {actor, id} of this._signalIds) {
            if (_isActorAlive(actor)) {
                try { actor.disconnect(id); } catch (_) {}
            }
        }
        this._signalIds = [];
        this._icons = [];
        this._hoveredIndex = -1;
    }

    _onEventActorDestroyed() {
        this._cancelRestoreTimeout();
        this._signalIds = [];
        this._icons = [];
        this._hoveredIndex = -1;
    }

    // ── Icon cache ─────────────────────────────────────────────────────────────

    _refreshIconCache() {
        if (!_isActorAlive(this._iconsActor)) return;
        const MIN_ICON_SIZE = 16;
        this._icons = this._iconsActor.get_children().filter(child => {
            if (!child.visible) return false;
            const w = child.get_width();
            const h = child.get_height();
            if (w < MIN_ICON_SIZE || h < MIN_ICON_SIZE) return false;
            const cls = (child.style_class || '').toLowerCase();
            const name = (child.get_name() || '').toLowerCase();
            if (cls.includes('separator') || cls.includes('spacer') ||
                name.includes('separator') || name.includes('spacer')) {
                return false;
            }
            return true;
        });
    }

    // ── Coordinate helpers ─────────────────────────────────────────────────────

    _getIconCenterInIconsActorSpace(icon) {
        const parent = icon.get_parent();
        if (!parent) return null;
        if (parent === this._iconsActor) {
            const box = icon.get_allocation_box();
            return [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
        }
        const parentBox = parent.get_allocation_box();
        return [(parentBox.x1 + parentBox.x2) / 2, (parentBox.y1 + parentBox.y2) / 2];
    }

    _getShowAppsCenterInIconsActorSpace() {
        if (!this._showAppsIcon || !_isActorAlive(this._showAppsIcon)) return null;
        const [sx, sy] = this._showAppsIcon.get_transformed_position();
        const box = this._showAppsIcon.get_allocation_box();
        const stageCX = sx + (box.x2 - box.x1) / 2;
        const stageCY = sy + (box.y2 - box.y1) / 2;
        const [ok, localX] = this._iconsActor.transform_stage_point(stageCX, stageCY);
        return ok ? localX : null;
    }

    // ── Event handlers ─────────────────────────────────────────────────────────

    _onEnter(_actor, _event) {
        this._cancelRestoreTimeout();
    }

    _onLeave(_actor, _event) {
        this._scheduleRestore();
    }

    _onMotion(_actor, event) {
        if (this._icons.length === 0) return;

        const [pointerX, pointerY] = event.get_coords();
        const newIndex = this._iconIndexAtPointer(pointerX, pointerY);

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

    _iconIndexAtPointer(stageX, stageY) {
        if (this._icons.length === 0 && !this._showAppsIcon) return -1;

        const [ok, actorLocalX, actorLocalY] =
            this._iconsActor.transform_stage_point(stageX, stageY);
        if (!ok) return -1;

        let bestIndex = -1;
        let bestDist = Infinity;

        for (let i = 0; i < this._icons.length; i++) {
            const icon = this._icons[i];
            if (!_isActorAlive(icon) || !icon.visible) continue;

            const center = this._getIconCenterInIconsActorSpace(icon);
            if (!center) continue;

            const dist = Math.hypot(actorLocalX - center[0], actorLocalY - center[1]);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        const showAppsCenterX = this._getShowAppsCenterInIconsActorSpace();
        if (showAppsCenterX !== null) {
            const firstCenter = this._icons.length > 0
                ? this._getIconCenterInIconsActorSpace(this._icons[0])
                : null;
            const showAppsCY = firstCenter ? firstCenter[1] : actorLocalY;
            const dist = Math.hypot(actorLocalX - showAppsCenterX, actorLocalY - showAppsCY);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = this._icons.length;
            }
        }

        const referenceSize = this._getIconNominalSize();
        const PROXIMITY_PX = referenceSize * 0.75;
        return bestDist <= PROXIMITY_PX ? bestIndex : -1;
    }

    _getIconNominalSize() {
        let totalW = 0;
        let count = 0;
        for (const icon of this._icons) {
            if (!_isActorAlive(icon)) continue;
            const box = icon.get_allocation_box();
            const w = box.x2 - box.x1;
            if (w > 0) { totalW += w; count++; }
        }
        return count > 0 ? totalW / count : 48;
    }

    // ── Scale application ──────────────────────────────────────────────────────

    _applyMagnification(hoveredIdx) {
        const zoomPx = _settings?.get_int('zoom-pixels') ?? 8;
        const STEP = _settings?.get_double('neighbour-step') ?? 0.10;

        const iconSize = this._getIconNominalSize();
        const hoveredScale = (iconSize + zoomPx) / iconSize;

        const isShowAppsHovered = hoveredIdx >= this._icons.length;
        let hoveredCenterX;
        if (isShowAppsHovered) {
            hoveredCenterX = this._getShowAppsCenterInIconsActorSpace();
            if (hoveredCenterX === null) return;
        } else {
            const center = this._getIconCenterInIconsActorSpace(this._icons[hoveredIdx]);
            if (!center) return;
            hoveredCenterX = center[0];
        }

        for (let i = 0; i < this._icons.length; i++) {
            const icon = this._icons[i];
            if (!_isActorAlive(icon)) continue;

            const center = this._getIconCenterInIconsActorSpace(icon);
            if (!center) continue;

            const pixelDist = Math.abs(center[0] - hoveredCenterX);
            const ringDist = pixelDist / iconSize;

            const targetScale = i === hoveredIdx
                ? hoveredScale
                : Math.max(1.0, Math.round((hoveredScale - ringDist * STEP) * 100) / 100);
            _animateIconScale(icon, targetScale, hoveredScale);
        }

        if (this._showAppsIcon && _isActorAlive(this._showAppsIcon)) {
            const showAppsCenterX = this._getShowAppsCenterInIconsActorSpace();
            if (showAppsCenterX !== null) {
                const pixelDist = Math.abs(showAppsCenterX - hoveredCenterX);
                const ringDist = pixelDist / iconSize;
                const targetScale = isShowAppsHovered
                    ? hoveredScale
                    : Math.max(1.0, Math.round((hoveredScale - ringDist * STEP) * 100) / 100);
                _animateIconScale(this._showAppsIcon, targetScale, hoveredScale);
            }
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
        if (this._showAppsIcon && _isActorAlive(this._showAppsIcon))
            _animateIconScale(this._showAppsIcon, 1.0, 1.0);
    }

    _restoreAllImmediate() {
        for (const icon of this._icons) {
            if (!_isActorAlive(icon)) continue;
            try {
                icon.set_scale(1.0, 1.0);
                icon.remove_all_transitions();
            } catch (_) {}
        }
        if (this._showAppsIcon && _isActorAlive(this._showAppsIcon)) {
            try {
                this._showAppsIcon.set_scale(1.0, 1.0);
                this._showAppsIcon.remove_all_transitions();
            } catch (_) {}
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _isActorAlive(actor) {
    if (actor == null) return false;
    try {
        void actor.visible;
        return true;
    } catch (_) {
        return false;
    }
}

function _animateIconScale(actor, scale, maxScale = 4.0) {
    if (!_isActorAlive(actor)) return;

    const duration = _settings?.get_int('anim-duration') ?? 120;
    const clamped = Math.max(1.0, Math.min(maxScale, scale));

    if (Math.abs(actor.scale_x - clamped) < 0.001) return;

    try {
        actor.set_pivot_point(0.5, 0.5);

        if (clamped > 1.0) {
            const sharp = _settings?.get_boolean('sharp-scaling') ?? false;
            actor.magnification_filter = sharp
                ? Clutter.ScalingFilter.NEAREST
                : Clutter.ScalingFilter.LINEAR;
            actor.offscreen_redirect = Clutter.OffscreenRedirect.NEVER;
        } else {
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

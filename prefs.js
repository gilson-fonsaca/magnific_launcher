// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Gilson Fonseca

/**
 * Magnific Launcher — Preferences
 *
 * Settings UI for the magnification effect parameters.
 * Requires GNOME Shell 47+ / libadwaita 1.5+.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const BMC_URL    = 'https://www.buymeacoffee.com/Gilsonf';
const GITHUB_URL = 'https://github.com/gilson-fonsaca/magnific_launcher';
const ISSUES_URL = `${GITHUB_URL}/issues`;

export default class MagnificLauncherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(600, 400);

        const page = new Adw.PreferencesPage({
            title: 'Magnific Launcher',
            icon_name: 'view-zoom-fit-symbolic',
        });
        window.add(page);

        // ── Magnification group ──────────────────────────────────────────────
        const magGroup = new Adw.PreferencesGroup({
            title: 'Magnification',
            description: 'Controls the zoom wave effect when the pointer hovers over dock icons.',
        });
        page.add(magGroup);

        // zoom-pixels (int) — pixels added to the hovered icon's size
        const zoomRow = new Adw.SpinRow({
            title: 'Zoom amount (pixels)',
            subtitle: 'Extra pixels added to the hovered icon. ' +
                      'Scale is computed as (iconSize + pixels) / iconSize, ' +
                      'so the growth is the same regardless of icon size. ' +
                      'Neighbour icons reduce by 0.10 per ring automatically.',
            adjustment: new Gtk.Adjustment({
                lower: 2,
                upper: 64,
                step_increment: 1,
                page_increment: 4,
                value: settings.get_int('zoom-pixels'),
            }),
            digits: 0,
        });
        _bindIntRow(settings, 'zoom-pixels', zoomRow);
        magGroup.add(zoomRow);

        // neighbour-step (double) — scale reduction per ring around the hovered icon
        const stepRow = new Adw.SpinRow({
            title: 'Neighbour step',
            subtitle: 'Scale reduction applied to each ring of icons around the hovered icon. ' +
                      '0.00 = all visible icons zoom equally; 0.50 = only immediate neighbours zoom.',
            adjustment: new Gtk.Adjustment({
                lower: 0.0,
                upper: 0.50,
                step_increment: 0.01,
                page_increment: 0.05,
                value: settings.get_double('neighbour-step'),
            }),
            digits: 2,
            snap_to_ticks: false,
        });
        settings.bind(
            'neighbour-step',
            stepRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        magGroup.add(stepRow);

        // sharp-scaling (bool) — nearest-neighbour vs bilinear filter
        const sharpRow = new Adw.SwitchRow({
            title: 'Sharp scaling',
            subtitle: 'Use nearest-neighbour filter instead of bilinear. ' +
                      'Produces crisp pixel edges but may look jagged at non-integer zoom. ' +
                      'Disable for smooth, anti-aliased scaling.',
        });
        settings.bind(
            'sharp-scaling',
            sharpRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        magGroup.add(sharpRow);

        // ── Animation group ──────────────────────────────────────────────────
        const animGroup = new Adw.PreferencesGroup({
            title: 'Animation',
            description: 'Controls timing of the zoom animations.',
        });
        page.add(animGroup);

        // anim-duration (int) — manual bind because SpinRow.value is double
        const animRow = new Adw.SpinRow({
            title: 'Animation duration',
            subtitle: 'Duration of the zoom-in/zoom-out ease animation (milliseconds).',
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 10,
                page_increment: 50,
                value: settings.get_int('anim-duration'),
            }),
            digits: 0,
        });
        _bindIntRow(settings, 'anim-duration', animRow);
        animGroup.add(animRow);

        // restore-delay (int) — manual bind
        const restoreRow = new Adw.SpinRow({
            title: 'Restore delay',
            subtitle: 'Delay before icons return to normal size after the pointer leaves (milliseconds).',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 200,
                step_increment: 5,
                page_increment: 20,
                value: settings.get_int('restore-delay'),
            }),
            digits: 0,
        });
        _bindIntRow(settings, 'restore-delay', restoreRow);
        animGroup.add(restoreRow);

        // ── Support page ─────────────────────────────────────────────────────
        window.add(_buildSupportPage());
    }
}

// ─── Support page ─────────────────────────────────────────────────────────────

/**
 * Builds and returns the "Support" preferences page.
 * Contains a Buy me a Coffee button that opens the donation URL in the
 * system default browser.
 *
 * @returns {Adw.PreferencesPage}
 */
function _buildSupportPage() {
    const page = new Adw.PreferencesPage({
        title: 'Support',
        icon_name: 'emblem-favorite-symbolic',
    });

    const group = new Adw.PreferencesGroup();
    page.add(group);

    // ── Centred card layout ───────────────────────────────────────────────────
    const card = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 20,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        margin_top: 40,
        margin_bottom: 40,
        margin_start: 24,
        margin_end: 24,
    });

    // Coffee emoji label
    const emoji = new Gtk.Label({
        label: '☕',
        css_classes: ['title-1'],
    });
    card.append(emoji);

    // Heading
    const heading = new Gtk.Label({
        label: 'Enjoying Magnific Launcher?',
        css_classes: ['title-2'],
        justify: Gtk.Justification.CENTER,
        wrap: true,
    });
    card.append(heading);

    // Body text
    const body = new Gtk.Label({
        label: 'Magnific Launcher is free and open-source.\n' +
               'If it makes your desktop a little nicer, consider buying me a coffee. ☕',
        justify: Gtk.Justification.CENTER,
        wrap: true,
        max_width_chars: 52,
        css_classes: ['body'],
    });
    card.append(body);

    // Buy me a Coffee button — styled with the brand's yellow colour
    const bmcButton = new Gtk.Button({
        halign: Gtk.Align.CENTER,
        css_classes: ['bmc-button', 'pill'],
    });

    const btnBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        halign: Gtk.Align.CENTER,
    });
    btnBox.append(new Gtk.Label({label: '☕'}));
    btnBox.append(new Gtk.Label({label: 'Buy me a coffee'}));
    bmcButton.set_child(btnBox);

    bmcButton.connect('clicked', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(BMC_URL, null);
        } catch (_) {
            // Fallback: open via xdg-open
            GLib.spawn_command_line_async(`xdg-open ${BMC_URL}`);
        }
    });

    card.append(bmcButton);

    // Link label showing the URL
    const urlLabel = new Gtk.Label({
        label: `<a href="${BMC_URL}">${BMC_URL}</a>`,
        use_markup: true,
        justify: Gtk.Justification.CENTER,
        css_classes: ['caption', 'dim-label'],
    });
    card.append(urlLabel);

    // Wrap the card in an Adw.Clamp so it stays readable on wide windows
    const clamp = new Adw.Clamp({
        maximum_size: 480,
        child: card,
    });
    group.add(clamp);

    // ── Project links group ───────────────────────────────────────────────────
    const linksGroup = new Adw.PreferencesGroup({
        title: 'Project',
    });
    page.add(linksGroup);

    const repoRow = new Adw.ActionRow({
        title: 'Source code',
        subtitle: GITHUB_URL,
        activatable: true,
    });
    repoRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    repoRow.connect('activated', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(GITHUB_URL, null);
        } catch (_) {
            GLib.spawn_command_line_async(`xdg-open ${GITHUB_URL}`);
        }
    });
    linksGroup.add(repoRow);

    const issuesRow = new Adw.ActionRow({
        title: 'Report a bug / request a feature',
        subtitle: ISSUES_URL,
        activatable: true,
    });
    issuesRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    issuesRow.connect('activated', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(ISSUES_URL, null);
        } catch (_) {
            GLib.spawn_command_line_async(`xdg-open ${ISSUES_URL}`);
        }
    });
    linksGroup.add(issuesRow);

    // ── Button CSS ────────────────────────────────────────────────────────────
    const css = new Gtk.CssProvider();
    css.load_from_string(`
        .bmc-button {
            background-color: #FFDD00;
            color: #000000;
            font-weight: bold;
            padding: 10px 24px;
            border: 1px solid rgba(0,0,0,0.15);
        }
        .bmc-button:hover {
            background-color: #f5d400;
        }
        .bmc-button:active {
            background-color: #e8c900;
        }
    `);
    bmcButton.get_style_context().add_provider(
        css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
    );

    return page;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Two-way binding between a GSettings integer key and an Adw.SpinRow.
 * Necessary because Adw.SpinRow.value is gdouble while the key is gint.
 *
 * @param {Gio.Settings} settings
 * @param {string}       key
 * @param {Adw.SpinRow}  row
 */
function _bindIntRow(settings, key, row) {
    // Settings → UI
    const changedId = settings.connect(`changed::${key}`, () => {
        const v = settings.get_int(key);
        if (Math.round(row.value) !== v) row.value = v;
    });

    // UI → Settings
    const notifyId = row.connect('notify::value', () => {
        const v = Math.round(row.value);
        if (settings.get_int(key) !== v) settings.set_int(key, v);
    });

    // Clean up when the row is destroyed (window closed).
    row.connect('destroy', () => {
        settings.disconnect(changedId);
        row.disconnect(notifyId);
    });
}

import { GROUP } from "./constants.js";

/**
 * Build the default HUD layout returned by SystemManager.registerDefaults().
 * Called lazily (inside registerDefaults) so game.i18n is ready.
 */
export function buildDefaults() {
    /**
     * Spread a group and pre-localize its name for a given category.
     * TAH Core uses name as a plain display string — it does NOT call localize().
     */
    function nest(categoryId, group) {
        const localName = game.i18n.localize(group.name);
        return {
            ...group,
            name:     localName,
            nestId:   `${categoryId}_${group.id}`,
            listName: `Group: ${localName}`
        };
    }

    function cat(id, nameKey, groups) {
        return {
            nestId: id,
            id,
            name:   game.i18n.localize(nameKey),
            groups
        };
    }

    return {
        layout: [
            // ── 10 character categories ───────────────────────────────────────
            cat("attacks",     "SWSE.TAH.Categories.Attacks",    [
                nest("attacks",    GROUP.ATTACKS),
                // Attack Mods group is populated dynamically; static definition required by TAH Core
                { id: "attack-mods", type: "system", nestId: "attacks_attack-mods",
                  name: game.i18n.localize("SWSE.TAH.Groups.AttackMods"),
                  listName: `Group: ${game.i18n.localize("SWSE.TAH.Groups.AttackMods")}` },
            ]),
            cat("actions",     "SWSE.TAH.Categories.Actions",    [
                nest("actions",    GROUP.COMBAT_ACTIONS),
            ]),
            cat("inventory",   "SWSE.TAH.Categories.Inventory",  [
                nest("inventory",  GROUP.INVENTORY),
            ]),
            cat("talents",     "SWSE.TAH.Categories.Talents",    [
                nest("talents",    GROUP.TALENTS),
            ]),
            cat("force",       "SWSE.TAH.Categories.ForcePowers", [
                nest("force",      GROUP.FORCE_POWERS),
                nest("force",      GROUP.FORCE_EXTRAS),
            ]),
            cat("feats",       "SWSE.TAH.Categories.Feats",      [
                nest("feats",      GROUP.FEATS),
                nest("feats",      GROUP.TRAITS),
            ]),
            cat("attributes",  "SWSE.TAH.Categories.Attributes", [
                nest("attributes", GROUP.RESOURCES),
                nest("attributes", GROUP.ABILITIES),
                nest("attributes", GROUP.DEFENSES),
            ]),
            cat("skills",      "SWSE.TAH.Categories.Skills",     [
                nest("skills",     GROUP.SKILLS),
            ]),
            cat("effects",     "SWSE.TAH.Categories.Effects",    [
                nest("effects",    GROUP.EFFECTS),
            ]),
            cat("utility",     "SWSE.TAH.Categories.Utility",    [
                nest("utility",    GROUP.UTILITIES),
            ]),

            // ── Vehicle (shown only for vehicle actors) ───────────────────────
            cat("vehicle",     "SWSE.TAH.Categories.Vehicle",    [
                nest("vehicle",    GROUP.VEHICLE_WEAPONS),
                nest("vehicle",    GROUP.VEHICLE_SYSTEMS),
            ]),
        ],

        // Flat group list used by TAH Core's settings UI
        groups: Object.values(GROUP).map(g => ({
            ...g,
            name:   game.i18n.localize(g.name),
            nestId: g.id
        }))
    };
}

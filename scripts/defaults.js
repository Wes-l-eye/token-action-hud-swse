import { GROUP } from "./constants.js";

/**
 * Build the default HUD layout returned by SystemManager.registerDefaults().
 * Called lazily (inside registerDefaults) so game.i18n is ready.
 */
export function buildDefaults() {
    /**
     * Spread a group and pre-localize its name for a given category.
     * TAH Core uses name as a plain display string — it does NOT call localize() itself.
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
            cat("combat",  "SWSE.TAH.Categories.Combat", [
                nest("combat",  GROUP.ATTACKS),
                nest("combat",  GROUP.DEFENSES),
            ]),
            cat("skills",  "SWSE.TAH.Categories.Skills", [
                nest("skills",  GROUP.SKILLS),
            ]),
            cat("powers",  "SWSE.TAH.Categories.Powers", [
                nest("powers",  GROUP.FORCE_POWERS),
                nest("powers",  GROUP.TALENTS),
                nest("powers",  GROUP.FEATS),
                nest("powers",  GROUP.TRAITS),
                nest("powers",  GROUP.FEATURES),
            ]),
            cat("vehicle", "SWSE.TAH.Categories.Vehicle", [
                nest("vehicle", GROUP.VEHICLE_WEAPONS),
                nest("vehicle", GROUP.VEHICLE_SYSTEMS),
            ]),
            cat("utility", "SWSE.TAH.Categories.Utility", [
                nest("utility", GROUP.UTILITIES),
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

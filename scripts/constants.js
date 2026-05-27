export const MODULE = {
    ID: "token-action-hud-swse",
    NAME: "Token Action HUD - SWSE"
};

// TAH Core's isSystemModuleCompatible splits this by "." and compares major+minor
// against the installed TAH Core version. Use "major.minor" format — e.g. "2.0"
// means "requires TAH Core 2.0.x or any 2.0.* patch". Omitting patch is intentional
// so any patch of 2.0 is accepted.
export const REQUIRED_CORE_MODULE_VERSION = "2.0";

// ─── Group definitions ───────────────────────────────────────────────────────
// name values are localization keys resolved by TAH Core at render time.

export const GROUP = {
    ATTACKS:         { id: "attacks",         name: "SWSE.TAH.Groups.Attacks",        type: "system" },
    SKILLS:          { id: "skills",          name: "SWSE.TAH.Groups.Skills",         type: "system" },
    FORCE_POWERS:    { id: "force-powers",    name: "SWSE.TAH.Groups.ForcePowers",    type: "system" },
    TALENTS:         { id: "talents",         name: "SWSE.TAH.Groups.Talents",        type: "system" },
    FEATS:           { id: "feats",           name: "SWSE.TAH.Groups.Feats",          type: "system" },
    TRAITS:          { id: "traits",          name: "SWSE.TAH.Groups.Traits",         type: "system" },
    FEATURES:        { id: "features",        name: "SWSE.TAH.Groups.Features",       type: "system" },
    DEFENSES:        { id: "defenses",        name: "SWSE.TAH.Groups.Defenses",       type: "system" },
    UTILITIES:       { id: "utilities",       name: "SWSE.TAH.Groups.Utilities",      type: "system" },
    VEHICLE_WEAPONS: { id: "vehicle-weapons", name: "SWSE.TAH.Groups.VehicleWeapons", type: "system" },
    VEHICLE_SYSTEMS: { id: "vehicle-systems", name: "SWSE.TAH.Groups.VehicleSystems", type: "system" },
};

// ─── Action type tags stored in action.system ────────────────────────────────

export const ACTION_TYPE = {
    SKILL:    "skill",
    ATTACK:   "attack",
    ITEM:     "item",
    VARIABLE: "variable",
    UTILITY:  "utility",
};

// Defense variables — excluded from the skill roll list
export const DEFENSE_VARIABLES = new Set([
    "@FortDef", "@WillDef", "@RefDef", "@RefFFDef"
]);

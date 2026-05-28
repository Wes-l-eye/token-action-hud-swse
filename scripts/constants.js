export const MODULE = {
    ID: "token-action-hud-swse",
    NAME: "Token Action HUD - SWSE"
};

// TAH Core's isSystemModuleCompatible splits this by "." and compares major+minor.
export const REQUIRED_CORE_MODULE_VERSION = "2.0";

// ─── Group definitions ───────────────────────────────────────────────────────

export const GROUP = {
    // Attacks
    ATTACKS:         { id: "attacks",         name: "SWSE.TAH.Groups.Attacks",        type: "system" },
    // Actions
    COMBAT_ACTIONS:  { id: "combat-actions",  name: "SWSE.TAH.Groups.CombatActions",  type: "system" },
    // Inventory
    INVENTORY:       { id: "inventory",       name: "SWSE.TAH.Groups.Inventory",      type: "system" },
    // Character abilities
    TALENTS:         { id: "talents",         name: "SWSE.TAH.Groups.Talents",        type: "system" },
    FORCE_POWERS:    { id: "force-powers",    name: "SWSE.TAH.Groups.ForcePowers",    type: "system" },
    FORCE_EXTRAS:    { id: "force-extras",    name: "SWSE.TAH.Groups.ForceExtras",    type: "system" },
    FEATS:           { id: "feats",           name: "SWSE.TAH.Groups.Feats",          type: "system" },
    TRAITS:          { id: "traits",          name: "SWSE.TAH.Groups.Traits",         type: "system" },
    // Attributes & skills
    ABILITIES:       { id: "abilities",       name: "SWSE.TAH.Groups.AbilityChecks",  type: "system" },
    DEFENSES:        { id: "defenses",        name: "SWSE.TAH.Groups.Defenses",       type: "system" },
    SKILLS:          { id: "skills",          name: "SWSE.TAH.Groups.Skills",         type: "system" },
    // Character resources (Force / Destiny / Dark Side)
    RESOURCES:       { id: "resources",       name: "SWSE.TAH.Groups.Resources",      type: "system" },
    // Effects & utility
    EFFECTS:         { id: "effects",         name: "SWSE.TAH.Groups.Effects",        type: "system" },
    UTILITIES:       { id: "utilities",       name: "SWSE.TAH.Groups.Utilities",      type: "system" },
    // Vehicle
    VEHICLE_WEAPONS: { id: "vehicle-weapons", name: "SWSE.TAH.Groups.VehicleWeapons", type: "system" },
    VEHICLE_SYSTEMS: { id: "vehicle-systems", name: "SWSE.TAH.Groups.VehicleSystems", type: "system" },
};

// ─── Action type tags ────────────────────────────────────────────────────────

export const ACTION_TYPE = {
    ATTACK:       "attack",
    SKILL:        "skill",
    ITEM:         "item",
    VARIABLE:     "variable",
    UTILITY:      "utility",
    EQUIP_TOGGLE: "equipToggle",   // inventory: toggle equipped state
    EFFECT:       "effect",        // active effects: toggle disabled
    MODE_TOGGLE:  "modeToggle",    // weapon fire mode (Autofire, Burst): toggle on/off
    ATTACK_MOD:   "attackMod",     // pre-attack modifier (Sneak Attack, Power Attack…): prime/clear
};

// Flag key used to store primed attack modifiers on the actor between turns
export const PENDING_MODS_FLAG = "pendingAttackMods";

// Flag key used to track accumulated Recover actions (3 = improve condition one step)
export const RECOVER_FLAG = "recoverCount";

// Keys that makeAttack accepts in its `changes` array
export const ATTACK_CHANGE_KEYS = new Set(["toHitModifier", "damage"]);

// ─── Variable exclusion sets ─────────────────────────────────────────────────

/** Defense totals — shown in the Defenses group, excluded from Skills. */
export const DEFENSE_VARIABLES = new Set([
    "@FortDef", "@WillDef", "@RefDef", "@RefFFDef"
]);

/** Ability-check rolls — shown in Ability Checks group, excluded from Skills.
 *  SWSE registers these via setResolvedVariable with a "1d20 + mod" formula. */
export const ABILITY_ROLL_VARIABLES = new Set([
    "@STRROLL", "@DEXROLL", "@CONROLL", "@INTROLL", "@WISROLL", "@CHAROLL"
]);

/** Human-readable short names in Str→Cha order.
 *  The labels SWSE stores are raw i18n keys (SWSE.AbilityShortDex) that are
 *  never registered in the locale, so we use our own. */
export const ABILITY_ROLL_LABELS = new Map([
    ["@STRROLL", "Str"],
    ["@DEXROLL", "Dex"],
    ["@CONROLL", "Con"],
    ["@INTROLL", "Int"],
    ["@WISROLL", "Wis"],
    ["@CHAROLL", "Cha"],
]);

// ─── Combat maneuver definitions ─────────────────────────────────────────────
// Each entry is posted as a chat card when clicked.

export const COMBAT_MANEUVERS = [
    {
        id:      "totalDefense",
        label:   "SWSE.TAH.Maneuvers.TotalDefense",
        tooltip: "SWSE.TAH.Maneuvers.TotalDefenseTip",
    },
    {
        id:      "fightDefensively",
        label:   "SWSE.TAH.Maneuvers.FightDefensively",
        tooltip: "SWSE.TAH.Maneuvers.FightDefensivelyTip",
    },
    {
        id:      "aidAnother",
        label:   "SWSE.TAH.Maneuvers.AidAnother",
        tooltip: "SWSE.TAH.Maneuvers.AidAnotherTip",
    },
    {
        id:      "charge",
        label:   "SWSE.TAH.Maneuvers.Charge",
        tooltip: "SWSE.TAH.Maneuvers.ChargeTip",
    },
    {
        id:      "withdraw",
        label:   "SWSE.TAH.Maneuvers.Withdraw",
        tooltip: "SWSE.TAH.Maneuvers.WithdrawTip",
    },
    {
        id:      "delay",
        label:   "SWSE.TAH.Maneuvers.Delay",
        tooltip: "SWSE.TAH.Maneuvers.DelayTip",
    },
    {
        id:      "readyAction",
        label:   "SWSE.TAH.Maneuvers.ReadyAction",
        tooltip: "SWSE.TAH.Maneuvers.ReadyActionTip",
    },
];

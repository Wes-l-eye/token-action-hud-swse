import {
    ACTION_TYPE,
    ABILITY_ROLL_LABELS,
    ABILITY_ROLL_VARIABLES,
    ATTACK_CHANGE_KEYS,
    COMBAT_MANEUVERS,
    DEFENSE_VARIABLES,
    GROUP,
    PENDING_MODS_FLAG,
    RECOVER_FLAG,
} from "./constants.js";

/** Strip HTML tags from a string for use in plain-text tooltips. */
function stripHtml(html) {
    return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract a formatted numeric bonus ("+8", "-2", "+0") from a Foundry Roll
 * formula string.  SWSE resolved-variables use the pattern "1d20 + N" where N
 * is a fully-resolved integer (positive, negative, or zero).
 *
 * Edge cases produced by SWSE's own formula builder:
 *   "1d20 + 5"  →  "+5"
 *   "1d20 - 0"  →  "+0"
 *   "1d20 + -2" →  "-2"  (SWSE writes "+–N" for negative non-zero mods)
 */
function extractBonus(formula) {
    if (!formula || typeof formula !== "string") return "";
    try {
        // Remove all dice tokens (e.g. "1d20") leaving only the modifier part
        let expr = formula.replace(/\s*\d*d\d+\s*/gi, " ").trim();
        if (!expr) return "+0";
        // Don't attempt to parse if unresolved variable references remain
        if (/[@a-zA-Z_]/.test(expr)) return "";

        // Normalise double-sign combinations: "+ -" → "-",  "- -" → "+"
        expr = expr.replace(/\+\s*-/g, "-").replace(/-\s*-/g, "+");
        // Tokenise into signed numeric terms and sum them
        let total = 0;
        // If the expression starts with a bare digit (no leading sign), treat as positive
        if (/^\s*\d/.test(expr)) expr = "+" + expr.trim();
        const tokenRe = /([+-])\s*(\d+(?:\.\d+)?)/g;
        let m;
        while ((m = tokenRe.exec(expr)) !== null) {
            total += (m[1] === "+" ? 1 : -1) * parseFloat(m[2]);
        }
        total = Math.round(total);
        return total >= 0 ? `+${total}` : `${total}`;
    } catch { /* ignore parse failures — show name without bonus */ }
    return "";
}

/** extractBonus returning a number (null if formula can't be resolved). */
function extractBonusVal(formula) {
    const s = extractBonus(formula);
    if (!s) return null;
    return parseInt(s, 10);
}

/** Format a numeric bonus for display: 8 → "+8", -2 → "-2". */
function formatBonus(n) {
    if (n == null) return "";
    return n >= 0 ? `+${n}` : `${n}`;
}

// ─── Attack-mode visual helpers ───────────────────────────────────────────────

/**
 * Unicode icon for a known fire mode name.
 * Returns null for modes that should keep the legacy ↳ toggle appearance.
 */
function getModeIcon(modeName) {
    const lower = (modeName ?? "").toLowerCase();
    if (lower.includes("single"))    return "●";   // U+25CF  single shot
    if (lower.includes("autofire"))  return "⋯";   // U+22EF  autofire (3 dots)
    if (lower.includes("burst"))     return "◉";   // U+25C9  burst fire
    if (lower.includes("stun"))      return "◎";   // U+25CE  stun (bullseye)
    return null; // unknown mode → keep as toggle
}

/** Returns true if this mode name is a mutually-exclusive fire-rate mode. */
function isFireRateMode(modeName) {
    const lower = (modeName ?? "").toLowerCase();
    return lower.includes("single") || lower.includes("autofire") || lower.includes("burst");
}

/**
 * Sum the toHitModifier changes an Active Effect contributes.
 * SWSE typically stores these as AE changes with key "toHitModifier".
 */
function getModeToHitAdj(mode) {
    return (mode.changes ?? [])
        .filter(c => (c.key ?? "").toLowerCase().includes("tohitmodifier"))
        .reduce((sum, c) => sum + (Number(c.value) || 0), 0);
}

/**
 * Factory — called inside tokenActionHudCoreApiReady so we can extend
 * coreModule.api.ActionHandler without needing it at import time.
 */
export function createActionHandler(coreModule) {
    return class SWSEActionHandler extends coreModule.api.ActionHandler {

        /**
         * Build all HUD actions for the currently-selected token's actor.
         * Called by TAH Core on every HUD refresh.
         */
        async buildSystemActions(_groupIds) {
            const actor = this.actor;
            if (!actor) return;

            const isChar    = actor.type === "character" || actor.type === "npc";
            const isVehicle = actor.type === "vehicle"   || actor.type === "npc-vehicle";

            if (isChar) {
                await this.#buildAttacks(actor);
                await this.#buildAttackMods(actor);
                await this.#buildCombatActions(actor);
                await this.#buildInventory(actor);
                await this.#buildTalents(actor);
                await this.#buildForcePowers(actor);
                await this.#buildFeats(actor);
                await this.#buildTraits(actor);
                await this.#buildAbilities(actor);
                await this.#buildDefenses(actor);
                await this.#buildResources(actor);
                await this.#buildSkills(actor);
                await this.#buildEffects(actor);
                await this.#buildUtilities(actor);
            } else if (isVehicle) {
                await this.#buildVehicleWeapons(actor);
                await this.#buildVehicleSystems(actor);
                await this.#buildUtilities(actor);
            }
        }

        // ─── Attacks ──────────────────────────────────────────────────────────
        //
        // Each weapon gets its own named sub-group (with its item image).
        // Inside each sub-group:
        //   • Draw / Sheathe  — equip toggle
        //   • ● +N            — single-shot attack (plain click = standard, shift = full)
        //   • ⋯ +N            — autofire attack    (activates Autofire AE first)
        //   • ◉ +N            — burst-fire attack  (activates Burst AE first)
        //   • ◎ +N            — stun attack        (activates Stun Setting AE first)
        //   • ↳ Name          — any other mode kept as a regular toggle

        async #buildAttacks(actor) {
            const attacks = actor.attack?.attacks ?? [];
            if (!attacks.length) return;

            const RANGED_SUBTYPES = [
                "Pistols", "Rifles", "Heavy Weapons", "Exotic Ranged Weapons",
                "Grenades", "Simple Ranged Weapons", "Ranged Natural Weapons"
            ];

            const parentData = { id: GROUP.ATTACKS.id, type: "system" };

            for (let index = 0; index < attacks.length; index++) {
                const atk  = attacks[index];
                const item = atk.item ?? null;

                const rawId         = item?.id ?? `atk${index}`;
                const weaponGroupId = `w_${rawId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
                const weaponName    = atk.name ?? game.i18n.localize("SWSE.TAH.Actions.UnknownWeapon");

                // Sub-group now carries the weapon image so TAH Core can render it
                const weaponGroupData = {
                    id:   weaponGroupId,
                    name: weaponName,
                    type: "system-derived",
                    img:  item?.img ?? ""
                };
                await this.addGroup(weaponGroupData, parentData);

                const weaponActions = [];

                // ── Draw / Sheathe toggle ──────────────────────────────────
                if (item) {
                    const equipped = item.system?.equipped === "equipped" || item.system?.equipped === true;
                    weaponActions.push({
                        id:       `equip_${item.id}`,
                        name:     equipped
                            ? game.i18n.localize("SWSE.TAH.Actions.Sheathe")
                            : game.i18n.localize("SWSE.TAH.Actions.Draw"),
                        listName: equipped ? `${weaponName}: Sheathe` : `${weaponName}: Draw`,
                        cssClass: equipped ? "toggle active" : "toggle",
                        tooltip:  equipped
                            ? game.i18n.format("SWSE.TAH.Actions.SheatheTip", { weapon: weaponName })
                            : game.i18n.format("SWSE.TAH.Actions.DrawTip",    { weapon: weaponName }),
                        system: {
                            actionType: ACTION_TYPE.EQUIP_TOGGLE,
                            itemId:     item.id,
                            actorId:    actor.id,
                            actorUUID:  actor.uuid
                        }
                    });
                }

                // ── Ranged vs melee tag (used in tooltips) ─────────────────
                let rangeTag = "";
                try {
                    const sub = item?.system?.subtype ?? "";
                    if (sub) rangeTag = RANGED_SUBTYPES.some(g => sub.includes(g)) ? " [R]" : " [M]";
                } catch { /* ignore */ }

                // ── Attack-bonus computation ───────────────────────────────
                // atk.attackRoll returns a Foundry Roll built (not evaluated) from the
                // actor's fully-resolved attributes.  We parse the formula to read the
                // total numeric modifier without actually rolling.
                let neutralBonusVal = null; // base bonus with all active-mode adjustments removed
                const modes = atk.modes ?? [];
                try {
                    const formula = atk.attackRoll?.formula;
                    const rawVal  = extractBonusVal(formula ?? "");
                    if (rawVal !== null) {
                        // Subtract the adjustments that currently-active modes are contributing
                        // so we have a "clean" base from which each mode's bonus can be derived.
                        const activeModeAdj = modes
                            .filter(m => !m.disabled)
                            .reduce((sum, m) => sum + getModeToHitAdj(m), 0);
                        neutralBonusVal = rawVal - activeModeAdj;
                    }
                } catch { /* leave null — buttons show icon only */ }

                // ── Categorise modes ───────────────────────────────────────
                // "Single-Shot" (or any mode whose icon is ●) becomes the primary
                // attack button.  Everything else becomes its own attack button or,
                // for unknown modes, keeps the old ↳ toggle style.
                const singleMode = modes.find(m => getModeIcon(m.name) === "●");
                const otherModes = modes.filter(m => m !== singleMode);

                // ── Primary attack button: ● +N ────────────────────────────
                const singleAdj = singleMode ? getModeToHitAdj(singleMode) : 0;
                const singleVal = neutralBonusVal !== null ? neutralBonusVal + singleAdj : null;
                // Active when Single-Shot AE is enabled, or when no other mode is active
                const singleActive = singleMode
                    ? !singleMode.disabled
                    : otherModes.every(m => m.disabled);

                weaponActions.push({
                    id:       `attack_${atk.attackKey}`,
                    name:     `● ${formatBonus(singleVal)}`.trimEnd(),
                    listName: `${weaponName}: Attack`,
                    cssClass: singleActive ? "toggle active" : "",
                    tooltip:  `Single Shot${rangeTag} — ${game.i18n.localize("SWSE.TAH.Tooltips.AttackHint")}`,
                    system: {
                        actionType:    ACTION_TYPE.ATTACK,
                        attackKey:     atk.attackKey,
                        modeToActivate: singleMode?.id ?? null,
                        isFireRateMode: true,
                        actorUUID:     actor.uuid,
                        itemId:        item?.id ?? null
                    }
                });

                // ── Additional mode buttons ────────────────────────────────
                for (const mode of otherModes) {
                    const icon = getModeIcon(mode.name);

                    if (!icon) {
                        // Unknown mode — keep as old ↳ toggle
                        weaponActions.push({
                            id:       `mode_ae_${atk.attackKey}_${mode.id}`,
                            name:     `↳ ${mode.name ?? "Mode"}`,
                            listName: `${weaponName}: ${mode.name}`,
                            cssClass: !mode.disabled ? "toggle active" : "toggle",
                            tooltip:  !mode.disabled
                                ? game.i18n.format("SWSE.TAH.Modes.ActiveTip",   { mode: mode.name })
                                : game.i18n.format("SWSE.TAH.Modes.InactiveTip", { mode: mode.name }),
                            system: {
                                actionType: ACTION_TYPE.MODE_TOGGLE,
                                modeSource: "effect",
                                effectId:   mode.id,
                                itemId:     item?.id,
                                actorId:    actor.id,
                                actorUUID:  actor.uuid
                            }
                        });
                        continue;
                    }

                    const modeAdj = getModeToHitAdj(mode);
                    const modeVal = neutralBonusVal !== null ? neutralBonusVal + modeAdj : null;
                    const isFire  = isFireRateMode(mode.name);

                    weaponActions.push({
                        id:       `attack_mode_${atk.attackKey}_${mode.id}`,
                        name:     `${icon} ${formatBonus(modeVal)}`.trimEnd(),
                        listName: `${weaponName}: ${mode.name}`,
                        cssClass: !mode.disabled ? "toggle active" : "",
                        tooltip:  `${mode.name}${rangeTag} — ${game.i18n.localize("SWSE.TAH.Tooltips.AttackHint")}`,
                        system: {
                            actionType:    ACTION_TYPE.ATTACK,
                            attackKey:     atk.attackKey,
                            modeToActivate: mode.id,
                            isFireRateMode: isFire,
                            actorUUID:     actor.uuid,
                            itemId:        item?.id ?? null
                        }
                    });
                }

                // ── Legacy system.modes (only when no AE modes exist) ──────
                const legacyModes = Object.entries(item?.system?.modes ?? {});
                if (legacyModes.length && !modes.length) {
                    for (const [modeKey, modeData] of legacyModes) {
                        if (!modeData?.name) continue;
                        const icon     = getModeIcon(modeData.name);
                        const isActive = !!modeData.isActive;
                        const isFire   = isFireRateMode(modeData.name);

                        if (!icon) {
                            weaponActions.push({
                                id:       `mode_sys_${atk.attackKey}_${modeKey}`,
                                name:     `↳ ${modeData.name}`,
                                listName: `${weaponName}: ${modeData.name}`,
                                cssClass: isActive ? "toggle active" : "toggle",
                                tooltip:  isActive
                                    ? game.i18n.format("SWSE.TAH.Modes.ActiveTip",   { mode: modeData.name })
                                    : game.i18n.format("SWSE.TAH.Modes.InactiveTip", { mode: modeData.name }),
                                system: {
                                    actionType: ACTION_TYPE.MODE_TOGGLE,
                                    modeSource: "system",
                                    modeKey,
                                    itemId:     item?.id,
                                    actorId:    actor.id,
                                    actorUUID:  actor.uuid
                                }
                            });
                            continue;
                        }

                        // Known icon — legacy mode button (no bonus computable without AE data)
                        weaponActions.push({
                            id:       `attack_sysmode_${atk.attackKey}_${modeKey}`,
                            name:     icon,
                            listName: `${weaponName}: ${modeData.name}`,
                            cssClass: isActive ? "toggle active" : "",
                            tooltip:  `${modeData.name}${rangeTag} — ${game.i18n.localize("SWSE.TAH.Tooltips.AttackHint")}`,
                            system: {
                                actionType:    ACTION_TYPE.ATTACK,
                                attackKey:     atk.attackKey,
                                legacyModeKey: modeKey,
                                isFireRateMode: isFire,
                                actorUUID:     actor.uuid,
                                itemId:        item?.id ?? null
                            }
                        });
                    }
                }

                await this.addActions(weaponActions, weaponGroupData);
            }
        }

        // ─── Pre-attack modifiers (Sneak Attack, Power Attack…) ──────────────
        // Scans the actor's talents and feats for items whose `changes` include
        // keys that makeAttack accepts (toHitModifier, damage).  Each such item
        // appears as a toggle in the Attacks group.  Primed modifiers are stored
        // in actor flags and included in the next attack roll, then auto-cleared.

        async #buildAttackMods(actor) {
            // Read currently primed mods from actor flags
            const primed = actor.getFlag("token-action-hud-swse", PENDING_MODS_FLAG) ?? {};

            const modSources = [
                ...(actor.itemTypes?.talent ?? []),
                ...(actor.itemTypes?.feat   ?? []),
            ];

            const actions = [];

            for (const item of modSources) {
                // item.changes is a getter returning item.system.changes in SWSE
                const attackChanges = (item.changes ?? [])
                    .filter(c => ATTACK_CHANGE_KEYS.has(c.key));
                if (!attackChanges.length) continue;

                const isActive = !!primed[item.id];
                const changeSummary = attackChanges
                    .map(c => `${c.key === "toHitModifier" ? "Hit" : "Dmg"}: ${c.value}`)
                    .join(", ");

                actions.push({
                    id:       `attackmod_${item.id}`,
                    name:     item.name,
                    img:      item.img,
                    listName: item.name,
                    cssClass: isActive ? "toggle active" : "toggle",
                    tooltip:  isActive
                        ? game.i18n.format("SWSE.TAH.AttackMods.PrimedTip",   { summary: changeSummary })
                        : game.i18n.format("SWSE.TAH.AttackMods.UnprimedTip", { summary: changeSummary }),
                    system: {
                        actionType:    ACTION_TYPE.ATTACK_MOD,
                        itemId:        item.id,
                        attackChanges: JSON.stringify(attackChanges),
                        actorId:       actor.id,
                        actorUUID:     actor.uuid
                    }
                });
            }

            if (!actions.length) return;

            // Show as a sub-group inside the Attacks category
            await this.addActions(actions, {
                id:     "attack-mods",
                type:   "system",
                nestId: `attacks_attack-mods`
            });
        }

        // ─── Combat Actions ───────────────────────────────────────────────────

        async #buildCombatActions(actor) {
            const actions = COMBAT_MANEUVERS.map(m => ({
                id:       `maneuver_${m.id}`,
                name:     game.i18n.localize(m.label),
                listName: game.i18n.localize(m.label),
                tooltip:  game.i18n.localize(m.tooltip),
                system: {
                    actionType:  ACTION_TYPE.UTILITY,
                    utilityType: m.id,
                    actorId:     actor.id,
                    actorUUID:   actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.COMBAT_ACTIONS.id,
                type:   "system",
                nestId: `actions_${GROUP.COMBAT_ACTIONS.id}`
            });
        }

        // ─── Inventory ────────────────────────────────────────────────────────

        async #buildInventory(actor) {
            // Weapons that appear in the Attacks section are equipped/unequipped from there;
            // exclude them here so they don't show up twice.
            const attackItemIds = new Set(
                (actor.attack?.attacks ?? []).map(a => a.item?.id).filter(Boolean)
            );
            const items = (actor.inventoryItems ?? []).filter(item => !attackItemIds.has(item.id));
            if (!items.length) return;

            const actions = items.map(item => {
                // Use the same condition as the roll handler so the visual state is always consistent
                const equipped = item.system?.equipped === "equipped" || item.system?.equipped === true;
                return {
                    id:       `inv_${item.id}`,
                    name:     item.name,
                    img:      item.img,
                    listName: item.name,
                    // toggle class enables TAH's hover styling; active lights the button when equipped
                    cssClass: equipped ? "toggle active" : "toggle",
                    tooltip:  `${item.type.charAt(0).toUpperCase() + item.type.slice(1)}${equipped ? " (Equipped)" : ""}`,
                    system: {
                        actionType: ACTION_TYPE.EQUIP_TOGGLE,
                        itemId:     item.id,
                        actorId:    actor.id,
                        actorUUID:  actor.uuid
                    }
                };
            });

            // Sort: equipped first, then alphabetical
            actions.sort((a, b) => {
                const aEq = a.cssClass?.includes("active") ? 0 : 1;
                const bEq = b.cssClass?.includes("active") ? 0 : 1;
                if (aEq !== bEq) return aEq - bEq;
                return a.name.localeCompare(b.name);
            });

            await this.addActions(actions, {
                id:     GROUP.INVENTORY.id,
                type:   "system",
                nestId: `inventory_${GROUP.INVENTORY.id}`
            });
        }

        // ─── Talents ──────────────────────────────────────────────────────────

        async #buildTalents(actor) {
            const talents = actor.itemTypes?.talent ?? [];
            if (!talents.length) return;

            const actions = talents.map(item => ({
                id:       `talent_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.TALENTS.id,
                type:   "system",
                nestId: `talents_${GROUP.TALENTS.id}`
            });
        }

        // ─── Force Powers (+ Techniques, Secrets, Regimen) ───────────────────

        async #buildForcePowers(actor) {
            const powers = actor.itemTypes?.forcePower ?? [];
            if (!powers.length) return;

            const actions = powers.map(item => ({
                id:       `forcePower_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.FORCE_POWERS.id,
                type:   "system",
                nestId: `force_${GROUP.FORCE_POWERS.id}`
            });

            // Techniques, Secrets, and Regimen grouped under Force Extras
            const EXTRA_TYPES = ["forceTechnique", "forceSecret", "forceRegimen"];
            const extras = EXTRA_TYPES.flatMap(t => actor.itemTypes?.[t] ?? []);
            if (!extras.length) return;

            const extraActions = extras.map(item => ({
                id:       `forceExtra_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(extraActions, {
                id:     GROUP.FORCE_EXTRAS.id,
                type:   "system",
                nestId: `force_${GROUP.FORCE_EXTRAS.id}`
            });
        }

        // ─── Feats ────────────────────────────────────────────────────────────

        async #buildFeats(actor) {
            const feats = actor.itemTypes?.feat ?? [];
            if (!feats.length) return;

            const actions = feats.map(item => ({
                id:       `feat_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.FEATS.id,
                type:   "system",
                nestId: `feats_${GROUP.FEATS.id}`
            });
        }

        // ─── Traits ───────────────────────────────────────────────────────────

        async #buildTraits(actor) {
            const traits = actor.itemTypes?.trait ?? [];
            if (!traits.length) return;

            const actions = traits.map(item => ({
                id:       `trait_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.TRAITS.id,
                type:   "system",
                nestId: `feats_${GROUP.TRAITS.id}`
            });
        }

        // ─── Ability Checks ───────────────────────────────────────────────────

        async #buildAbilities(actor) {
            const variables = actor.resolvedVariables;
            if (!variables?.size) return;

            const actions = [];
            for (const [key, shortName] of ABILITY_ROLL_LABELS.entries()) {
                if (!variables.has(key)) continue;
                const bonus = extractBonus(variables.get(key));
                actions.push({
                    id:       `ability_${key}`,
                    name:     `${shortName} ${bonus}`.trimEnd(),
                    listName: `${shortName} Check`,
                    system: {
                        actionType: ACTION_TYPE.SKILL,
                        variable:   key,
                        actorId:    actor.id,
                        actorUUID:  actor.uuid
                    }
                });
            }

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.ABILITIES.id,
                type:   "system",
                nestId: `attributes_${GROUP.ABILITIES.id}`
            });
        }

        // ─── Defenses ─────────────────────────────────────────────────────────

        async #buildDefenses(actor) {
            const variables = actor.resolvedVariables;
            const labels    = actor.resolvedLabels;
            if (!variables?.size) return;

            const defs = [
                { key: "@FortDef",  fallback: "Fort Def"       },
                { key: "@WillDef",  fallback: "Will Def"       },
                { key: "@RefDef",   fallback: "Ref Def"        },
                { key: "@RefFFDef", fallback: "Flat-Foot Ref"  },
            ];

            const actions = defs
                .filter(d => variables.has(d.key))
                .map(d => {
                    const label = game.i18n.localize(labels?.get(d.key) ?? d.fallback) || d.fallback;
                    const value = variables.get(d.key);
                    return {
                        id:       `defense_${d.key}`,
                        name:     `${label}: ${value}`,
                        listName: label,
                        // Defenses are totals, not roll targets — click posts a chat card
                        system: {
                            actionType:  ACTION_TYPE.UTILITY,
                            utilityType: "defenseCard",
                            defenseLabel: label,
                            defenseValue: value,
                            actorId:      actor.id,
                            actorUUID:    actor.uuid
                        }
                    };
                });

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.DEFENSES.id,
                type:   "system",
                nestId: `attributes_${GROUP.DEFENSES.id}`
            });
        }

        // ─── Character Resources (Force / Destiny / Dark Side) ───────────────
        // Each button shows the current value; left-click = spend/reduce, right-click = gain/increase.
        // Dark Side follows the same convention (right-click = higher score).

        async #buildResources(actor) {
            const actions = [];

            // ── Force Points ───────────────────────────────────────────────────
            // The SWSE getter mutates system.forcePoints to an object; read quantity safely.
            const rawFP = actor.system?.forcePoints;
            const fpQty = typeof rawFP === "number" ? rawFP : (rawFP?.quantity ?? null);
            if (fpQty !== null) {
                actions.push({
                    id:       "resource_forcePoints",
                    name:     `Force Pts: ${fpQty}`,
                    listName: "Force Points",
                    tooltip:  `Force Points: ${fpQty} — left-click: spend (−1), right-click: gain (+1)`,
                    system: {
                        actionType:   ACTION_TYPE.UTILITY,
                        utilityType:  "resource",
                        resourcePath: "system.forcePoints",
                        resourceMin:  0,
                        actorId:      actor.id,
                        actorUUID:    actor.uuid
                    }
                });
            }

            // ── Destiny Points ─────────────────────────────────────────────────
            const dp = actor.system?.destinyPoints ?? null;
            if (dp !== null) {
                actions.push({
                    id:       "resource_destinyPoints",
                    name:     `Destiny Pts: ${dp}`,
                    listName: "Destiny Points",
                    tooltip:  `Destiny Points: ${dp} — left-click: spend (−1), right-click: gain (+1)`,
                    system: {
                        actionType:   ACTION_TYPE.UTILITY,
                        utilityType:  "resource",
                        resourcePath: "system.destinyPoints",
                        resourceMin:  0,
                        actorId:      actor.id,
                        actorUUID:    actor.uuid
                    }
                });
            }

            // ── Dark Side Score ────────────────────────────────────────────────
            // SWSE has had multiple storage paths across versions; try all three.
            const dss = actor.system?.darkSide?.value
                     ?? actor.system?.darkside?.value
                     ?? actor.system?.darkSideScore
                     ?? null;
            if (dss !== null) {
                // Detect which path is actually populated so updates land in the right place
                let darkSidePath = "system.darkSide.value";
                if (actor.system?.darkSideScore !== undefined && actor.system.darkSideScore !== null) {
                    darkSidePath = "system.darkSideScore";
                } else if (actor.system?.darkside?.value !== undefined) {
                    darkSidePath = "system.darkside.value";
                }
                actions.push({
                    id:       "resource_darkSide",
                    name:     `Dark Side: ${dss}`,
                    listName: "Dark Side Score",
                    tooltip:  `Dark Side Score: ${dss} — left-click: spend (−1), right-click: gain (+1)`,
                    system: {
                        actionType:   ACTION_TYPE.UTILITY,
                        utilityType:  "resource",
                        resourcePath: darkSidePath,
                        resourceMin:  0,
                        actorId:      actor.id,
                        actorUUID:    actor.uuid
                    }
                });
            }

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.RESOURCES.id,
                type:   "system",
                nestId: `attributes_${GROUP.RESOURCES.id}`
            });
        }

        // ─── Skills ───────────────────────────────────────────────────────────

        async #buildSkills(actor) {
            const variables = actor.resolvedVariables;
            const labels    = actor.resolvedLabels;
            if (!variables?.size) return;

            const actions = [];
            for (const [key, formula] of variables.entries()) {
                if (!key.startsWith("@"))                                     continue;
                if (DEFENSE_VARIABLES.has(key))                               continue;
                if (ABILITY_ROLL_VARIABLES.has(key))                          continue;
                if (typeof formula !== "string" || !formula.includes("d20"))  continue;

                // Labels from resolvedLabels may be raw i18n keys — try to resolve them
                const rawLabel = labels?.get(key) ?? key.replace("@", "");
                const label    = game.i18n.localize(rawLabel);
                const bonus    = extractBonus(formula);
                actions.push({
                    id:       `skill_${key}`,
                    name:     `${label} ${bonus}`.trimEnd(),
                    listName: label,
                    system: {
                        actionType: ACTION_TYPE.SKILL,
                        variable:   key,
                        actorId:    actor.id,
                        actorUUID:  actor.uuid
                    }
                });
            }

            // Initiative first, then alphabetical
            actions.sort((a, b) => {
                if (a.system.variable === "@Initiative") return -1;
                if (b.system.variable === "@Initiative") return  1;
                return a.name.localeCompare(b.name);
            });

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.SKILLS.id,
                type:   "system",
                nestId: `skills_${GROUP.SKILLS.id}`
            });
        }

        // ─── Effects ──────────────────────────────────────────────────────────

        async #buildEffects(actor) {
            const effects = [...(actor.effects ?? [])];
            if (!effects.length) return;

            const actions = effects.map(effect => ({
                id:       `effect_${effect.id}`,
                name:     effect.name ?? "Effect",
                img:      effect.img  ?? "icons/svg/aura.svg",   // img is correct in v13+; icon was deprecated in v12
                listName: effect.name ?? "Effect",
                // toggle class enables TAH's hover styling; active lights the button up
                cssClass: effect.disabled ? "toggle" : "toggle active",
                tooltip:  effect.disabled
                    ? game.i18n.localize("SWSE.TAH.Effects.Disabled")
                    : game.i18n.localize("SWSE.TAH.Effects.Active"),
                system: {
                    actionType: ACTION_TYPE.EFFECT,
                    effectId:   effect.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            // Active effects first, then alphabetical
            actions.sort((a, b) => {
                const aA = a.cssClass?.includes("active") ? 0 : 1;
                const bA = b.cssClass?.includes("active") ? 0 : 1;
                if (aA !== bA) return aA - bA;
                return a.name.localeCompare(b.name);
            });

            await this.addActions(actions, {
                id:     GROUP.EFFECTS.id,
                type:   "system",
                nestId: `effects_${GROUP.EFFECTS.id}`
            });
        }

        // ─── Utilities ────────────────────────────────────────────────────────

        async #buildUtilities(actor) {
            const actions = [];

            // Initiative
            if (game.combat) {
                actions.push({
                    id:       "utility_initiative",
                    name:     game.i18n.localize("SWSE.TAH.Actions.RollInitiative"),
                    listName: game.i18n.localize("SWSE.TAH.Actions.RollInitiative"),
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "initiative",
                        actorId:     actor.id,
                        actorUUID:   actor.uuid
                    }
                });
            }

            // Second Wind
            const swTotal = actor.system?.secondWinds ?? 0;
            if (swTotal > 0) {
                const toggles   = actor.system?.toggles?.secondWinds ?? {};
                const used      = Object.values(toggles).filter(Boolean).length;
                const remaining = swTotal - used;
                actions.push({
                    id:       "utility_secondWind",
                    name:     `${game.i18n.localize("SWSE.TAH.Actions.SecondWind")} (${remaining}/${swTotal})`,
                    listName: game.i18n.localize("SWSE.TAH.Actions.SecondWind"),
                    tooltip:  game.i18n.localize("SWSE.TAH.Actions.SecondWindTooltip"),
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "secondWind",
                        actorId:     actor.id,
                        actorUUID:   actor.uuid
                    }
                });
            }

            // 8-Hour Rest
            actions.push({
                id:       "utility_eightHourRest",
                name:     game.i18n.localize("SWSE.TAH.Actions.EightHourRest"),
                listName: game.i18n.localize("SWSE.TAH.Actions.EightHourRest"),
                tooltip:  game.i18n.localize("SWSE.TAH.Actions.EightHourRestTooltip"),
                system: {
                    actionType:  ACTION_TYPE.UTILITY,
                    utilityType: "eightHourRest",
                    actorId:     actor.id,
                    actorUUID:   actor.uuid
                }
            });

            // Condition Track — left-click worsen, right-click improve
            {
                const CONDITION_LABELS = {
                    "0": "Normal", "-1": "Weakened", "-2": "Impaired",
                    "-5": "Injured", "-10": "Wounded", "OUT": "Defeated"
                };
                const cond      = `${actor.condition ?? 0}`;
                const condLabel = CONDITION_LABELS[cond] ?? cond;
                actions.push({
                    id:       "utility_condition",
                    name:     `Condition: ${condLabel}`,
                    listName: "Condition Track",
                    tooltip:  `Current: ${condLabel} — left-click: worsen, right-click: improve`,
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "condition",
                        actorId:     actor.id,
                        actorUUID:   actor.uuid
                    }
                });
            }

            // Recover — accumulate 3 clicks to improve condition by one step
            {
                const recoverCount = actor.getFlag("token-action-hud-swse", RECOVER_FLAG) ?? 0;
                actions.push({
                    id:       "utility_recover",
                    name:     `${game.i18n.localize("SWSE.TAH.Actions.Recover")} (${recoverCount}/3)`,
                    listName: game.i18n.localize("SWSE.TAH.Actions.Recover"),
                    tooltip:  game.i18n.localize("SWSE.TAH.Actions.RecoverTooltip"),
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "recover",
                        actorId:     actor.id,
                        actorUUID:   actor.uuid
                    }
                });
            }

            // Token visibility (GM only)
            if (game.user.isGM && this.token) {
                const hidden = this.token.document.hidden;
                actions.push({
                    id:       "utility_visibility",
                    name:     hidden
                        ? game.i18n.localize("SWSE.TAH.Actions.MakeVisible")
                        : game.i18n.localize("SWSE.TAH.Actions.MakeHidden"),
                    listName: game.i18n.localize("SWSE.TAH.Actions.ToggleVisibility"),
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "visibility",
                        tokenUUID:   this.token.document.uuid
                    }
                });
            }

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.UTILITIES.id,
                type:   "system",
                nestId: `utility_${GROUP.UTILITIES.id}`
            });
        }

        // ─── Vehicle Weapons ──────────────────────────────────────────────────

        async #buildVehicleWeapons(actor) {
            const attacks = actor.attack?.attacks ?? [];
            if (!attacks.length) return;

            const actions = attacks.map(atk => ({
                id:       `vatk_${atk.attackKey}`,
                name:     atk.name ?? "Unknown Weapon",
                listName: atk.name ?? "Unknown Weapon",
                system: {
                    actionType: ACTION_TYPE.ATTACK,
                    attackKey:  atk.attackKey,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.VEHICLE_WEAPONS.id,
                type:   "system",
                nestId: `vehicle_${GROUP.VEHICLE_WEAPONS.id}`
            });
        }

        // ─── Vehicle Systems ──────────────────────────────────────────────────

        async #buildVehicleSystems(actor) {
            const systems = actor.itemTypes?.vehicleSystem ?? [];
            if (!systems.length) return;

            const actions = systems.map(item => ({
                id:       `vsys_${item.id}`,
                name:     item.name,
                img:      item.img,
                listName: item.name,
                tooltip:  stripHtml(item.system?.description).slice(0, 400) || undefined,
                system: {
                    actionType: ACTION_TYPE.ITEM,
                    itemId:     item.id,
                    actorId:    actor.id,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.VEHICLE_SYSTEMS.id,
                type:   "system",
                nestId: `vehicle_${GROUP.VEHICLE_SYSTEMS.id}`
            });
        }
    };
}

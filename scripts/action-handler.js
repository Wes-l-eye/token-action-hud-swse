import { ACTION_TYPE, DEFENSE_VARIABLES, GROUP } from "./constants.js";

/** Strip HTML tags from a string for use in plain-text tooltips. */
function stripHtml(html) {
    return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Factory — called inside the tokenActionHudCoreApiReady hook so that we can
 * extend coreModule.api.ActionHandler without needing it at import time.
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
                await this.#buildSkills(actor);
                await this.#buildForcePowers(actor);
                await this.#buildTalents(actor);
                await this.#buildFeats(actor);
                await this.#buildTraits(actor);
                await this.#buildDefenses(actor);
                await this.#buildUtilities(actor);
            } else if (isVehicle) {
                await this.#buildVehicleWeapons(actor);
                await this.#buildVehicleSystems(actor);
                await this.#buildUtilities(actor);
            }
        }

        // ─── Attacks ──────────────────────────────────────────────────────────

        async #buildAttacks(actor) {
            const attacks = actor.attack?.attacks ?? [];
            if (!attacks.length) return;

            const actions = attacks.map(atk => ({
                id:       `attack_${atk.attackKey}`,
                name:     atk.name ?? "Unknown Weapon",
                listName: atk.name ?? "Unknown Weapon",
                system: {
                    actionType: ACTION_TYPE.ATTACK,
                    attackKey:  atk.attackKey,
                    actorUUID:  actor.uuid
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.ATTACKS.id,
                type:   "system",
                nestId: `combat_${GROUP.ATTACKS.id}`
            });
        }

        // ─── Skills ───────────────────────────────────────────────────────────

        async #buildSkills(actor) {
            const variables = actor.resolvedVariables;
            const labels    = actor.resolvedLabels;
            if (!variables?.size) return;

            const actions = [];
            for (const [key, formula] of variables.entries()) {
                if (!key.startsWith("@"))                                   continue;
                if (DEFENSE_VARIABLES.has(key))                             continue;
                if (typeof formula !== "string" || !formula.includes("d20")) continue;

                const label = labels?.get(key) ?? key.replace("@", "");
                actions.push({
                    id:       `skill_${key}`,
                    name:     label,
                    listName: label,
                    system: {
                        actionType: ACTION_TYPE.SKILL,
                        variable:   key,
                        actorId:    actor.id
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

        // ─── Force Powers ─────────────────────────────────────────────────────

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
                    actorId:    actor.id
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.FORCE_POWERS.id,
                type:   "system",
                nestId: `powers_${GROUP.FORCE_POWERS.id}`
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
                    actorId:    actor.id
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.TALENTS.id,
                type:   "system",
                nestId: `powers_${GROUP.TALENTS.id}`
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
                    actorId:    actor.id
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.FEATS.id,
                type:   "system",
                nestId: `powers_${GROUP.FEATS.id}`
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
                    actorId:    actor.id
                }
            }));

            await this.addActions(actions, {
                id:     GROUP.TRAITS.id,
                type:   "system",
                nestId: `powers_${GROUP.TRAITS.id}`
            });
        }

        // ─── Defenses ─────────────────────────────────────────────────────────

        async #buildDefenses(actor) {
            const variables = actor.resolvedVariables;
            const labels    = actor.resolvedLabels;
            if (!variables?.size) return;

            const defs = [
                { key: "@FortDef",  fallback: "Fort Def" },
                { key: "@WillDef",  fallback: "Will Def" },
                { key: "@RefDef",   fallback: "Ref Def"  },
                { key: "@RefFFDef", fallback: "Flat-Foot Ref" },
            ];

            const actions = defs
                .filter(d => variables.has(d.key))
                .map(d => {
                    const label = labels?.get(d.key) ?? d.fallback;
                    const value = variables.get(d.key);
                    return {
                        id:       `defense_${d.key}`,
                        name:     `${label}: ${value}`,
                        listName: label,
                        system: {
                            actionType: ACTION_TYPE.VARIABLE,
                            variable:   d.key,
                            actorId:    actor.id
                        }
                    };
                });

            if (!actions.length) return;
            await this.addActions(actions, {
                id:     GROUP.DEFENSES.id,
                type:   "system",
                nestId: `combat_${GROUP.DEFENSES.id}`
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

            // Second Wind — only for characters with at least one per day
            const swTotal = actor.system?.secondWinds ?? 0;
            if (swTotal > 0) {
                const toggles  = actor.system?.toggles?.secondWinds ?? {};
                const used      = Object.values(toggles).filter(Boolean).length;
                const remaining = swTotal - used;
                actions.push({
                    id:       "utility_secondWind",
                    name:     `${game.i18n.localize("SWSE.TAH.Actions.SecondWind")} (${remaining}/${swTotal})`,
                    listName: game.i18n.localize("SWSE.TAH.Actions.SecondWind"),
                    cssClass: remaining > 0 ? "" : "inactive",
                    tooltip:  game.i18n.localize("SWSE.TAH.Actions.SecondWindTooltip"),
                    system: {
                        actionType:  ACTION_TYPE.UTILITY,
                        utilityType: "secondWind",
                        actorId:     actor.id
                    }
                });
            }

            // 8-Hour Rest — always available
            actions.push({
                id:       "utility_eightHourRest",
                name:     game.i18n.localize("SWSE.TAH.Actions.EightHourRest"),
                listName: game.i18n.localize("SWSE.TAH.Actions.EightHourRest"),
                tooltip:  game.i18n.localize("SWSE.TAH.Actions.EightHourRestTooltip"),
                system: {
                    actionType:  ACTION_TYPE.UTILITY,
                    utilityType: "eightHourRest",
                    actorId:     actor.id
                }
            });

            // Token visibility toggle (GM only)
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
                    actorId:    actor.id
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

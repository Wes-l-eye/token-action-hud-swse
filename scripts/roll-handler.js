import { ACTION_TYPE, PENDING_MODS_FLAG, RECOVER_FLAG } from "./constants.js";

const MODULE_ID = "token-action-hud-swse";

/**
 * Resolve an actor from either a UUID (preferred, supports synthetic/unlinked tokens)
 * or a plain actor ID (fallback for linked tokens).
 */
function resolveActor(actorUUID, actorId) {
    if (actorUUID) {
        const byUUID = fromUuidSync(actorUUID);
        if (byUUID) return byUUID;
    }
    if (actorId) {
        return game.actors.get(actorId) ?? null;
    }
    return null;
}

/**
 * Factory — called inside the tokenActionHudCoreApiReady hook.
 */
export function createRollHandler(coreModule) {
    return class SWSERollHandler extends coreModule.api.RollHandler {

        /**
         * Handle a HUD button click.
         * Inherited properties: this.actor, this.token, this.action,
         * this.isRightClick, this.isShift, this.isAlt, this.isCtrl
         */
        async handleActionClick(event) {
            const { actionType } = this.action.system ?? {};

            // Right-click → open item sheet (for item actions only)
            if (this.isRenderItem() && this.action.system?.itemId) {
                return this.renderItem(this.actor, this.action.system.itemId);
            }

            switch (actionType) {
                case ACTION_TYPE.ATTACK:       return this.#handleAttack();
                case ACTION_TYPE.SKILL:        return this.#handleSkill();
                case ACTION_TYPE.VARIABLE:     return this.#handleVariable();
                case ACTION_TYPE.ITEM:         return this.#handleItem();
                case ACTION_TYPE.EQUIP_TOGGLE: return this.#handleEquipToggle();
                case ACTION_TYPE.EFFECT:       return this.#handleEffect();
                case ACTION_TYPE.MODE_TOGGLE:  return this.#handleModeToggle();
                case ACTION_TYPE.ATTACK_MOD:   return this.#handleAttackMod();
                case ACTION_TYPE.UTILITY:      return this.#handleUtility();
                default:
                    console.warn(`[${MODULE_ID}] Unhandled action type: ${actionType}`);
            }
        }

        // ─── Attack ───────────────────────────────────────────────────────────

        async #handleAttack() {
            const { attackKey, actorUUID } = this.action.system;
            if (!attackKey || !actorUUID) return;

            // Collect any primed pre-attack modifiers from actor flags
            const actor   = fromUuidSync(actorUUID);
            const primed  = actor?.getFlag(MODULE_ID, PENDING_MODS_FLAG) ?? {};
            const changes = Object.values(primed).flat();   // [{key, value, mode}, ...]

            // Shift+click → full attack; plain click → single attack
            const type = this.isShift ? "FULL_ATTACK" : "SINGLE_ATTACK";
            await game.swse.makeAttack({ actorUUID, type, attackKeys: [attackKey], changes });

            // Auto-clear primed modifiers after the attack fires
            if (actor && Object.keys(primed).length) {
                await actor.unsetFlag(MODULE_ID, PENDING_MODS_FLAG);
            }
        }

        // ─── Weapon fire-mode toggle (Autofire, Burst, etc.) ─────────────────

        async #handleModeToggle() {
            const { modeSource, effectId, itemId, modeKey, actorId, actorUUID } = this.action.system;
            if (!itemId) return;

            const actor = resolveActor(actorUUID, actorId);
            if (!actor) {
                console.warn(`[${MODULE_ID}] #handleModeToggle: actor not found (UUID: ${actorUUID}, ID: ${actorId})`);
                return;
            }

            const item = actor.items.get(itemId);
            if (!item) {
                console.warn(`[${MODULE_ID}] #handleModeToggle: item not found (ID: ${itemId})`);
                return;
            }

            if (modeSource === "effect") {
                // Modern: toggle the Active Effect's disabled state on the weapon item
                const effect = item.effects?.get(effectId);
                if (!effect) {
                    console.warn(`[${MODULE_ID}] #handleModeToggle: effect not found (ID: ${effectId}) on item ${item.name}`);
                    return;
                }
                await effect.update({ disabled: !effect.disabled });
                // Foundry only fires updateActiveEffect (not updateItem/updateActor) for this,
                // so TAH Core won't auto-refresh — force it explicitly.
                Hooks.callAll("forceUpdateTokenActionHud");

            } else if (modeSource === "system") {
                // Legacy: toggle via item.system.modes[modeKey].isActive
                const modes   = foundry.utils.deepClone(item.system?.modes ?? {});
                const current = modes[modeKey];
                if (current) {
                    modes[modeKey] = { ...current, isActive: !current.isActive };
                    await item.update({ "system.modes": modes });
                    // item.update triggers updateItem → TAH Core auto-refreshes;
                    // force-call anyway for belt-and-suspenders consistency.
                    Hooks.callAll("forceUpdateTokenActionHud");
                }
            }
        }

        // ─── Pre-attack modifier toggle (Sneak Attack, Power Attack…) ────────

        async #handleAttackMod() {
            const { itemId, attackChanges, actorId, actorUUID } = this.action.system;
            if (!itemId) return;

            const actor = resolveActor(actorUUID, actorId);
            if (!actor) {
                console.warn(`[${MODULE_ID}] #handleAttackMod: actor not found (UUID: ${actorUUID}, ID: ${actorId})`);
                return;
            }

            const primed = foundry.utils.deepClone(
                actor.getFlag(MODULE_ID, PENDING_MODS_FLAG) ?? {}
            );

            if (primed[itemId]) {
                // Already primed — unprime it
                delete primed[itemId];
            } else {
                // Prime it: store the parsed changes keyed by item ID
                try {
                    primed[itemId] = JSON.parse(attackChanges);
                } catch {
                    console.warn(`[${MODULE_ID}] Could not parse attackChanges for ${itemId}`);
                    return;
                }
            }

            await actor.setFlag(MODULE_ID, PENDING_MODS_FLAG, primed);
            // setFlag → actor.update → updateActor hook fires → TAH auto-refreshes.
            // Force-call anyway to guarantee instant visual feedback.
            Hooks.callAll("forceUpdateTokenActionHud");
        }

        // ─── Skill / ability check roll ───────────────────────────────────────

        async #handleSkill() {
            const { variable, actorId, actorUUID } = this.action.system;
            if (!variable) return;
            // game.swse.rollVariable(id, variable) uses getActorFromId internally.
            // For linked actors, the world actor ID works directly.
            // For unlinked/synthetic tokens we try the token's actor ID via UUID first.
            const resolvedId = actorUUID
                ? (fromUuidSync(actorUUID)?.id ?? actorId)
                : actorId;
            if (!resolvedId) return;
            await game.swse.rollVariable(resolvedId, variable);
        }

        // ─── Generic variable roll ────────────────────────────────────────────

        async #handleVariable() {
            const { variable, actorId, actorUUID } = this.action.system;
            if (!variable) return;
            const resolvedId = actorUUID
                ? (fromUuidSync(actorUUID)?.id ?? actorId)
                : actorId;
            if (!resolvedId) return;
            await game.swse.rollVariable(resolvedId, variable);
        }

        // ─── Item use (talents, feats, force powers, traits, vehicle systems) ──

        async #handleItem() {
            const { itemId, actorId, actorUUID } = this.action.system;
            if (!itemId) return;

            const actor = resolveActor(actorUUID, actorId);
            if (!actor) {
                console.warn(`[${MODULE_ID}] #handleItem: actor not found (UUID: ${actorUUID}, ID: ${actorId})`);
                return;
            }
            const item = actor.items.get(itemId);
            if (!item) {
                console.warn(`[${MODULE_ID}] #handleItem: item not found (ID: ${itemId})`);
                return;
            }

            // Some items (e.g. force powers) have rollItem() that opens a dialog.
            if (typeof item.rollItem === "function") {
                const dialog = item.rollItem(actor);
                if (dialog?.render) {
                    dialog.render(true);
                    return;
                }
            }

            // Fallback: post a chat card
            const description = item.system?.description ?? "";
            const content = `
                <div class="swse-hud-card">
                    <div class="card-header flexrow" style="display:flex;align-items:center;gap:4px;">
                        <img src="${item.img}" title="${item.name}" width="36" height="36" style="border:none;"/>
                        <h3 style="margin:0;">${item.name}</h3>
                    </div>
                    ${description ? `<div class="card-content" style="margin-top:4px;">${description}</div>` : ""}
                </div>`;

            await ChatMessage.create({
                user:    game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor:  item.type.charAt(0).toUpperCase() + item.type.slice(1),
                content,
                sound:   CONFIG.sounds.notification
            });
        }

        // ─── Inventory: toggle equipped state ─────────────────────────────────

        async #handleEquipToggle() {
            const { itemId, actorId, actorUUID } = this.action.system;
            if (!itemId) return;

            const actor = resolveActor(actorUUID, actorId);
            if (!actor) {
                console.warn(`[${MODULE_ID}] #handleEquipToggle: actor not found (UUID: ${actorUUID}, ID: ${actorId})`);
                return;
            }
            const item = actor.items.get(itemId);
            if (!item) {
                console.warn(`[${MODULE_ID}] #handleEquipToggle: item not found (ID: ${itemId})`);
                return;
            }

            // SWSE uses string "equipped" / false; guard both cases
            const current = item.system?.equipped;
            const next    = (current === "equipped" || current === true) ? false : "equipped";

            await item.update({ "system.equipped": next });
            // item.update triggers updateItem → TAH Core auto-refreshes.
            // Force-call explicitly as belt-and-suspenders for synthetic token actors.
            Hooks.callAll("forceUpdateTokenActionHud");
        }

        // ─── Active Effect: toggle disabled ───────────────────────────────────

        async #handleEffect() {
            const { effectId, actorId, actorUUID } = this.action.system;
            if (!effectId) return;

            const actor = resolveActor(actorUUID, actorId);
            if (!actor) {
                console.warn(`[${MODULE_ID}] #handleEffect: actor not found (UUID: ${actorUUID}, ID: ${actorId})`);
                return;
            }
            const effect = actor.effects.get(effectId);
            if (!effect) {
                console.warn(`[${MODULE_ID}] #handleEffect: effect not found (ID: ${effectId})`);
                return;
            }

            await effect.update({ disabled: !effect.disabled });
            // Foundry fires updateActiveEffect, NOT updateActor, so TAH Core won't
            // auto-refresh the HUD — force it explicitly.
            Hooks.callAll("forceUpdateTokenActionHud");
        }

        // ─── Utility (initiative, rest, visibility, combat maneuvers) ─────────

        async #handleUtility() {
            const { utilityType, actorId, actorUUID, tokenUUID } = this.action.system;

            switch (utilityType) {

                // ── Roll Initiative ──────────────────────────────────────────
                case "initiative": {
                    const actor = actorUUID
                        ? (fromUuidSync(actorUUID) ?? game.actors.get(actorId))
                        : game.actors.get(actorId);
                    if (!actor) return;
                    await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
                    break;
                }

                // ── Token Visibility ─────────────────────────────────────────
                case "visibility": {
                    const tokenDoc = fromUuidSync(tokenUUID);
                    if (tokenDoc) await tokenDoc.update({ hidden: !tokenDoc.hidden });
                    break;
                }

                // ── Second Wind ──────────────────────────────────────────────
                case "secondWind": {
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;

                    const toggles = actor.system?.toggles?.secondWinds ?? {};
                    const entry   = Object.entries(toggles).find(([, used]) => !used);
                    if (!entry) {
                        ui.notifications.warn(
                            game.i18n.format("SWSE.TAH.Notifications.NoSecondWinds",
                                { name: actor.name })
                        );
                        return;
                    }

                    const maxHP  = actor.system.health.max ?? 0;
                    const conMod = actor.system.abilities?.con?.mod ?? 0;
                    const heal   = Math.floor(maxHP / 4) + conMod;
                    const curHP  = actor.system.health.value ?? 0;

                    const update = {};
                    update[`system.toggles.secondWinds.${entry[0]}`] = true;
                    update["system.health.value"] = Math.min(curHP + heal, maxHP);

                    await actor.update(update);
                    ui.notifications.info(
                        game.i18n.format("SWSE.TAH.Notifications.SecondWindUsed",
                            { name: actor.name, heal })
                    );
                    break;
                }

                // ── 8-Hour Rest ──────────────────────────────────────────────
                case "eightHourRest": {
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;

                    const count  = actor.system?.secondWinds ?? 0;
                    const update = {};
                    for (let i = 0; i < count; i++) {
                        update[`system.toggles.secondWinds.${i}`] = false;
                    }
                    update["system.health.value"] = actor.system.health.max ?? 0;

                    await actor.update(update);
                    ui.notifications.info(
                        game.i18n.format("SWSE.TAH.Notifications.EightHourRest",
                            { name: actor.name })
                    );
                    break;
                }

                // ── Recover ──────────────────────────────────────────────────
                // Each click increments a per-actor counter (stored in a flag).
                // On the 3rd click the counter resets and condition improves one step.
                case "recover": {
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;

                    const count = (actor.getFlag(MODULE_ID, RECOVER_FLAG) ?? 0) + 1;

                    if (count >= 3) {
                        const CONDITION_TRACK = ["0", "-1", "-2", "-5", "-10", "OUT"];
                        const CONDITION_LABELS = {
                            "0": "Normal", "-1": "Weakened", "-2": "Impaired",
                            "-5": "Injured", "-10": "Wounded", "OUT": "Defeated"
                        };
                        const cur = `${actor.condition ?? 0}`;
                        const idx = CONDITION_TRACK.indexOf(cur);

                        if (idx <= 0) {
                            // Already Normal — reset counter and notify
                            ui.notifications.info(
                                game.i18n.format("SWSE.TAH.Notifications.AlreadyNormal", { name: actor.name })
                            );
                        } else {
                            const newVal   = CONDITION_TRACK[Math.max(0, idx - 1)];
                            const newLabel = CONDITION_LABELS[newVal] ?? newVal;
                            await actor.setGroupedEffect("condition", newVal, true);
                            ui.notifications.info(
                                game.i18n.format("SWSE.TAH.Notifications.ConditionImproved",
                                    { name: actor.name, condition: newLabel })
                            );
                        }
                        await actor.setFlag(MODULE_ID, RECOVER_FLAG, 0);
                    } else {
                        await actor.setFlag(MODULE_ID, RECOVER_FLAG, count);
                    }
                    Hooks.callAll("forceUpdateTokenActionHud");
                    break;
                }

                // ── Condition Track ──────────────────────────────────────────
                // Left-click: worsen (step down track), Right-click: improve (step up)
                // We call setGroupedEffect directly so the async DB write can be awaited,
                // unlike the non-awaited setter path inside reduceCondition().
                case "condition": {
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;
                    const CONDITION_TRACK = ["0", "-1", "-2", "-5", "-10", "OUT"];
                    const cur  = `${actor.condition ?? 0}`;
                    const idx  = CONDITION_TRACK.indexOf(cur);
                    const step = this.isRightClick ? -1 : 1;   // right = improve
                    const nxt  = CONDITION_TRACK[Math.max(0, Math.min(5, (idx === -1 ? 0 : idx) + step))];
                    await actor.setGroupedEffect("condition", nxt, true);
                    Hooks.callAll("forceUpdateTokenActionHud");
                    break;
                }

                // ── Character Resource (Force / Destiny / Dark Side) ─────────
                // Left-click: reduce by 1, Right-click: increase by 1
                case "resource": {
                    const { resourcePath, resourceMin = 0 } = this.action.system;
                    if (!resourcePath) return;
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;
                    // foundry.utils.getProperty traverses dotted paths on the actor object
                    let current = foundry.utils.getProperty(actor, resourcePath) ?? 0;
                    // Handle the SWSE forcePoints getter that mutates the value to an object
                    if (typeof current === "object" && current !== null) current = current.quantity ?? 0;
                    current = Number(current) || 0;
                    const delta = this.isRightClick ? 1 : -1;
                    const next  = Math.max(Number(resourceMin), current + delta);
                    await actor.update({ [resourcePath]: next });
                    Hooks.callAll("forceUpdateTokenActionHud");
                    break;
                }

                // ── Defense value card ───────────────────────────────────────
                case "defenseCard": {
                    const { defenseLabel, defenseValue } = this.action.system;
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;
                    const content = `
                        <div class="swse-hud-card">
                            <div class="card-header flexrow" style="display:flex;align-items:center;gap:6px;">
                                <h3 style="margin:0;">${defenseLabel}</h3>
                                <span style="font-size:1.1em;font-weight:bold;">${defenseValue}</span>
                            </div>
                        </div>`;
                    await ChatMessage.create({
                        user:    game.user.id,
                        speaker: ChatMessage.getSpeaker({ actor }),
                        flavor:  "Defense",
                        content,
                        sound:   CONFIG.sounds.notification
                    });
                    break;
                }

                // ── Combat Maneuvers (post chat card) ────────────────────────
                case "totalDefense":
                case "fightDefensively":
                case "aidAnother":
                case "charge":
                case "withdraw":
                case "delay":
                case "readyAction": {
                    const actor = resolveActor(actorUUID, actorId);
                    if (!actor) return;
                    await this.#postManeuverCard(actor, utilityType);
                    break;
                }
            }
        }

        // ─── Combat maneuver chat card ─────────────────────────────────────────

        async #postManeuverCard(actor, maneuverType) {
            const MANEUVER_DATA = {
                totalDefense: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.TotalDefense"),
                    action: "Standard Action",
                    rule:   "Until the start of your next turn, gain +5 to Reflex Defense. You cannot attack or use skills this turn."
                },
                fightDefensively: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.FightDefensively"),
                    action: "Standard Action",
                    rule:   "Take a −2 penalty to all attacks until the start of your next turn. In return, gain a +2 bonus to Reflex Defense for the same duration."
                },
                aidAnother: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.AidAnother"),
                    action: "Standard Action",
                    rule:   "Make a DC 10 skill check or attack roll to grant an ally either a +2 bonus to their next attack roll or +2 to one defense until your next turn."
                },
                charge: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.Charge"),
                    action: "Full-Round Action",
                    rule:   "Move up to double your speed in a straight line toward a target, then make a single melee attack at a −2 penalty. You are flat-footed until the start of your next turn."
                },
                withdraw: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.Withdraw"),
                    action: "Full-Round Action",
                    rule:   "Move up to twice your speed. The first square you leave does not provoke attacks of opportunity. You cannot attack during this action."
                },
                delay: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.Delay"),
                    action: "Free Action",
                    rule:   "Voluntarily move to a lower initiative count. You can choose a new initiative value equal to or less than your current one and act there instead."
                },
                readyAction: {
                    name:   game.i18n.localize("SWSE.TAH.Maneuvers.ReadyAction"),
                    action: "Standard Action",
                    rule:   "Declare a trigger and an action. Until the start of your next turn, interrupt the triggering event to take the declared action. Your initiative changes to just before the trigger."
                },
            };

            const data = MANEUVER_DATA[maneuverType];
            if (!data) return;

            const content = `
                <div class="swse-hud-card">
                    <div class="card-header flexrow" style="display:flex;align-items:center;gap:6px;">
                        <h3 style="margin:0;">${data.name}</h3>
                        <span style="font-size:0.85em;opacity:0.7;">[${data.action}]</span>
                    </div>
                    <div class="card-content" style="margin-top:4px;">${data.rule}</div>
                </div>`;

            await ChatMessage.create({
                user:    game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor:  "Combat Action",
                content,
                sound:   CONFIG.sounds.notification
            });
        }
    };
}

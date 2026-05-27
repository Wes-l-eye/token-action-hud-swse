import { ACTION_TYPE } from "./constants.js";

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
                case ACTION_TYPE.ATTACK:   return this.#handleAttack();
                case ACTION_TYPE.SKILL:    return this.#handleSkill();
                case ACTION_TYPE.VARIABLE: return this.#handleVariable();
                case ACTION_TYPE.ITEM:     return this.#handleItem();
                case ACTION_TYPE.UTILITY:  return this.#handleUtility();
                default:
                    console.warn(`[token-action-hud-swse] Unhandled action type: ${actionType}`);
            }
        }

        // ─── Attack ───────────────────────────────────────────────────────────

        async #handleAttack() {
            const { attackKey, actorUUID } = this.action.system;
            if (!attackKey || !actorUUID) return;

            // Shift+click triggers a full attack; plain click triggers single
            const type = this.isShift ? "FULL_ATTACK" : "SINGLE_ATTACK";

            await game.swse.makeAttack({ actorUUID, type, attackKeys: [attackKey] });
        }

        // ─── Skill roll ───────────────────────────────────────────────────────

        async #handleSkill() {
            const { variable, actorId } = this.action.system;
            if (!variable || !actorId) return;
            await game.swse.rollVariable(actorId, variable);
        }

        // ─── Generic variable roll (defenses) ─────────────────────────────────

        async #handleVariable() {
            const { variable, actorId } = this.action.system;
            if (!variable || !actorId) return;
            await game.swse.rollVariable(actorId, variable);
        }

        // ─── Item use (force powers, talents, feats, traits, vehicle systems) ──

        async #handleItem() {
            const { itemId, actorId } = this.action.system;
            if (!itemId || !actorId) return;

            const actor = game.actors.get(actorId);
            if (!actor) return;
            const item = actor.items.get(itemId);
            if (!item) return;

            // Some item types (e.g. force powers) have a rollItem that opens a
            // dialog.  The base SWSEItem.rollItem() returns undefined, so guard
            // against that before calling .render().
            if (typeof item.rollItem === "function") {
                const dialog = item.rollItem(actor);
                if (dialog?.render) {
                    dialog.render(true);
                    return;
                }
            }

            // Fallback: post a chat card with the item name + description.
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

        // ─── Utility ──────────────────────────────────────────────────────────

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

                // ── Toggle Token Visibility ──────────────────────────────────
                case "visibility": {
                    const tokenDoc = fromUuidSync(tokenUUID);
                    if (tokenDoc) {
                        await tokenDoc.update({ hidden: !tokenDoc.hidden });
                    }
                    break;
                }

                // ── Second Wind ──────────────────────────────────────────────
                // Heals 1/4 max HP + CON modifier (SWSE core rules).
                // Marks one of the daily-use toggles as spent.
                case "secondWind": {
                    const actor = game.actors.get(actorId);
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
                // Heals to full HP and resets all second wind uses.
                case "eightHourRest": {
                    const actor = game.actors.get(actorId);
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
            }
        }
    };
}

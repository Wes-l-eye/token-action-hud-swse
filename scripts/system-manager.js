import { buildDefaults } from "./defaults.js";

/**
 * Factory — called inside the tokenActionHudCoreApiReady hook so we can
 * extend coreModule.api.SystemManager.
 *
 * @param {object}  coreModule   The TAH Core module passed by the hook.
 * @param {class}   ActionHandler  Already-created system ActionHandler class.
 * @param {class}   RollHandler    Already-created system RollHandler class.
 */
export function createSystemManager(coreModule, ActionHandler, RollHandler) {
    return class SWSESystemManager extends coreModule.api.SystemManager {

        /** @override */
        getActionHandler() {
            return new ActionHandler();
        }

        /** @override */
        getAvailableRollHandlers() {
            return { core: "Core SWSE" };
        }

        /** @override */
        getRollHandler(_rollHandlerId) {
            return new RollHandler();
        }

        /** @override */
        registerSettings(_onChangeFunction) {
            // Placeholder for future per-system settings
        }

        /** @override */
        async registerDefaults() {
            return buildDefaults();
        }
    };
}

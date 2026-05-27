/**
 * Token Action HUD — Star Wars Saga Edition
 * Entry point. Waits for TAH Core to be ready, then wires up all three
 * system classes (ActionHandler, RollHandler, SystemManager) and registers
 * the module API so TAH Core can pick it up.
 */

import { createActionHandler } from "./action-handler.js";
import { createRollHandler }   from "./roll-handler.js";
import { createSystemManager } from "./system-manager.js";
import { MODULE, REQUIRED_CORE_MODULE_VERSION } from "./constants.js";

Hooks.once("tokenActionHudCoreApiReady", async (coreModule) => {
    // Build classes that extend TAH Core base classes
    const ActionHandler = createActionHandler(coreModule);
    const RollHandler   = createRollHandler(coreModule);
    const SystemManager = createSystemManager(coreModule, ActionHandler, RollHandler);

    // Expose the module API — TAH Core reads this via game.modules.get(id).api
    const mod = game.modules.get(MODULE.ID);
    if (!mod) {
        return console.error(`[${MODULE.NAME}] Module "${MODULE.ID}" not found.`);
    }

    mod.api = {
        requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION,
        SystemManager
    };

    // Signal TAH Core that the system handler is ready
    Hooks.call("tokenActionHudSystemReady", mod);
    console.log(`%c[${MODULE.NAME}]%c Registered with Token Action HUD Core.`,
        "color:#4CAF50;font-weight:bold", "");
});

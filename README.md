# Token Action HUD — Star Wars Saga Edition

A [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core) system module for the [Star Wars Saga Edition](https://github.com/kypvalanx/Foundry-VTT-StarWars-SagaEdition) Foundry VTT system.

Puts a repositionable HUD above selected tokens so you can roll skills, make attacks, use powers, and manage common actions without ever opening the character sheet.

---

## Features

| Tab | Contents |
|---|---|
| **Combat** | Weapon attacks (shift-click for full attack), Defense scores with live values |
| **Skills** | All trained/untrained skills + ability checks, Initiative sorted first |
| **Powers & Talents** | Force Powers, Talents, Feats, Traits — click to post to chat |
| **Vehicle** | Vehicle weapon attacks, Vehicle systems |
| **Utility** | Roll Initiative, Second Wind (with remaining uses), 8-Hour Rest, GM token visibility toggle |

### Highlights
- **Hover tooltips** on feats, talents, force powers, traits, and vehicle systems show the item description
- **Second Wind** button shows remaining uses (e.g. "Second Wind 1/2"), heals ¼ max HP + CON modifier, and marks the use as spent
- **8-Hour Rest** restores full HP and resets all Second Wind uses
- **Right-click** any item action to open its sheet

---

## Requirements

| Dependency | Minimum Version |
|---|---|
| Foundry VTT | 13 |
| Star Wars Saga Edition system | 13.0.0 |
| Token Action HUD Core | 2.0.0 |

---

## Installation

### Via Foundry Module Manager (recommended)
Paste this manifest URL into Foundry's **Add-on Modules → Install Module** field:

```
https://github.com/Wes-l-eye/token-action-hud-swse/releases/latest/download/module.json
```

### Manual
1. Download the latest release zip.
2. Unzip into your `<Foundry Data>/modules/` folder so the path is `.../modules/token-action-hud-swse/module.json`.
3. Restart Foundry and enable the module in your world.

---

## Compatibility

Tested with Foundry VTT v13 and SWSE system v13.x. Token Action HUD Core v2.0.x required.

---

## Contributing

This module is community-maintained. Pull requests and issues are welcome.

The SWSE system lives at [kypvalanx/Foundry-VTT-StarWars-SagaEdition](https://github.com/kypvalanx/Foundry-VTT-StarWars-SagaEdition).

---

## License

[MIT](LICENSE)

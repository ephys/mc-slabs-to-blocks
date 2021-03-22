# Modded Slabs To Block datapack

This repository contains the source code for the Slabs to Block datapack.

This datapack adds recipes to craft two slabs back into the full block.

Check the release tab for public releases.

*This datapack does not include vanilla slab recipes, use [Vanilla Tweaks](https://vanillatweaks.net) for those*

## How to add support for new slabs and stairs ?

Follow the following steps:

- Fork & Clone this repository.
- Add the jar of the mod you want to support in the mods directory.
- Run `npm run gen-json`.
- Commit, push and send us a PR with the newly generated recipe files.

## I did all that, but the recipes did not generate

That can be caused by a few reasons,  
**for slabs**:

- The mod did not tag the slabs with the `minecraft:slabs` item tag.
- The mod is missing one of these two recipes:
  - 3 full blocks for 6 slabs (crafting table, shaped).
  - 1 full block for 2 slabs (stone-cutter).

**for stairs**:

- The mod did not tag the slabs with the `minecraft:stairs` item tag.
- The mod is missing the following recipe
  - 6 full blocks for 4 stairs (crafting table, shaped like a stair).

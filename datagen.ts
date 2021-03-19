import fs from 'fs/promises';
import path from 'path';
import * as Zip from 'jszip';
import assert from 'assert';

const modsFolder = path.join(__dirname, 'mods');

(async () => {
  const allSlabs = new Set<string>();
  const slabToBlock = new Map<string, string>();
  const mods = await fs.readdir(modsFolder);

  for (const modFileName of mods) {
    const zipBuffer = await fs.readFile(path.join(modsFolder, modFileName));
    const zip = await Zip.loadAsync(zipBuffer);

    if (!zip.files['data/minecraft/tags/items/slabs.json']) {
      console.error(`slabs tag not found for mod ${modFileName}`);
      continue;
    }

    const slabTagDeclaration = JSON.parse(await zip.file('data/minecraft/tags/items/slabs.json').async('string'));

    assert(slabTagDeclaration.replace !== 'true');

    for (const slabId of slabTagDeclaration.values) {
      allSlabs.add(slabId);
    }

    // find all valid crafting recipe declaration
    const recipeFilePaths = Object.keys(zip.files).filter(file => /^data\/[^/]+\/recipes\/.+\.json$/.test(file));

    for (const recipeFilePath of recipeFilePaths) {
      const recipeFile = await zip.file(recipeFilePath).async('string');
      const recipe = JSON.parse(recipeFile);

      const map = processSlabRecipe(recipe);
      if (map == null) {
        continue;
      }

      if (slabToBlock.has(map.slabId) && slabToBlock.get(map.slabId) !== map.blockId) {
        // ignore stonecutting warnings
        // some items can be stonecut into two different slab types
        if (recipe.type !== 'minecraft:stonecutting') {
          console.error('Slab ' + map.slabId + ' is already mapped to ' + slabToBlock.get(map.slabId), ' but another recipe maps it to ' + map.blockId);
        }

        continue;
      }

      slabToBlock.set(map.slabId, map.blockId);
    }
  }

  for (const slabId of allSlabs) {
    const blockId = slabToBlock.get(slabId);

    if (!blockId) {
      console.error(`Could not find matching block for ${slabId}`);
      continue;
    }

    const mods = [];
    const slabMod = getModId(slabId);
    if (slabMod !== 'minecraft') {
      mods.push(slabMod);
    }

    const blockMod = getModId(blockId);
    if (blockMod !== 'minecraft' && !mods.includes(blockMod)) {
      mods.push(blockMod);
    }

    const recipe = {
      type: 'minecraft:crafting_shaped',
      group: 'slab_to_block',
      pattern: [
        '##',
      ],
      key: {
        '#': {
          'item': slabId,
        },
      },
      result: {
        'item': blockId,
        'count': 1,
      },
      conditions: mods.length === 0 ? undefined : mods.map(mod => {
        return {
          type: 'forge:mod_loaded',
          modid: mod,
        };
      }),
    };

    const json = JSON.stringify(recipe, null, 2);
    const recipeName = slabId.replace(':', '__') + '.json';

    await fs.writeFile(path.join(__dirname, 'data', 'slab-to-block', 'recipes', recipeName), json);
  }
})();

function getModId(blockId: string) {
  const separatorIndex = blockId.indexOf(':');
  return blockId.substr(0, separatorIndex);
}

function processSlabRecipe(recipe: TRecipe): { slabId: string, blockId: string } | null {
  if (recipe.type === 'minecraft:crafting_shaped') {
    return processCraftingSlabRecipe(recipe as TShapedCraftingRecipe);
  }

  if (recipe.type === 'minecraft:stonecutting') {
    return processStoneCutterSlabRecipe(recipe as TStoneCuttingRecipe);
  }

  return null;
}

function processStoneCutterSlabRecipe(recipe: TStoneCuttingRecipe): { slabId: string, blockId: string } | null {
  if (recipe.count !== 2) {
    return null;
  }

  if (!recipe.ingredient.item) {
    return null;
  }

  return {
    slabId: recipe.result,
    blockId: recipe.ingredient.item,
  };
}

function processCraftingSlabRecipe(recipe: TShapedCraftingRecipe): { slabId: string, blockId: string } | null {
  if (recipe.type !== 'minecraft:crafting_shaped') {
    return null;
  }

  if (!isSlabPattern(recipe.pattern)) {
    return null;
  }

  const blockId = recipe.key[Object.keys(recipe.key)[0]].item;
  if (!blockId) {
    return null;
  }

  if (recipe.result.count !== 6) {
    return null;
  }

  const slabId = recipe.result.item;

  return { blockId, slabId };
}

function isSlabPattern(pattern: Array<string>): boolean {
  if (pattern.length !== 1 || pattern[0].length !== 3) {
    return false;
  }

  // ensure all 3 items are the same
  let char = pattern[0].charAt(0);
  for (let i = 1; i < 3; i++) {
    if (pattern[0].charAt(i) !== char) {
      return false;
    }
  }

  return true;
}

type TRecipe = {
  type: string,
};

type TStoneCuttingRecipe = {
  type: 'minecraft:stonecutting',
  ingredient: { item: string },
  result: string,
  count: number,
};

type TShapedCraftingRecipe = {
  type: 'minecraft:crafting_shaped',
  pattern: Array<string>,
  group: string,
  key: { [key: string]: { item: string } },
  result: { item: string, count: number },
};

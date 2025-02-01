import fs from 'fs/promises';
import path from 'path';
import * as Zip from 'jszip';
import assert from 'assert';
import JSZip from 'jszip';

const modsFolder = path.join(__dirname, 'mods');

const slabsJsonPath = 'data/minecraft/tags/items/slabs.json';
const stairsJsonPath = 'data/minecraft/tags/items/stairs.json';

(async () => {
  const allSlabs = new Set<string>();
  const allStairs = new Set<string>();

  const slabToBlock = new Map<string, string>([
    ['botania:metamorphic_mountain_bricks_slab', 'botania:metamorphic_mountain_bricks'],
    ['botania:metamorphic_plains_bricks_slab', 'botania:metamorphic_plains_bricks'],
    ['quark:andesite_bricks_slab', 'quark:andesite_bricks'],
    ['quark:diorite_bricks_slab', 'quark:diorite_bricks'],
    ['quark:granite_bricks_slab', 'quark:granite_bricks'],
    ['quark:jasper_bricks_slab', 'quark:jasper_bricks'],
    ['quark:limestone_bricks_slab', 'quark:limestone_bricks'],
    ['quark:myalite_bricks_slab', 'quark:myalite_bricks'],
    ['quark:shale_bricks_slab', 'quark:shale_bricks'],
  ]);
  const stairToBlock = new Map<string, string>();
  const stairRecipeJsonPaths = new Map<string, TShapedCraftingRecipe>();

  const mods = await fs.readdir(modsFolder);

  for (const modFileName of mods) {
    if (modFileName === '.gitkeep') {
      continue;
    }

    const zipBuffer = await fs.readFile(path.join(modsFolder, modFileName));
    const zip = await Zip.loadAsync(zipBuffer);

    const declaresSlabs = Boolean(zip.files[slabsJsonPath]);
    const declaresStairs = Boolean(zip.files[stairsJsonPath]);

    if (!declaresSlabs) {
      console.warn(`minecraft:slabs item tag not found for mod ${modFileName}`);
    } else {
      addAll(allSlabs, await extractMcTagValues(zip, slabsJsonPath));
    }

    if (!declaresStairs) {
      console.warn(`minecraft:stairs item tag not found for mod ${modFileName}`);
    } else {
      addAll(allStairs, await extractMcTagValues(zip, stairsJsonPath));
    }

    if (!declaresStairs && !declaresSlabs) {
      continue;
    }

    // find all valid crafting recipe declaration
    const recipeFilePaths = Object.keys(zip.files).filter(file => /^data\/[^/]+\/recipes\/.+\.json$/.test(file));

    for (const recipeFilePath of recipeFilePaths) {
      const recipeFile = await zip.file(recipeFilePath).async('string');
      const recipe = JSON.parse(recipeFile);

      const stairMap = processStairRecipe(recipe);
      if (stairMap != null) {
        stairToBlock.set(stairMap.stairId, stairMap.blockId);
        stairRecipeJsonPaths.set(recipeFilePath, recipe);

        continue;
      }

      const slabMap = processSlabRecipe(recipe);
      if (slabMap != null) {
        if (slabToBlock.has(slabMap.slabId) && slabToBlock.get(slabMap.slabId) !== slabMap.blockId) {
          // ignore stonecutting warnings
          // some items can be stonecut into two different slab types
          if (recipe.type !== 'minecraft:stonecutting') {
            console.error('Slab ' + slabMap.slabId + ' is already mapped to ' + slabToBlock.get(slabMap.slabId), ' but another recipe maps it to ' + slabMap.blockId);
          }

          continue;
        }

        slabToBlock.set(slabMap.slabId, slabMap.blockId);
      }
    }
  }

  // write slabs to block recipe files
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
      group: 'slabs_to_blocks',
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

    await fs.writeFile(path.join(__dirname, 'back_to_block_datapack', 'data', 'modded_slabs_stairs_to_blocks', 'recipes', 'slabs_to_blocks', recipeName), json);
  }

  // write stairs to block recipe files
  for (const stairId of allStairs) {
    const blockId = stairToBlock.get(stairId);

    if (!blockId) {
      console.error(`Could not find matching block for ${stairId}`);
      continue;
    }

    const mods = [];
    const stairMod = getModId(stairId);
    if (stairMod !== 'minecraft') {
      mods.push(stairMod);
    }

    const blockMod = getModId(blockId);
    if (blockMod !== 'minecraft' && !mods.includes(blockMod)) {
      mods.push(blockMod);
    }

    const recipe = {
      type: 'minecraft:crafting_shaped',
      group: 'stairs_to_blocks',
      pattern: [
        '##',
        '##',
      ],
      key: {
        '#': {
          'item': stairId,
        },
      },
      result: {
        'item': blockId,
        'count': 3,
      },
      conditions: mods.length === 0 ? undefined : mods.map(mod => {
        return {
          type: 'forge:mod_loaded',
          modid: mod,
        };
      }),
    };

    const json = JSON.stringify(recipe, null, 2);
    const recipeName = stairId.replace(':', '__') + '.json';

    await fs.writeFile(path.join(__dirname, 'back_to_block_datapack', 'data', 'modded_slabs_stairs_to_blocks', 'recipes', 'stairs_to_blocks', recipeName), json);
  }

  // generate 6 blocks to 8 stairs recipes
  for (const [recipePath, recipe] of stairRecipeJsonPaths.entries()) {
    recipe.result.count = 8;

    const outputPath = path.join(__dirname, 'more_stairs_datapack', recipePath);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(recipe, null, 2));
  }
})();

async function extractMcTagValues(zip: JSZip, tagFilePath: string): Promise<Array<string>> {
  const slabTagDeclaration = JSON.parse(await zip.file(tagFilePath).async('string'));

  assert(slabTagDeclaration.replace !== 'true');

  const tags = await Promise.all(slabTagDeclaration.values.map(async (value: string) => {
    if (!value.startsWith('#')) {
      return value;
    }

    const [modName, tagName] = value.substr(1).split(':');

    return extractMcTagValues(zip, `data/${modName}/tags/items/${tagName}.json`);
  }));

  return tags.flat();
}

function addAll<T>(to: Set<T>, from: Iterable<T>): void {
  for (const item of from) {
    to.add(item);
  }
}

function getModId(blockId: string) {
  const separatorIndex = blockId.indexOf(':');
  return blockId.substr(0, separatorIndex);
}

function processStairRecipe(recipe: TShapedCraftingRecipe): { stairId: string, blockId: string } | null {
  if (recipe.type !== 'minecraft:crafting_shaped') {
    return null;
  }

  if (!isStairPattern(recipe.pattern) && !isFlippedStairPattern(recipe.pattern)) {
    return null;
  }

  const blockId = recipe.key[Object.keys(recipe.key)[0]].item;
  if (!blockId) {
    return null;
  }

  if (recipe.result.count !== 4) {
    return null;
  }

  const stairId = recipe.result.item;

  return { stairId, blockId };
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

/**
 * @returns true if pattern is
 * "#  "
 * "## "
 * "###"
 * @param {Array<string>} pattern
 */
function isStairPattern(pattern: Array<string>): boolean {
  if (pattern.length !== 3) {
    return false;
  }

  const char = pattern[0].charAt(0);
  if (char === ' ') {
    return false;
  }

  if (pattern[0] !== `${char}  ` || pattern[1] !== `${char}${char} ` || pattern[2] !== `${char}${char}${char}`) {
    return false;
  }

  return true;
}

function isFlippedStairPattern(pattern: Array<string>): boolean {
  if (pattern.length !== 3) {
    return false;
  }

  const char = pattern[0].charAt(2);
  if (char === ' ') {
    return false;
  }

  if (pattern[0] !== `  ${char}` || pattern[1] !== ` ${char}${char}` || pattern[2] !== `${char}${char}${char}`) {
    return false;
  }

  return true;
}

/**
 * @returns true if pattern is "##"
 * @param {Array<string>} pattern
 */
function isSlabPattern(pattern: Array<string>): boolean {
  if (pattern.length !== 1 || pattern[0].length !== 3) {
    return false;
  }

  // ensure all 3 items are the same
  const char = pattern[0].charAt(0);
  if (char === ' ') {
    return false;
  }

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

#!/usr/bin/env bash

set -e

cd back_to_block_datapack
zip ../modded-slab-stairs-to-block-datapack.zip -r .

cd ../more_stairs_datapack
zip ../modded-more-stairs-per-craft-datapack.zip -r .
